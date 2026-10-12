"""Product image upload service.

Pipeline:
  1. Validate content-type (JPEG / PNG / WebP) and size (< 10 MB).
  2. Open with Pillow → convert to RGB → thumbnail 800×800 → save as WebP q=85.
  3. Upload to Cloudflare R2 via boto3 S3 client.
  4. Return the CDN URL.

Requires in .env:
  R2_ENDPOINT      — https://<account_id>.r2.cloudflarestorage.com
  R2_ACCESS_KEY    — R2 API token ID
  R2_SECRET_KEY    — R2 API token secret
  R2_CDN_BASE_URL  — https://cdn.yourdomain.com  (R2 public / custom domain)
"""
import io
import logging
from uuid import uuid4

import boto3
from botocore.exceptions import BotoCoreError, ClientError
from fastapi import HTTPException, UploadFile, status
from PIL import Image

from app.config import settings

logger = logging.getLogger(__name__)

_ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp"}
_MAX_BYTES = 10 * 1024 * 1024  # 10 MB
_BUCKET = "product-images"
_THUMB_SIZE = (800, 800)
_WEBP_QUALITY = 85


def _r2_client():
    return boto3.client(
        "s3",
        endpoint_url=settings.R2_ENDPOINT,
        aws_access_key_id=settings.R2_ACCESS_KEY,
        aws_secret_access_key=settings.R2_SECRET_KEY,
        region_name="auto",
    )


async def upload_product_image(file: UploadFile, folder: str = "products") -> str:
    """Validate, compress and upload a product image to R2.

    Returns the CDN URL string.
    """
    # 1. Validate content-type
    content_type = file.content_type or ""
    if content_type not in _ALLOWED_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported image type '{content_type}'. Use JPEG, PNG, or WebP.",
        )

    # 2. Read and validate size
    data = await file.read()
    if len(data) > _MAX_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Image must be smaller than 10 MB.",
        )

    # 3. Compress with Pillow
    try:
        img = Image.open(io.BytesIO(data)).convert("RGB")
        img.thumbnail(_THUMB_SIZE, Image.LANCZOS)
        buf = io.BytesIO()
        img.save(buf, format="WEBP", quality=_WEBP_QUALITY, method=6)
        buf.seek(0)
        compressed = buf.read()
    except Exception as exc:
        logger.error("Pillow processing failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Could not process the uploaded image.",
        ) from exc

    # 4. Upload to R2
    key = f"{folder}/{uuid4()}.webp"
    try:
        client = _r2_client()
        client.put_object(
            Bucket=_BUCKET,
            Key=key,
            Body=compressed,
            ContentType="image/webp",
            CacheControl="public, max-age=31536000",
        )
    except (BotoCoreError, ClientError) as exc:
        logger.error("R2 upload failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Image storage unavailable. Try again later.",
        ) from exc

    cdn_url = f"{settings.R2_CDN_BASE_URL.rstrip('/')}/{key}"
    return cdn_url
