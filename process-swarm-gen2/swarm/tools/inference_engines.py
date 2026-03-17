"""Direct inference engine clients for deterministic pipeline routing.

Per Nik's Context Report spec, each pipeline stage has a fixed engine
assignment. These clients bypass ACDS policy routing and call engines
directly when deterministic control is required.

Engine assignments:
    Ollama          → extraction, clustering, validation (primary)
    Apple Intelligence → prioritization, synthesis, validation (fallback)
"""
from __future__ import annotations

import json
import logging
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from typing import Optional

logger = logging.getLogger(__name__)

_OLLAMA_BASE = "http://localhost:11434"
_APPLE_BRIDGE_BASE = "http://localhost:11435"


@dataclass
class InferenceResult:
    """Unified result from any inference engine."""
    success: bool
    output: str
    engine: str  # "ollama" or "apple_intelligence"
    model: str
    latency_ms: int = 0
    error: Optional[str] = None
    metadata: dict = field(default_factory=dict)


class OllamaClient:
    """Direct Ollama HTTP client for extraction, clustering, and validation.

    Uses the /api/generate endpoint for single-shot text generation.
    Default model can be overridden per-call.
    """

    def __init__(
        self,
        base_url: str = _OLLAMA_BASE,
        default_model: str = "qwen3:8b",
        timeout_seconds: int = 300,
    ):
        self.base_url = base_url.rstrip("/")
        self.default_model = default_model
        self.timeout_seconds = timeout_seconds

    def generate(
        self,
        prompt: str,
        *,
        model: str | None = None,
        system: str = "",
        temperature: float = 0.3,
    ) -> InferenceResult:
        """Generate text via Ollama /api/generate."""
        t0 = time.monotonic()
        model_name = model or self.default_model

        body = {
            "model": model_name,
            "prompt": prompt,
            "stream": False,
            "options": {"temperature": temperature},
        }
        if system:
            body["system"] = system

        try:
            data = json.dumps(body).encode()
            req = urllib.request.Request(
                f"{self.base_url}/api/generate",
                data=data,
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=self.timeout_seconds) as resp:
                result = json.loads(resp.read())

            latency = int((time.monotonic() - t0) * 1000)
            return InferenceResult(
                success=True,
                output=result.get("response", ""),
                engine="ollama",
                model=model_name,
                latency_ms=latency,
                metadata={
                    "total_duration": result.get("total_duration", 0),
                    "eval_count": result.get("eval_count", 0),
                },
            )
        except (urllib.error.URLError, urllib.error.HTTPError, Exception) as e:
            latency = int((time.monotonic() - t0) * 1000)
            logger.warning("Ollama generate failed: %s", e)
            return InferenceResult(
                success=False,
                output="",
                engine="ollama",
                model=model_name,
                latency_ms=latency,
                error=str(e),
            )

    def health(self) -> bool:
        """Check if Ollama is reachable."""
        try:
            req = urllib.request.Request(f"{self.base_url}/api/tags", method="GET")
            with urllib.request.urlopen(req, timeout=5) as resp:
                return resp.status == 200
        except Exception:
            return False


class AppleIntelligenceClient:
    """Direct Apple Intelligence bridge client for prioritization and synthesis.

    Communicates with the local Apple Intelligence bridge on port 11435.
    The bridge exposes:
        GET  /health        — health check
        GET  /capabilities  — available models and task types
        POST /execute       — run inference
    """

    def __init__(
        self,
        base_url: str = _APPLE_BRIDGE_BASE,
        timeout_seconds: int = 120,
    ):
        self.base_url = base_url.rstrip("/")
        self.timeout_seconds = timeout_seconds

    def generate(
        self,
        prompt: str,
        *,
        system: str = "",
        temperature: float = 0.4,
        model: str = "apple-fm-on-device",
    ) -> InferenceResult:
        """Generate text via Apple Intelligence bridge POST /execute."""
        t0 = time.monotonic()

        body: dict = {
            "model": model,
            "prompt": prompt,
            "temperature": temperature,
            "maxTokens": 4096,
        }
        if system:
            body["system"] = system

        try:
            data = json.dumps(body).encode()
            req = urllib.request.Request(
                f"{self.base_url}/execute",
                data=data,
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=self.timeout_seconds) as resp:
                result = json.loads(resp.read())

            latency = int((time.monotonic() - t0) * 1000)
            return InferenceResult(
                success=True,
                output=result.get("content", ""),
                engine="apple_intelligence",
                model=result.get("model", model),
                latency_ms=latency,
                metadata={
                    "duration_ms": result.get("durationMs", 0),
                    "input_tokens": result.get("inputTokens", 0),
                    "output_tokens": result.get("outputTokens", 0),
                    "capabilities": result.get("capabilities", []),
                },
            )
        except (urllib.error.URLError, urllib.error.HTTPError, Exception) as e:
            latency = int((time.monotonic() - t0) * 1000)
            logger.warning("Apple Intelligence generate failed: %s", e)
            return InferenceResult(
                success=False,
                output="",
                engine="apple_intelligence",
                model=model,
                latency_ms=latency,
                error=str(e),
            )

    def health(self) -> bool:
        """Check if Apple Intelligence bridge is reachable."""
        try:
            req = urllib.request.Request(f"{self.base_url}/health", method="GET")
            with urllib.request.urlopen(req, timeout=5) as resp:
                return resp.status == 200
        except Exception:
            return False


# ── Inference Map (per spec Section IV) ──

INFERENCE_MAP = {
    "extraction": "ollama",
    "clustering": "ollama",
    "prioritization": "apple_intelligence",
    "synthesis": "apple_intelligence",
    "validation_primary": "ollama",
    "validation_fallback": "apple_intelligence",
}


def create_engine_for_stage(stage: str) -> OllamaClient | AppleIntelligenceClient:
    """Return the correct engine client for a pipeline stage."""
    engine = INFERENCE_MAP.get(stage, "ollama")
    if engine == "apple_intelligence":
        return AppleIntelligenceClient()
    return OllamaClient()
