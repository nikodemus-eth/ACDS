"""Configuration loader for Process Swarm inference settings.

Reads from environment variables to configure the inference backend.
"""
from __future__ import annotations

import os


def load_inference_config() -> dict:
    """Load inference configuration from environment variables.

    Environment variables:
        INFERENCE_PROVIDER   — "acds" or "rules" (default: "rules")
        ACDS_BASE_URL        — ACDS API base URL (default: "http://localhost:3000")
        ACDS_AUTH_TOKEN       — Bearer token for ACDS API (optional)
        ACDS_TIMEOUT_SECONDS — Request timeout in seconds (default: 30)
    """
    return {
        "provider": os.environ.get("INFERENCE_PROVIDER", "rules"),
        "acds_base_url": os.environ.get("ACDS_BASE_URL", "http://localhost:3000"),
        "acds_auth_token": os.environ.get("ACDS_AUTH_TOKEN"),
        "acds_timeout_seconds": int(
            os.environ.get("ACDS_TIMEOUT_SECONDS", "30")
        ),
    }
