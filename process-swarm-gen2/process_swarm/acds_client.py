"""ACDS Dispatch API client for Python.

Mirrors the TypeScript @acds/sdk DispatchClient, communicating with the
ACDS HTTP API to route and execute inference requests through the
Adaptive Cognitive Dispatch System.
"""
from __future__ import annotations

import json
import logging
import urllib.request
import urllib.error
from dataclasses import dataclass, field, asdict
from enum import Enum
from typing import Optional

logger = logging.getLogger(__name__)


# ──────────────────────────────────────────────
# Enums (mirrors acds/packages/core-types/src/enums/)
# ──────────────────────────────────────────────


class TaskType(str, Enum):
    CREATIVE = "creative"
    ANALYTICAL = "analytical"
    EXTRACTION = "extraction"
    CLASSIFICATION = "classification"
    SUMMARIZATION = "summarization"
    GENERATION = "generation"
    REASONING = "reasoning"
    CODING = "coding"
    DECISION_SUPPORT = "decision_support"
    TRANSFORMATION = "transformation"
    CRITIQUE = "critique"
    PLANNING = "planning"
    RETRIEVAL_SYNTHESIS = "retrieval_synthesis"


class CognitiveGrade(str, Enum):
    BASIC = "basic"
    STANDARD = "standard"
    ENHANCED = "enhanced"
    FRONTIER = "frontier"
    SPECIALIZED = "specialized"


class LoadTier(str, Enum):
    SINGLE_SHOT = "single_shot"
    BATCH = "batch"
    STREAMING = "streaming"
    HIGH_THROUGHPUT = "high_throughput"


class DecisionPosture(str, Enum):
    EXPLORATORY = "exploratory"
    ADVISORY = "advisory"
    OPERATIONAL = "operational"
    FINAL = "final"
    EVIDENTIARY = "evidentiary"


# ──────────────────────────────────────────────
# Request / Response contracts
# ──────────────────────────────────────────────


@dataclass
class RoutingConstraints:
    privacy: str = "local_only"
    maxLatencyMs: Optional[int] = None
    costSensitivity: str = "medium"
    structuredOutputRequired: bool = False
    traceabilityRequired: bool = False


@dataclass
class InstanceContext:
    retryCount: int = 0
    previousFailures: list[str] = field(default_factory=list)
    deadlinePressure: bool = False
    humanReviewStatus: str = "none"
    additionalMetadata: dict = field(default_factory=dict)


@dataclass
class RoutingRequest:
    application: str
    process: str
    step: str
    taskType: str
    loadTier: str = LoadTier.SINGLE_SHOT.value
    decisionPosture: str = DecisionPosture.OPERATIONAL.value
    cognitiveGrade: str = CognitiveGrade.STANDARD.value
    input: str = ""
    constraints: RoutingConstraints = field(default_factory=RoutingConstraints)
    instanceContext: Optional[InstanceContext] = None

    def to_dict(self) -> dict:
        d = asdict(self)
        if d.get("instanceContext") is None:
            del d["instanceContext"]
        return d


@dataclass
class DispatchRunRequest:
    routingRequest: RoutingRequest
    inputPayload: str
    inputFormat: str = "text"
    requestId: Optional[str] = None

    def to_dict(self) -> dict:
        d = {
            "routingRequest": self.routingRequest.to_dict(),
            "inputPayload": self.inputPayload,
            "inputFormat": self.inputFormat,
        }
        if self.requestId is not None:
            d["requestId"] = self.requestId
        return d


@dataclass
class DispatchRunResponse:
    executionId: str = ""
    status: str = ""
    normalizedOutput: Optional[str] = None
    outputFormat: str = "text"
    selectedModelProfileId: str = ""
    selectedTacticProfileId: str = ""
    selectedProviderId: str = ""
    latencyMs: int = 0
    fallbackUsed: bool = False
    fallbackAttempts: int = 0
    rationaleId: str = ""
    rationaleSummary: str = ""

    @classmethod
    def from_dict(cls, data: dict) -> DispatchRunResponse:
        return cls(
            executionId=data.get("executionId", ""),
            status=data.get("status", ""),
            normalizedOutput=data.get("normalizedOutput"),
            outputFormat=data.get("outputFormat", "text"),
            selectedModelProfileId=data.get("selectedModelProfileId", ""),
            selectedTacticProfileId=data.get("selectedTacticProfileId", ""),
            selectedProviderId=data.get("selectedProviderId", ""),
            latencyMs=data.get("latencyMs", 0),
            fallbackUsed=data.get("fallbackUsed", False),
            fallbackAttempts=data.get("fallbackAttempts", 0),
            rationaleId=data.get("rationaleId", ""),
            rationaleSummary=data.get("rationaleSummary", ""),
        )


# ──────────────────────────────────────────────
# Errors
# ──────────────────────────────────────────────


class ACDSClientError(Exception):
    """Raised when the ACDS API returns an error or is unreachable."""
    def __init__(self, message: str, status_code: Optional[int] = None, body: str = ""):
        self.status_code = status_code
        self.body = body
        super().__init__(message)


# ──────────────────────────────────────────────
# Client
# ──────────────────────────────────────────────


class ACDSClient:
    """HTTP client for the ACDS Dispatch API.

    Usage::

        client = ACDSClient(base_url="http://localhost:3000")
        response = client.dispatch(request)
        print(response.normalizedOutput)
    """

    def __init__(
        self,
        base_url: str = "http://localhost:3000",
        auth_token: Optional[str] = None,
        timeout_seconds: int = 30,
    ):
        self.base_url = base_url.rstrip("/")
        self.auth_token = auth_token
        self.timeout_seconds = timeout_seconds

    def health(self) -> bool:
        """Check if the ACDS API is reachable."""
        try:
            self._get("/health")
            return True
        except Exception:
            return False

    def dispatch(self, request: DispatchRunRequest) -> DispatchRunResponse:
        """Submit a dispatch run request and return the execution result."""
        body = request.to_dict()
        data = self._post("/v1/dispatch/run", body)
        return DispatchRunResponse.from_dict(data)

    # ── HTTP helpers ──────────────────────────────────────────────────

    def _headers(self) -> dict[str, str]:
        h = {
            "Content-Type": "application/json",
            "Accept": "application/json",
        }
        if self.auth_token:
            h["Authorization"] = f"Bearer {self.auth_token}"
        return h

    def _get(self, path: str) -> dict:
        url = f"{self.base_url}{path}"
        req = urllib.request.Request(url, headers=self._headers(), method="GET")
        return self._execute(req)

    def _post(self, path: str, body: dict) -> dict:
        url = f"{self.base_url}{path}"
        data = json.dumps(body).encode("utf-8")
        req = urllib.request.Request(
            url, data=data, headers=self._headers(), method="POST",
        )
        return self._execute(req)

    def _execute(self, req: urllib.request.Request) -> dict:
        try:
            with urllib.request.urlopen(req, timeout=self.timeout_seconds) as resp:
                raw = resp.read().decode("utf-8")
                if not raw:
                    return {}
                return json.loads(raw)
        except urllib.error.HTTPError as e:
            body = ""
            try:
                body = e.read().decode("utf-8")
            except Exception:
                pass
            raise ACDSClientError(
                f"HTTP {e.code} {e.reason} – {req.get_method()} {req.full_url}",
                status_code=e.code,
                body=body,
            ) from e
        except urllib.error.URLError as e:
            raise ACDSClientError(
                f"Connection error – {req.get_method()} {req.full_url}: {e.reason}",
            ) from e
        except TimeoutError as e:
            raise ACDSClientError(
                f"Request timed out after {self.timeout_seconds}s – "
                f"{req.get_method()} {req.full_url}",
            ) from e
