from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # auto: use Claude when ANTHROPIC_API_KEY is set, otherwise the deterministic heuristics.
    # anthropic: always use Claude (also works with an `ant auth login` profile and no env key).
    # heuristic: never call an LLM (offline dev, tests, demos).
    llm_mode: Literal["auto", "anthropic", "heuristic"] = "auto"
    anthropic_api_key: str | None = None  # read from env or backend/.env
    main_model: str = "claude-opus-5-5"
    worker_model: str = "claude-haiku-5-5"
    max_rewrites: int = 2
    cors_origins: list[str] = ["http://localhost:3000"]


@lru_cache
def get_settings() -> Settings:
    return Settings()
