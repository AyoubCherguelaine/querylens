from functools import lru_cache

from pydantic import Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    database_url: SecretStr
    analytics_database_url: SecretStr | None = None
    analytics_schemas: list[str] = ["public"]
    jwt_secret: SecretStr = Field(min_length=32)
    token_minutes: int = Field(default=120, ge=5, le=1440)
    openai_api_key: SecretStr = SecretStr("")
    openai_model: str = "gpt-4o-mini"
    llm_timeout_seconds: int = Field(default=40, ge=1, le=120)
    agent_max_steps: int = Field(default=12, ge=1, le=40)
    agent_timeout_seconds: int = Field(default=180, ge=10, le=600)
    query_timeout_ms: int = Field(default=10000, ge=100, le=60000)
    max_result_rows: int = Field(default=200, ge=1, le=1000)
    log_level: str = "INFO"
    allow_signup: bool = True
    upload_max_bytes: int = Field(default=25 * 1024 * 1024, ge=1024, le=100 * 1024 * 1024)
    import_max_rows: int = Field(default=100000, ge=1, le=1000000)
    import_max_tables: int = Field(default=50, ge=1, le=100)
    import_max_columns: int = Field(default=128, ge=1, le=256)
    import_timeout_ms: int = Field(default=60000, ge=1000, le=300000)
    max_imported_sources: int = Field(default=2, ge=1, le=500)
    max_chat_sessions: int = Field(default=10, ge=1, le=1000)
    max_questions_per_session: int = Field(default=3, ge=1, le=200)

    @field_validator("analytics_database_url", mode="before")
    @classmethod
    def empty_source(cls, value):
        return value or None

    @model_validator(mode="after")
    def validate_database(self):
        if (
            self.jwt_secret.get_secret_value()
            == "replace-with-a-random-secret-at-least-32-characters"
        ):
            raise ValueError("Replace the example JWT_SECRET with a random secret")
        for url in [self.database_url, self.analytics_database_url]:
            if url and not url.get_secret_value().startswith(("postgresql://", "postgres://")):
                raise ValueError("Only PostgreSQL URLs are supported")
        if not self.analytics_schemas or any(
            s == "chat_olap" or s.startswith("pg_") or s == "information_schema"
            for s in self.analytics_schemas
        ):
            raise ValueError("Choose business schemas; application and system schemas are excluded")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
