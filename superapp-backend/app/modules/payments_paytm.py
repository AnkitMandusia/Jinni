
"""Paytm Payment Gateway integration for food/grocery orders."""

from __future__ import annotations

import json
import logging
import secrets
import traceback
from decimal import Decimal, InvalidOperation
from typing import Any, Dict, Optional
from urllib.parse import urlparse
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


# ---------------------------------------------------------------------------
# Configuration helpers
# ---------------------------------------------------------------------------

def _parse_order_id(raw: str) -> UUID:
    try:
        return UUID(str(raw))
    except (ValueError, AttributeError, TypeError):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Could not start payment: order was not created correctly.",
        )


def _mid() -> str:
    return (settings.PAYTM_MERCHANT_ID or "").strip()


def _key() -> str:
    # Never log or return this value.
    return (settings.PAYTM_MERCHANT_KEY or "").strip()


def _website() -> str:
    configured = (settings.PAYTM_WEBSITE_NAME or "").strip()
    if configured:
        return configured

    environment = (
        settings.PAYTM_ENVIRONMENT or "staging"
    ).strip().lower()

    return "DEFAULT" if environment == "production" else "WEBSTAGING"


def _environment() -> str:
    return (settings.PAYTM_ENVIRONMENT or "staging").strip().lower()


def _domain() -> str:
    environment = _environment()

    if environment == "staging":
        return "https://securestage.paytmpayments.com"

    if environment == "production":
        return "https://secure.paytmpayments.com"

    raise RuntimeError(
        "PAYTM_ENVIRONMENT must be 'staging' or 'production'"
    )


def _enabled() -> bool:
    return bool(_mid() and _key())


def _amount(value: Decimal) -> str:
    amount = Decimal(str(value))

    if not amount.is_finite() or amount <= 0:
        raise ValueError("Payment amount must be a positive finite value")

    return f"{amount:.2f}"


def _new_reference(order: Order) -> str:
    """
    Generate a fresh alphanumeric Paytm order ID for each initiation attempt.
    Keep it within Paytm's order-ID length limit.
    """
    return f"PTM{secrets.token_hex(12).upper()}"


def _is_public_https(url: Optional[str]) -> bool:
    if not url:
        return False

    try:
        parsed = urlparse(url.strip())
        host = (parsed.hostname or "").lower()

        if parsed.scheme.lower() != "https" or not host:
            return False

        if parsed.username or parsed.password:
            return False

        if host == "localhost" or host.endswith(".localhost"):
            return False

        if host.endswith(".local"):
            return False

        import ipaddress

        try:
            ip = ipaddress.ip_address(host)
            if not ip.is_global:
                return False
        except ValueError:
            pass

        return True

    except (ValueError, TypeError):
        return False


# ---------------------------------------------------------------------------
# Safe logging helpers
# ---------------------------------------------------------------------------

def _sanitize_paytm_response(data: Any) -> Any:
    """
    Recursively redact credentials, signatures and payment tokens before logs.
    """
    if isinstance(data, dict):
        safe: Dict[str, Any] = {}

        for key, value in data.items():
            name = str(key).lower().replace("_", "")

            sensitive = (
                "signature",
                "checksum",
                "merchantkey",
                "password",
                "token",
                "authorization",
                "secret",
            )

            if any(item in name for item in sensitive):
                safe[key] = "<redacted>"
            else:
                safe[key] = _sanitize_paytm_response(value)

        return safe

    if isinstance(data, list):
        return [_sanitize_paytm_response(item) for item in data]

    return data


def _callback_host(url: Optional[str]) -> Optional[str]:
    if not url:
        return None

    try:
        return urlparse(url).hostname
    except ValueError:
        return None


# ---------------------------------------------------------------------------
# Paytm API request helper
# ---------------------------------------------------------------------------

async def _paytm_post(
    path: str,
    body: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Sign the exact JSON representation of the body and POST the Paytm payload.

    The merchant key and generated checksum are never printed in logs.
    """

    if not _enabled():
        logger.error("Paytm credentials are not configured")
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Paytm credentials are not configured",
        )

    mid = _mid()
    key = _key()
    domain = _domain()
    url = f"{domain}{path}"

    logger.warning(
        "PAYTM_DEBUG request_start environment=%s domain=%s path=%s "
        "mid_suffix=%s website=%s order_id=%s amount=%s currency=%s "
        "callback_host=%s body_keys=%s",
        _environment(),
        domain,
        path.split("?")[0],
        mid[-6:] if len(mid) >= 6 else mid,
        body.get("websiteName"),
        body.get("orderId"),
        (body.get("txnAmount") or {}).get("value"),
        (body.get("txnAmount") or {}).get("currency"),
        _callback_host(body.get("callbackUrl")),
        sorted(body.keys()),
    )

    # Ensure the request MID matches the configured MID.
    if body.get("mid") != mid:
        logger.error("PAYTM_DEBUG body MID does not match configured MID")
        raise HTTPException(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            "Paytm request configuration mismatch",
        )

    # Sign exactly the body JSON string that will be placed in the payload.
    try:
        body_json = json.dumps(body)
        signature = PaytmChecksum.generateSignature(body_json, key)

        if not signature:
            raise ValueError("Empty checksum generated")

        logger.warning(
            "PAYTM_DEBUG checksum_generated body_bytes=%d signature_length=%d",
            len(body_json.encode("utf-8")),
            len(signature),
        )

    except Exception as exc:
        logger.exception("PAYTM_DEBUG checksum_generation_failed")
        raise HTTPException(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            f"Paytm checksum generation failed: {type(exc).__name__}",
        ) from exc

    payload = {
        "body": body,
        "head": {"signature": signature},
    }

    post_data = json.dumps(payload)

    logger.warning(
        "PAYTM_DEBUG sending_request url=%s payload_bytes=%d",
        url,
        len(post_data.encode("utf-8")),
    )

    try:
        async with httpx.AsyncClient(timeout=25.0) as client:
            response = await client.post(
                url,
                content=post_data.encode("utf-8"),
                headers={"Content-Type": "application/json"},
            )

    except httpx.TimeoutException as exc:
        logger.exception(
            "PAYTM_DEBUG request_timeout domain=%s path=%s",
            domain,
            path.split("?")[0],
        )
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            "Paytm gateway request timed out",
        ) from exc

    except httpx.RequestError as exc:
        logger.exception(
            "PAYTM_DEBUG transport_error domain=%s error_type=%s",
            domain,
            type(exc).__name__,
        )
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            f"Could not reach Paytm gateway: {type(exc).__name__}",
        ) from exc

    logger.warning(
        "PAYTM_DEBUG http_response status=%s content_type=%s "
        "response_bytes=%s",
        response.status_code,
        response.headers.get("content-type"),
        len(response.content),
    )

    try:
        data = response.json()
    except ValueError as exc:
        logger.error(
            "PAYTM_DEBUG non_json_response status=%s response_preview=%r",
            response.status_code,
            response.text[:300],
        )
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            f"Paytm returned a non-JSON response (HTTP {response.status_code})",
        ) from exc

    logger.warning(
        "PAYTM_DEBUG response_body=%s",
        json.dumps(
            _sanitize_paytm_response(data),
            default=str,
        )[:2000],
    )

    if not isinstance(data, dict):
        logger.error("PAYTM_DEBUG unexpected_response_type")
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            "Paytm returned an unexpected response format",
        )

    response_body = data.get("body") or {}
    info = response_body.get("resultInfo") or {}

    result_status = str(info.get("resultStatus") or "")
    result_code = str(info.get("resultCode") or "")
    result_msg = str(info.get("resultMsg") or "")

    if response.status_code >= 400:
        logger.error(
            "PAYTM_DEBUG http_failure http_status=%s result_code=%s "
            "result_status=%s",
            response.status_code,
            result_code,
            result_status,
        )
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            f"Paytm gateway HTTP {response.status_code} "
            f"[{result_code}]: {result_msg or 'Gateway request failed'}",
        )

    # HTTP 200 does not necessarily mean the payment session was created.
    if result_status.upper() in ("F", "TXN_FAILURE", "FAILURE"):
        if not response_body.get("txnToken"):
            logger.error(
                "PAYTM_DEBUG business_failure result_code=%s "
                "result_msg=%s order_id=%s",
                result_code,
                result_msg,
                body.get("orderId"),
            )
            raise HTTPException(
                status.HTTP_502_BAD_GATEWAY,
                f"Paytm rejected request [{result_code}]: "
                f"{result_msg or 'Unknown gateway error'}",
            )

    return data


# ---------------------------------------------------------------------------
# Transaction status and reconciliation
# ---------------------------------------------------------------------------

async def _fetch_status(paytm_order_id: str) -> Dict[str, Any]:
    body = {
        "mid": _mid(),
        "orderId": paytm_order_id,
    }

    logger.info(
        "PAYTM_DEBUG status_check order_id=%s",
        paytm_order_id,
    )

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

    if not signature or not PaytmChecksum.verifySignature(
        body, _key(), signature
    ):
        logger.error(
            "PAYTM_DEBUG invalid_status_signature order_id=%s",
            order.payment_reference,
        )
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            "Invalid Paytm status signature",
        )

    info = body.get("resultInfo") or {}
    status_value = str(info.get("resultStatus") or "PENDING")
    txn_amount = body.get("txnAmount")

    if (
        verify_amount
        and status_value == "TXN_SUCCESS"
        and txn_amount is not None
    ):
        if Decimal(str(txn_amount)) != Decimal(str(order.total_amount)):
            logger.error(
                "PAYTM_DEBUG amount_mismatch order_id=%s",
                order.payment_reference,
            )
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                "Paytm amount mismatch",
            )

    if status_value == "TXN_SUCCESS":
        order.payment_status = PaymentStatus.PAID.value
        order.payment_id = body.get("txnId") or order.payment_id

        if order.coupon_code and order.discount:
            if Decimal(str(order.discount)) > 0:
                existing = (
                    await db.execute(
                        select(CouponRedemption).where(
                            CouponRedemption.order_id == order.id
                        )
                    )
                ).scalar_one_or_none()

                if not existing:
                    coupon = (
                        await db.execute(
                            select(Coupon).where(
                                Coupon.code == order.coupon_code
                            )
                        )
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

    logger.info(
        "PAYTM_DEBUG status_applied order_id=%s status=%s",
        order.payment_reference,
        status_value,
    )

    return status_value


# ---------------------------------------------------------------------------
# Initiate payment
# ---------------------------------------------------------------------------

@router.post("/initiate/{order_id}")
async def initiate_paytm_payment(
    order_id: str,
    user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a Paytm transaction token for an existing online order."""

    try:
        if user.role != "customer":
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                "Only customers can pay for orders",
            )

        parsed_order_id = _parse_order_id(order_id)

        result = await db.execute(
            select(Order).where(Order.id == parsed_order_id)
        )
        order = result.scalar_one_or_none()

        if not order or order.customer_id != user.id:
            raise HTTPException(
                status.HTTP_404_NOT_FOUND,
                "Order not found",
            )

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
            return {
                "already_paid": True,
                "orderId": str(order.id),
            }

        if not _enabled():
            raise HTTPException(
                status.HTTP_503_SERVICE_UNAVAILABLE,
                "Paytm credentials are not configured",
            )

        try:
            amount = _amount(order.total_amount)
        except (ValueError, InvalidOperation) as exc:
            logger.error(
                "PAYTM_DEBUG invalid_order_amount order_id=%s",
                order.id,
            )
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                "Order has an invalid payment amount",
            ) from exc

        # A new unique Paytm reference for this initiation attempt.
        order.payment_reference = _new_reference(order)

        await db.commit()
        await db.refresh(order)

        is_staging = _environment() == "staging"

        official_sdk_callback = (
            f"{_domain()}/theia/paytmCallback"
            f"?ORDER_ID={order.payment_reference}"
        )

        configured_callback = (
            settings.PAYTM_CALLBACK_URL or ""
        ).strip() or None

        initiate_callback = (
            configured_callback
            if _is_public_https(configured_callback)
            else official_sdk_callback
        )

        # Remove UUID hyphens from custId.
        customer_id = str(user.id).replace("-", "")

        body: Dict[str, Any] = {
            "requestType": "Payment",
            "mid": _mid(),
            "websiteName": _website(),
            "orderId": order.payment_reference,
            "txnAmount": {
                "value": amount,
                "currency": "INR",
            },
            "userInfo": {
                "custId": customer_id,
            },
            "callbackUrl": initiate_callback,
        }

        logger.warning(
            "PAYTM_DEBUG initiate order_db_id=%s order_reference=%s "
            "amount=%s environment=%s website=%s callback_host=%s",
            order.id,
            order.payment_reference,
            amount,
            _environment(),
            _website(),
            _callback_host(initiate_callback),
        )

        response = await _paytm_post(
            (
                "/theia/api/v1/initiateTransaction"
                f"?mid={_mid()}&orderId={order.payment_reference}"
            ),
            body,
        )

        response_body = response.get("body") or {}
        info = response_body.get("resultInfo") or {}
        token = response_body.get("txnToken")

        if not token:
            code = info.get("resultCode") or "?"
            message = info.get("resultMsg") or "Unknown gateway error"

            logger.error(
                "PAYTM_DEBUG missing_txn_token order_id=%s "
                "result_code=%s result_msg=%s",
                order.payment_reference,
                code,
                message,
            )

            raise HTTPException(
                status.HTTP_502_BAD_GATEWAY,
                f"Paytm could not create a payment session "
                f"[{code}]: {message}",
            )

        sdk_callback = (
            official_sdk_callback
            if is_staging
            else (configured_callback or official_sdk_callback)
        )

        if is_staging and _is_public_https(configured_callback):
            sdk_callback = configured_callback

        logger.info(
            "PAYTM_DEBUG session_created order_reference=%s "
            "amount=%s environment=%s",
            order.payment_reference,
            amount,
            _environment(),
        )

        return {
            "already_paid": False,
            "orderId": order.payment_reference,
            "txnToken": token,
            "mid": _mid(),
            "amount": amount,
            "isStaging": is_staging,
            "callbackUrl": sdk_callback,
        }

    except HTTPException:
        raise

    except Exception as exc:
        logger.error(
            "PAYTM_DEBUG unexpected_initiation_error order_id=%s "
            "error_type=%s\n%s",
            order_id,
            type(exc).__name__,
            traceback.format_exc(),
        )
        raise HTTPException(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            f"Unexpected payment error: {type(exc).__name__}",
        ) from exc


# ---------------------------------------------------------------------------
# Verify payment
# ---------------------------------------------------------------------------

@router.post("/verify/{order_id}")
async def verify_paytm_payment(
    order_id: str,
    user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Verify payment using Paytm's server-to-server status API."""

    try:
        parsed_order_id = _parse_order_id(order_id)

        result = await db.execute(
            select(Order).where(Order.id == parsed_order_id)
        )
        order = result.scalar_one_or_none()

        if not order or order.customer_id != user.id:
            raise HTTPException(
                status.HTTP_404_NOT_FOUND,
                "Order not found",
            )

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
            "PAYTM_DEBUG unexpected_verification_error order_id=%s "
            "error_type=%s\n%s",
            order_id,
            type(exc).__name__,
            traceback.format_exc(),
        )
        raise HTTPException(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            f"Unexpected payment error: {type(exc).__name__}",
        ) from exc


# ---------------------------------------------------------------------------
# Paytm callback
# ---------------------------------------------------------------------------

@router.api_route("/callback", methods=["GET", "POST"])
async def paytm_callback(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """
    Validate the callback checksum and reconcile against Paytm's status API.
    """

    try:
        if request.method == "POST":
            try:
                data: Dict[str, Any] = dict(await request.form())
            except Exception:
                data = {}
        else:
            data = dict(request.query_params)

        logger.info(
            "PAYTM_DEBUG callback_received method=%s fields=%s",
            request.method,
            sorted(data.keys()),
        )

        checksum = data.get("CHECKSUMHASH")

        if not checksum or not _key():
            logger.warning("PAYTM_DEBUG callback_missing_checksum")
            return JSONResponse(
                {"ok": False, "message": "Invalid callback"},
                status_code=400,
            )

        if not PaytmChecksum.verifySignature(data, _key(), checksum):
            logger.warning("PAYTM_DEBUG callback_invalid_checksum")
            return JSONResponse(
                {"ok": False, "message": "Invalid checksum"},
                status_code=400,
            )

        if data.get("MID") != _mid():
            logger.warning("PAYTM_DEBUG callback_mid_mismatch")
            return JSONResponse(
                {"ok": False, "message": "Invalid merchant"},
                status_code=400,
            )

        paytm_order_id = data.get("ORDERID")

        if not paytm_order_id:
            logger.warning("PAYTM_DEBUG callback_missing_order_id")
            return JSONResponse(
                {"ok": False, "message": "Missing order id"},
                status_code=400,
            )

        result = await db.execute(
            select(Order).where(
                Order.payment_reference == paytm_order_id
            )
        )
        order = result.scalar_one_or_none()

        if not order:
            logger.warning(
                "PAYTM_DEBUG callback_order_not_found order_id=%s",
                paytm_order_id,
            )
            return JSONResponse(
                {"ok": False, "message": "Order not found"},
                status_code=404,
            )

        gateway = await _fetch_status(paytm_order_id)

        try:
            await _apply_status(db, order, gateway)
        except HTTPException:
            logger.exception(
                "PAYTM_DEBUG callback_payment_verification_failed "
                "order_id=%s",
                paytm_order_id,
            )
            return JSONResponse(
                {"ok": False, "message": "Payment verification failed"},
                status_code=400,
            )

        logger.info(
            "PAYTM_DEBUG callback_processed order_id=%s",
            paytm_order_id,
        )

        return {"ok": True}

    except Exception:
        logger.exception("PAYTM_DEBUG callback_unexpected_error")
        return JSONResponse(
            {"ok": False, "message": "Callback processing failed"},
            status_code=500,
        )
