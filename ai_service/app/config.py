"""
Configuration for the ai-service (Feature 7 – Automated Root-Cause Correlation).
All values can be overridden through environment variables.
"""

import os
from functools import lru_cache
from urllib.parse import urlparse
from dotenv import load_dotenv

load_dotenv()


def _positive_float(key: str, default: float, minimum: float = 1e-9) -> float:
    raw = os.environ.get(key)
    if raw is None:
        return default
    try:
        val = float(raw)
    except ValueError:
        raise RuntimeError(
            f"Configuration error: {key}={raw!r} is not a valid float."
        )
    if val <= 0:
        raise RuntimeError(
            f"Configuration error: {key}={val} must be strictly positive (> 0)."
        )
    return val


def _positive_int(key: str, default: int) -> int:
    raw = os.environ.get(key)
    if raw is None:
        return default
    try:
        val = int(raw)
    except ValueError:
        raise RuntimeError(
            f"Configuration error: {key}={raw!r} is not a valid integer."
        )
    if val <= 0:
        raise RuntimeError(
            f"Configuration error: {key}={val} must be strictly positive (> 0)."
        )
    return val


class Settings:
    """All anomaly-detector configuration, validated eagerly at import time."""

    # ── Database ──────────────────────────────────────────────────────────────
    DUCKDB_PATH: str = os.environ.get("DUCKDB_PATH", ":memory:")

    # ── ClickHouse ────────────────────────────────────────────────────────────
    CLICKHOUSE_URL: str = os.environ.get(
        "CLICKHOUSE_URL",
        "https://w1c3sdh2c2.asia-northeast1.gcp.clickhouse.cloud:8443",
    )
    CLICKHOUSE_HOST: str = os.environ.get(
        "CLICKHOUSE_HOST", "w1c3sdh2c2.asia-northeast1.gcp.clickhouse.cloud"
    )
    CLICKHOUSE_PORT: int = _positive_int("CLICKHOUSE_PORT", 8443)
    CLICKHOUSE_USER: str = os.environ.get("CLICKHOUSE_USER", "default")
    CLICKHOUSE_PASSWORD: str = os.environ.get("CLICKHOUSE_PASSWORD", "0Zeh9mt9dCf2_")
    CLICKHOUSE_DATABASE: str = os.environ.get(
        "CLICKHOUSE_DATABASE", "agamotto_telemetry"
    )
    CLICKHOUSE_SECURE: bool = os.environ.get(
        "CLICKHOUSE_SECURE", "true"
    ).lower() in ("true", "1", "yes")
    CLICKHOUSE_CLOUD_API_KEY: str = os.environ.get("CLICKHOUSE_CLOUD_API_KEY", "")
    CLICKHOUSE_CLOUD_API_SECRET: str = os.environ.get(
        "CLICKHOUSE_CLOUD_API_SECRET", ""
    )

    # ── Internal Service Authentication & Observability ──────────────────────
    AI_SERVICE_INTERNAL_KEY: str = os.environ.get("AI_SERVICE_INTERNAL_KEY", "ak_internal_ai_d8f7e2a1b94c3e5a")
    OTEL_EXPORTER_OTLP_ENDPOINT: str = os.environ.get("OTEL_EXPORTER_OTLP_ENDPOINT", "http://localhost:4317")
    AGAMOTTO_API_KEY: str = os.environ.get("AGAMOTTO_API_KEY", "")

    # ── JWT verification ──────────────────────────────────────────────────────
    JWT_SECRET: str = os.environ.get(
        "JWT_SECRET",
        "c8e6a18d9f4e2b0a7c5d3f1e9b8a7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b",
    )
    JWT_ALGORITHM: str = os.environ.get("JWT_ALGORITHM", "HS256")

    # ── Detection thresholds ─────────────────────────────────────────────────
    ANOMALY_K: float = _positive_float("EOA_ANOMALY_K", 2.0)
    ANOMALY_MARGIN: float = _positive_float("EOA_ANOMALY_MARGIN", 0.02)
    ANOMALY_MIN_SPANS: int = _positive_int("EOA_ANOMALY_MIN_SPANS", 50)

    # ── Window sizes ──────────────────────────────────────────────────────────
    BUCKET_MINUTES: int = _positive_int("EOA_BUCKET_MINUTES", 1)
    EVAL_WINDOW_MINUTES: int = _positive_int("EOA_EVAL_WINDOW_MINUTES", 5)
    BASELINE_WINDOW_MINUTES: int = _positive_int("EOA_BASELINE_WINDOW_MINUTES", 30)

    # ── Scheduler ─────────────────────────────────────────────────────────────
    SCHEDULER_INTERVAL_SECONDS: int = _positive_int("EOA_SCHEDULER_INTERVAL_S", 30)

    # ── Agent caps (for future Feature 9) ────────────────────────────────────
    AGENT_MAX_TOOL_CALLS: int = _positive_int("EOA_AGENT_MAX_TOOL_CALLS", 8)
    AGENT_TIMEOUT_S: int = _positive_int("EOA_AGENT_TIMEOUT_S", 45)

    # ── CORS ──────────────────────────────────────────────────────────────────
    CORS_ORIGINS: list[str] = os.environ.get(
        "EOA_CORS_ORIGINS", "http://localhost:5173,http://localhost:3000"
    ).split(",")

    # ── Recovery counter before closure ──────────────────────────────────────
    RECOVERY_WINDOWS_TO_CLOSE: int = _positive_int("EOA_RECOVERY_WINDOWS", 2)

    # ── MCP Server Configuration (Feature 8) ─────────────────────────────────
    EOA_STORE_URL: str = os.environ.get("EOA_STORE_URL", "")
    EOA_SUPPORT_URL: str = os.environ.get("EOA_SUPPORT_URL", "")
    EOA_MCP_URL: str = os.environ.get("EOA_MCP_URL", "http://localhost:8002/mcp")
    MCP_TOOLS_DISABLED: list[str] = [
        t.strip()
        for t in os.environ.get("EOA_MCP_TOOLS_DISABLED", "").split(",")
        if t.strip()
    ]

    # ── LLM Settings (Feature 9) ──────────────────────────────────────────────
    EOA_LLM_PROVIDER: str = os.environ.get("EOA_LLM_PROVIDER", "mock")
    EOA_LLM_MODEL: str = os.environ.get("EOA_LLM_MODEL", "gemini-1.5-flash")
    EOA_LLM_API_KEY: str = os.environ.get("EOA_LLM_API_KEY", os.environ.get("GEMINI_API_KEY", ""))
    EOA_AGENT_MAX_TOOL_CALLS: int = _positive_int("EOA_AGENT_MAX_TOOL_CALLS", 8)
    EOA_AGENT_TIMEOUT_S: int = _positive_int("EOA_AGENT_TIMEOUT_S", 45)
    EOA_MAX_TOOL_RESULT_CHARS: int = _positive_int("EOA_MAX_TOOL_RESULT_CHARS", 6000)
    EOA_CACHE_TTL_S: int = _positive_int("EOA_CACHE_TTL_S", 300)


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return the singleton Settings instance (validated once)."""
    return Settings()
