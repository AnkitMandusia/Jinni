"""Paytm Payment Gateway integration for one-time food/grocery orders.

Secrets remain server-side. The mobile app only receives the txnToken and
merchant MID needed by Paytm's All-in-One SDK.
"""
from __future__ import annotations

import json
import logging
import secrets
import traceback
from decimal import Decimal
from typing import Any, Dict, Optional
from uuid import UUID

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import JSONResponse
from paytmchecksum import PaytmChecksum
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.dependencies import get_current_active_user
from app.modules.coupons.router import Coupon, CouponRedemption
from app.modules.orders.models import Order, PaymentMethod, PaymentStatus
from app.modules.users.models import User

logger = logging.getLogger("app.payments.paytm")

router = APIRouter(prefix="/payments/paytm", tags=["payments"])


def _parse_order_id(raw: str) -> UUID:
    """Malformed path order id → clean 400 (not raw pydantic UUID noise)."""
    try:
        return UUID(str(raw))
    except (ValueError, AttributeError, TypeError):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Could not start payment: the order was not created correctly. Please go back and place the order again.",
        )


def _mid() -> str:
    return (settings.PAYTM_MERCHANT_ID or "").strip()


def _key() -> str:
    # Trailing/leading whitespace in .env is a common cause of resultCode 2005.
    return (settings.PAYTM_MERCHANT_KEY or "").strip()


def _website() -> str:
    name = (settings.PAYTM_WEBSITE_NAME or "").strip()
    if name:
        return name
    return "WEBSTAGING" if (settings.PAYTM_ENVIRONMENT or "staging").lower() != "production" else "DEFAULT"


def _enabled() -> bool:
    return bool(_mid() and _key())


def _domain() -> str:
    # Classic hosts from Paytm Initiate Transaction docs.
    if (settings.PAYTM_ENVIRONMENT or "staging").lower() != "production":
        return "https://securegw-stage.paytm.in"
    return "https://securegw.paytm.in"


def _amount(value: Decimal) -> str:
    return f"{Decimal(value):.2f}"


def _new_reference(order: Order) -> str:
    # Paytm order IDs are merchant-generated, unique and <= 50 chars.
    return f"PTM-{order.order_number}-{secrets.token_hex(3).upper()}"


def _sanitize_paytm_response(data: Any) -> Any:
    """Log-safe copy: never include merchant key; trim long tokens."""
    if not isinstance(data, dict):
        return data
    out: Dict[str, Any] = {}
    for k, v in data.items():
        lk = str(k).lower()
        if lk in ("signature", "checksumhash", "checksum"):
            out[k] = "<redacted>"
        elif lk in ("txntoken", "txn_token") and isinstance(v, str) and len(v) > 12:
            out[k] = v[:6] + "…" + v[-4:]
        elif isinstance(v, dict):
            out[k] = _sanitize_paytm_response(v)
        else:
            out[k] = v
    return out


async def _paytm_post(path: str, body: Dict[str, Any]) -> Dict[str, Any]:
    """Sign body exactly like Paytm's official Python sample and POST raw JSON.

    Official pattern (Paytm docs):
        checksum = PaytmChecksum.generateSignature(json.dumps(body), key)
        payload = {"body": body, "head": {"signature": checksum}}
        requests.post(url, data=json.dumps(payload), headers={"Content-type": "application/json"})

    Using httpx `json=` re-serializes the payload and can diverge from the string that
    was signed. Always sign the body JSON string, then POST via `content=`.
    """
    if not _enabled():
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Paytm staging credentials are not configured",
        )

    mid = _mid()
    key = _key()
    domain = _domain()
    url = f"{domain}{path}"

    # Match official sample: default json.dumps (space after : and ,).
    body_json = json.dumps(body)
    try:
        signature = PaytmChecksum.generateSignature(body_json, key)
    except Exception as exc:
        logger.exception("Paytm checksum generation failed")
        raise HTTPException(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            f"Paytm checksum generation failed: {exc.__class__.__name__}: {exc}",
        ) from exc

    payload = {"body": body, "head": {"signature": signature}}
    post_data = json.dumps(payload)

    logger.info(
        "Paytm request domain=%s path=%s mid_suffix=%s key_len=%d website=%s body_keys=%s",
        domain,
        path.split("?")[0],
        mid[-6:] if len(mid) >= 6 else mid,
        len(key),
        body.get("websiteName"),
        sorted(body.keys()),
    )

    try:
        async with httpx.AsyncClient(timeout=25.0) as client:
            response = await client.post(
                url,
                content=post_data.encode("utf-8"),
                headers={"Content-Type": "application/json"},
            )
    except httpx.RequestError as exc:
        logger.exception("Paytm HTTP transport error url=%s", url)
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            f"Could not reach Paytm gateway ({domain}): {exc.__class__.__name__}: {exc}",
        ) from exc

    raw_text = response.text
    try:
        data = response.json()
    except Exception:
        logger.error(
            "Paytm non-JSON response HTTP %s body=%s",
            response.status_code,
            raw_text[:500],
        )
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            f"Paytm returned non-JSON (HTTP {response.status_code}): {raw_text[:240]}",
        )

    logger.info(
        "Paytm response HTTP %s sanitized=%s",
        response.status_code,
        json.dumps(_sanitize_paytm_response(data), default=str)[:800],
    )

    info = (data.get("body") or {}).get("resultInfo") or {}
    result_status = str(info.get("resultStatus") or "")
    result_code = str(info.get("resultCode") or "")
    result_msg = str(info.get("resultMsg") or "")

    if response.status_code >= 400:
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            f"Paytm gateway HTTP {response.status_code} [{result_code}]: {result_msg or raw_text[:240]}",
        )

    # Business failure still often returns HTTP 200 with resultStatus F
    if result_status.upper() in ("F", "TXN_FAILURE", "FAILURE") and not (
        data.get("body") or {}
    ).get("txnToken"):
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            f"Paytm rejected request [{result_code}]: {result_msg or 'Unknown gateway error'}. "
            f"If code is 2005, merchant key does not match MID or checksum body serialization is wrong. "
            f"If code is 239/501, enable Initiate Transaction for this staging MID in Paytm dashboard.",
        )

    return data


async def _fetch_status(paytm_order_id: str) -> Dict[str, Any]:
    body = {"mid": _mid(), "orderId": paytm_order_id}
    return await _paytm_post("/v3/order/status", body)


async def _apply_status(
    db: AsyncSession,
    order: Order,
    result: Dict[str, Any],
    *,
    verify_amount: bool = True,
) -> str:
    body = result.get("body") or {}
    signature = (result.get("head") or {}).get("signature")
    if not signature or not PaytmChecksum.verifySignature(body, _key(), signature):
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Invalid Paytm status signature")
    info = body.get("resultInfo") or {}
    status_value = str(info.get("resultStatus") or "PENDING")
    txn_amount = body.get("txnAmount")

    if verify_amount and status_value == "TXN_SUCCESS" and txn_amount is not None:
        if Decimal(str(txn_amount)) != Decimal(str(order.total_amount)):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Paytm amount mismatch")

    if status_value == "TXN_SUCCESS":
        order.payment_status = PaymentStatus.PAID.value
        order.payment_id = body.get("txnId") or order.payment_id
        if order.coupon_code and order.discount and Decimal(str(order.discount)) > 0:
            existing = (
                await db.execute(
                    select(CouponRedemption).where(CouponRedemption.order_id == order.id)
                )
            ).scalar_one_or_none()
            if not existing:
                coupon = (
                    await db.execute(select(Coupon).where(Coupon.code == order.coupon_code))
                ).scalar_one_or_none()
                if coupon:
                    db.add(
                        CouponRedemption(
                            coupon_id=coupon.id,
                            user_id=order.customer_id,
                            order_id=order.id,
                            discount_amount=order.discount,
                        )
                    )
                    coupon.used_count = (coupon.used_count or 0) + 1
    elif status_value == "TXN_FAILURE":
        order.payment_status = PaymentStatus.FAILED.value
        order.payment_id = body.get("txnId") or order.payment_id
    else:
        order.payment_status = PaymentStatus.PENDING.value

    await db.commit()
    return status_value


@router.post("/initiate/{order_id}")
async def initiate_paytm_payment(
    order_id: str,
    user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a Paytm transaction token for an existing online order (food/grocery)."""
    try:
        if user.role != "customer":
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Only customers can pay for orders")
        parsed_order_id = _parse_order_id(order_id)
        result = await db.execute(select(Order).where(Order.id == parsed_order_id))
        order = result.scalar_one_or_none()
        if not order or order.customer_id != user.id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Order not found")
        if order.order_type not in ("food", "grocery"):
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                "Paytm is not available for this order type yet",
            )
        if order.payment_method != PaymentMethod.ONLINE.value:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                "Order is not an online payment order",
            )
        if order.payment_status == PaymentStatus.PAID.value:
            return {"already_paid": True, "orderId": str(order.id)}
        if not _enabled():
            raise HTTPException(
                status.HTTP_503_SERVICE_UNAVAILABLE,
                "Paytm staging credentials are not configured",
            )

        if not order.payment_reference:
            order.payment_reference = _new_reference(order)
            await db.commit()
            await db.refresh(order)

        is_staging = (settings.PAYTM_ENVIRONMENT or "staging").lower() != "production"
        official_sdk_callback = (
            f"{_domain()}/theia/paytmCallback?ORDER_ID={order.payment_reference}"
        )
        configured = (settings.PAYTM_CALLBACK_URL or "").strip() or None

        def _is_public_https(url: Optional[str]) -> bool:
            if not url:
                return False
            lower = url.lower()
            if not lower.startswith("https://"):
                return False
            for bad in (
                "localhost",
                "127.0.0.1",
                "0.0.0.0",
                "192.168.",
                "10.",
                "172.16.",
                "172.17.",
                "172.18.",
            ):
                if bad in lower:
                    return False
            return True

        initiate_callback = configured if _is_public_https(configured) else official_sdk_callback

        body: Dict[str, Any] = {
            "requestType": "Payment",
            "mid": _mid(),
            "websiteName": _website(),
            "orderId": order.payment_reference,
            "txnAmount": {"value": _amount(order.total_amount), "currency": "INR"},
            "userInfo": {"custId": str(user.id)},
            "callbackUrl": initiate_callback,
        }

        response = await _paytm_post(
            f"/theia/api/v1/initiateTransaction?mid={_mid()}&orderId={order.payment_reference}",
            body,
        )
        response_body = response.get("body") or {}
        info = response_body.get("resultInfo") or {}
        token = response_body.get("txnToken")
        if not token:
            code = info.get("resultCode") or "?"
            msg = info.get("resultMsg") or "Unknown gateway error"
            raise HTTPException(
                status.HTTP_502_BAD_GATEWAY,
                f"Paytm could not create a payment session [{code}]: {msg}",
            )

        sdk_callback = (
            official_sdk_callback if is_staging else (configured or official_sdk_callback)
        )
        if is_staging and _is_public_https(configured):
            sdk_callback = configured

        return {
            "already_paid": False,
            "orderId": order.payment_reference,
            "txnToken": token,
            "mid": _mid(),
            "amount": _amount(order.total_amount),
            "isStaging": is_staging,
            "callbackUrl": sdk_callback,
        }
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(
            "Unexpected error in initiate_paytm_payment order_id=%s\n%s",
            order_id,
            traceback.format_exc(),
        )
        raise HTTPException(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            f"Unexpected payment error: {exc.__class__.__name__}: {exc}",
        ) from exc


@router.post("/verify/{order_id}")
async def verify_paytm_payment(
    order_id: str,
    user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Server-to-server authoritative Paytm transaction verification."""
    try:
        parsed_order_id = _parse_order_id(order_id)
        result = await db.execute(select(Order).where(Order.id == parsed_order_id))
        order = result.scalar_one_or_none()
        if not order or order.customer_id != user.id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Order not found")
        if not order.payment_reference:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                "Payment session has not been initiated",
            )
        gateway = await _fetch_status(order.payment_reference)
        final_status = await _apply_status(db, order, gateway)
        return {
            "order_id": str(order.id),
            "payment_status": order.payment_status,
            "gateway_status": final_status,
            "txn_id": order.payment_id,
        }
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(
            "Unexpected error in verify_paytm_payment order_id=%s\n%s",
            order_id,
            traceback.format_exc(),
        )
        raise HTTPException(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            f"Unexpected payment error: {exc.__class__.__name__}: {exc}",
        ) from exc


@router.api_route("/callback", methods=["GET", "POST"])
async def paytm_callback(request: Request, db: AsyncSession = Depends(get_db)):
    """Paytm callback: validate checksum, reconcile with Transaction Status API, return 200."""
    data: Dict[str, Any]
    if request.method == "POST":
        try:
            data = dict(await request.form())
        except Exception:
            data = {}
    else:
        data = dict(request.query_params)

    checksum = data.get("CHECKSUMHASH")
    if not checksum or not _key():
        return JSONResponse({"ok": False, "message": "Invalid callback"}, status_code=400)
    if not PaytmChecksum.verifySignature(data, _key(), checksum):
        return JSONResponse({"ok": False, "message": "Invalid checksum"}, status_code=400)
    if data.get("MID") != _mid():
        return JSONResponse({"ok": False, "message": "Invalid merchant"}, status_code=400)

    paytm_order_id = data.get("ORDERID")
    if not paytm_order_id:
        return JSONResponse({"ok": False, "message": "Missing order id"}, status_code=400)
    result = await db.execute(select(Order).where(Order.payment_reference == paytm_order_id))
    order = result.scalar_one_or_none()
    if not order:
        return JSONResponse({"ok": False, "message": "Order not found"}, status_code=404)

    gateway = await _fetch_status(paytm_order_id)
    try:
        await _apply_status(db, order, gateway)
    except HTTPException:
        return JSONResponse(
            {"ok": False, "message": "Payment verification failed"},
            status_code=400,
        )
    return {"ok": True}
