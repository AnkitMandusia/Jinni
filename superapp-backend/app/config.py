"""Application configuration using pydantic-settings."""
from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        case_sensitive=True
    )

    
    # App
    APP_NAME: str = "SuperApp API"
    DEBUG: bool = True
    
    # Database
    DATABASE_URL: str
    
    # JWT
    SECRET_KEY: str 
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 1 day
    
    # Redis (for caching and sessions)
    REDIS_URL: str = "redis://localhost:6379/0"
    
    # OTP
    OTP_EXPIRE_MINUTES: int = 10
    OTP_DEBUG: bool = True  # Set False in production

    # Firebase Admin SDK (for FCM push notifications)
    FIREBASE_CREDENTIALS_PATH: str = "firebase-credentials.json"
    # Firebase Web API Key (for Phone Auth REST API — OTP sending)
    FIREBASE_API_KEY: str = ""

    # JWT refresh token
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30

    # Razorpay (legacy / other payment flows)
    RAZORPAY_KEY_ID: str = ""
    RAZORPAY_KEY_SECRET: str = ""

    # Paytm Payment Gateway
    PAYTM_ENVIRONMENT: str = "staging"
    PAYTM_MERCHANT_ID: str = ""
    PAYTM_MERCHANT_KEY: str = ""
    PAYTM_WEBSITE_NAME: str = "WEBSTAGING"
    # Public HTTPS callback URL. Example with ngrok during local staging.
    PAYTM_CALLBACK_URL: str = ""
    
    # AWS S3 (for image uploads)
    AWS_ACCESS_KEY_ID: str = ""
    AWS_SECRET_ACCESS_KEY: str = ""
    AWS_BUCKET_NAME: str = ""
    AWS_REGION: str = "ap-south-1"

    # WhatsApp Business API (Meta Cloud API v19.0)
    WABA_TOKEN: str = ""          # Permanent system-user token
    WABA_PHONE_ID: str = ""       # Phone number ID from Meta dashboard
    WABA_TEMPLATE_NAME: str = "delivery_otp"
    WABA_TEMPLATE_LANG: str = "en_US"
    META_APP_SECRET: str = ""     # For webhook X-Hub-Signature-256 verification
    META_WEBHOOK_VERIFY_TOKEN: str = "merefood_wa_verify"

    # Delivery OTP settings
    DELIVERY_OTP_EXPIRY_SECONDS: int = 300
    DELIVERY_OTP_RESEND_COOLDOWN: int = 60
    DELIVERY_OTP_MAX_ATTEMPTS: int = 5
    DELIVERY_OTP_MAX_RESENDS: int = 3
    WHATSAPP_FALLBACK_TIMEOUT_SECONDS: int = 45

    # SMS provider (msg91 | twilio | console)
    SMS_PROVIDER: str = "console"
    MSG91_AUTH_KEY: str = ""
    MSG91_TEMPLATE_ID: str = ""
    MSG91_SENDER_ID: str = "MEREFD"
    TWILIO_ACCOUNT_SID: str = ""
    TWILIO_AUTH_TOKEN: str = ""
    TWILIO_FROM_NUMBER: str = ""

    # Jinni AI — Gemini Flash-Lite fallback (section D/E of Jinni spec)
    GEMINI_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-2.5-flash-lite"
    # Persistent monthly budget for the Gemini fallback, in paise (100 paise = INR 1).
    # Default INR 500/month. Resets automatically because budget rows are keyed
    # by calendar month ('YYYY-MM') — see jinni/models.py JinniMonthlyBudget.
    JINNI_MONTHLY_BUDGET_PAISE: int = 50_000

    # Cloudflare R2 (S3-compatible, for product images)
    R2_ENDPOINT: str = ""         # https://<account_id>.r2.cloudflarestorage.com
    R2_ACCESS_KEY: str = ""
    R2_SECRET_KEY: str = ""
    R2_CDN_BASE_URL: str = ""     # https://cdn.yourdomain.com  (R2 public / custom domain)
    
    

@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()


settings = get_settings()
