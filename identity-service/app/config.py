import os
from functools import lru_cache
from typing import Optional

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

DEFAULT_DATABASE_NAME = "annual-sports-identity"


class Settings(BaseSettings):
    mongodb_uri: str = os.getenv(
        "MONGODB_URI", "mongodb://localhost:27017/annual-sports-identity"
    )
    database_name: Optional[str] = os.getenv("DATABASE_NAME")
    jwt_secret: str = os.getenv("JWT_SECRET", "your-secret-key-change-in-production")
    jwt_expires_in: str = os.getenv("JWT_EXPIRES_IN", "24h")
    admin_reg_number: str = os.getenv("ADMIN_REG_NUMBER", "admin")
    app_env: str = os.getenv("APP_ENV", "development")
    log_level: str = os.getenv("LOG_LEVEL", "INFO")
    redis_url: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")

    event_configuration_url: str = os.getenv("EVENT_CONFIGURATION_URL", "").rstrip("/")
    sports_participation_url: str = os.getenv("SPORTS_PARTICIPATION_URL", "").rstrip("/")
    enrollment_url: str = os.getenv("ENROLLMENT_URL", "").rstrip("/")
    department_url: str = os.getenv("DEPARTMENT_URL", "").rstrip("/")
    scheduling_url: str = os.getenv("SCHEDULING_URL", "").rstrip("/")

    email_provider: str = os.getenv("EMAIL_PROVIDER", "gmail")
    gmail_user: str = os.getenv("GMAIL_USER", "")
    gmail_app_password: str = os.getenv("GMAIL_APP_PASSWORD", "")
    sendgrid_user: str = os.getenv("SENDGRID_USER", "")
    sendgrid_api_key: str = os.getenv("SENDGRID_API_KEY", "")
    resend_api_key: str = os.getenv("RESEND_API_KEY", "")
    smtp_host: str = os.getenv("SMTP_HOST", "")
    smtp_user: str = os.getenv("SMTP_USER", "")
    smtp_password: str = os.getenv("SMTP_PASSWORD", "")
    smtp_port: int = int(os.getenv("SMTP_PORT", "587"))
    smtp_secure: bool = os.getenv("SMTP_SECURE", "false").lower() == "true"
    email_from: str = os.getenv("EMAIL_FROM", "")
    email_from_name: str = os.getenv("EMAIL_FROM_NAME", "Sports Event Management")
    app_name: str = os.getenv("APP_NAME", "Sports Event Management System")

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    @model_validator(mode="after")
    def set_database_name(self):
        if not self.database_name:
            self.database_name = DEFAULT_DATABASE_NAME
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
