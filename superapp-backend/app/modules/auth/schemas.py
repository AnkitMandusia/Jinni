"""Auth request/response schemas."""
from typing import Optional, Dict, Any
from pydantic import BaseModel, field_validator, Field
import re


# ── Requests ────────────────────────────────────────────────────────────────

class SendOTPRequest(BaseModel):
    phone: str

    @field_validator("phone")
    @classmethod
    def normalize_phone(cls, v: str) -> str:
        digits = re.sub(r"\D", "", v)
        if len(digits) == 10:
            return f"+91{digits}"
        if len(digits) == 12 and digits.startswith("91"):
            return f"+{digits}"
        if v.startswith("+"):
            return v
        raise ValueError("Invalid phone number format")


class VerifyOTPRequest(BaseModel):
    phone: str
    otp: str

    @field_validator("phone")
    @classmethod
    def normalize_phone(cls, v: str) -> str:
        digits = re.sub(r"\D", "", v)
        if len(digits) == 10:
            return f"+91{digits}"
        if len(digits) == 12 and digits.startswith("91"):
            return f"+{digits}"
        return v


class LoginRequest(BaseModel):
    """Email or phone + password login (returning users)."""
    identifier: str  # phone number OR email
    password: str


class CompleteProfileRequest(BaseModel):
    role: str
    # Password (set on first signup — enables future password login)
    password: Optional[str] = None
    # Shared / customer
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    email: Optional[str] = None
    # Store / restaurant shared
    owner_name: Optional[str] = None
    address: Optional[str] = None
    gstin: Optional[str] = None
    fssai: Optional[str] = None
    bank_account: Optional[str] = None
    bank_ifsc: Optional[str] = None
    # Store specific
    store_name: Optional[str] = None
    # Restaurant specific
    restaurant_name: Optional[str] = None
    cuisine_type: Optional[str] = None
    # Delivery agent
    name: Optional[str] = None
    vehicle_type: Optional[str] = None
    license_no: Optional[str] = None
    aadhaar: Optional[str] = None


class RefreshTokenRequest(BaseModel):
    refresh_token: str


class ChangePasswordRequest(BaseModel):
    current_password: Optional[str] = None   # None if user never set a password (OTP-only)
    new_password: str


class UpdateFCMTokenRequest(BaseModel):
    fcm_token: str


# ── Responses ───────────────────────────────────────────────────────────────

class SendOTPResponse(BaseModel):
    success: bool
    message: str


class UserResponse(BaseModel):
    id: str
    phone: str
    name: Optional[str] = None
    email: Optional[str] = None
    role: Optional[str] = None
    status: str
    profile_complete: bool
    profile_id: Optional[str] = None
    profile_data: Optional[Dict[str, Any]] = None

    model_config = {"from_attributes": True}


class UpdateMeRequest(BaseModel):
    """Editable fields on the logged-in user's own account (Profile tab)."""
    name: Optional[str] = Field(None, min_length=2, max_length=255)
    email: Optional[str] = Field(None, max_length=255)

    @field_validator("email")
    @classmethod
    def _validate_email(cls, v):
        if v is None or v == "":
            return None
        if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", v):
            raise ValueError("Enter a valid email address")
        return v.strip().lower()

    @field_validator("name")
    @classmethod
    def _validate_name(cls, v):
        if v is None:
            return v
        v = v.strip()
        if len(v) < 2:
            raise ValueError("Name must be at least 2 characters")
        return v


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserResponse
    is_new_user: bool


class RefreshResponse(BaseModel):
    access_token: str
    refresh_token: Optional[str] = None
    token_type: str = "bearer"
