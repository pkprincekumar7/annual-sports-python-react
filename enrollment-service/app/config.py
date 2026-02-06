import os
from functools import lru_cache
from typing import Optional

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


DEFAULT_DATABASE_NAME = "annual-sports-enrollment"


class Settings(BaseSettings):
    mongodb_uri: str = os.getenv(
        "MONGODB_URI", "mongodb://localhost:27017/annual-sports-enrollment"
    )
    database_name: Optional[str] = os.getenv("DATABASE_NAME")
    jwt_secret: str = os.getenv("JWT_SECRET", "your-secret-key-change-in-production")
    jwt_expires_in: str = os.getenv("JWT_EXPIRES_IN", "24h")
    admin_reg_number: str = os.getenv("ADMIN_REG_NUMBER", "admin")
    app_env: str = os.getenv("APP_ENV", "development")
    log_level: str = os.getenv("LOG_LEVEL", "INFO")
    redis_url: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")

    identity_url: str = os.getenv("IDENTITY_URL", "").rstrip("/")
    event_configuration_url: str = os.getenv("EVENT_CONFIGURATION_URL", "").rstrip("/")
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    @model_validator(mode="after")
    def set_database_name(self):
        if not self.database_name:
            self.database_name = DEFAULT_DATABASE_NAME
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
