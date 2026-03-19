"""ACDS client adapter -- the ONLY way Process Swarm talks to inference.

All cognitive work is routed through ACDSClient.request(), which handles
provider selection, policy evaluation, retry, fallback, and tracing.
"""

from __future__ import annotations

import logging
import time
from typing import Any

from swarm.integration.contracts import (
    CapabilityRequest,
    CapabilityResponse,
    DecisionTrace,
    IntegrationError as IntegrationErrorData,
    _now_utc,
)
from swarm.integration.errors import (
    CapabilityUnavailableError,
    ContractViolationError,
    FallbackExhaustedError,
    PolicyDeniedError,
    ProviderFailedError,
)
from swarm.integration.policy import (
    CAPABILITY_REGISTRY,
    DefaultPolicy,
)
from swarm.integration.retry import FailurePropagator, RetryStrategy
from swarm.tools.inference_engines import (
    AppleIntelligenceClient,
    InferenceResult,
    OllamaClient,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Provider metadata
# ---------------------------------------------------------------------------

_PROVIDER_META: dict[str, dict[str, Any]] = {
    "ollama": {
        "local": True,
        "default_latency_ms": 800,
        "priority": 1,
    },
    "apple_intelligence": {
        "local": True,
        "default_latency_ms": 600,
        "priority": 2,
    },
}


class ACDSClient:
    """Process Swarm's interface to ACDS cognitive execution.

    All cognitive work goes through this client.  Process Swarm never
    calls providers directly.
    """

    def __init__(self, providers: dict[str, Any] | None = None):
        self._providers: dict[str, Any] = providers or self._default_providers()
        self._policy = DefaultPolicy()
        self._retry = RetryStrategy()
        # Latency history: provider_id -> list of recent latencies in ms
        self._latency_history: dict[str, list[int]] = {}

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def request(self, req: CapabilityRequest) -> CapabilityResponse:
        """Execute a capability request through the ACDS pipeline.

        Pipeline: validate -> policy -> select -> execute -> trace
        """
        # 1. Validate
        self._validate_request(req)

        # 2. Select provider (policy is checked inside _select_provider)
        provider_id, client = self._select_provider(req)

        # 3. Execute with fallback
        trace = DecisionTrace(timestamp=_now_utc())
        output, used_provider, fallback_used, latency_ms = (
            self._execute_with_fallback(req, provider_id, client, trace)
        )

        # 4. Build response
        return CapabilityResponse(
            output=output,
            provider_id=used_provider,
            method_id=req.capability,
            latency_ms=latency_ms,
            cost_estimate=0.0,
            decision_trace=trace,
            fallback_used=fallback_used,
            request_id=req.request_id,
        )

    # ------------------------------------------------------------------
    # Provider defaults
    # ------------------------------------------------------------------

    @staticmethod
    def _default_providers() -> dict[str, Any]:
        """Create default provider instances: Ollama + Apple Intelligence."""
        return {
            "ollama": OllamaClient(),
            "apple_intelligence": AppleIntelligenceClient(),
        }

    # ------------------------------------------------------------------
    # Validation
    # ------------------------------------------------------------------

    def _validate_request(self, req: CapabilityRequest) -> None:
        """Validate that the request conforms to the integration contract."""
        if not req.capability:
            raise ContractViolationError("CapabilityRequest.capability must not be empty")
        if not req.context or not req.context.process_id:
            raise ContractViolationError("CapabilityRequest.context.process_id is required")

    # ------------------------------------------------------------------
    # Provider selection
    # ------------------------------------------------------------------

    def _select_provider(self, req: CapabilityRequest) -> tuple[str, Any]:
        """Score and select the best provider for the request.

        Scoring factors:
        - capability match (hard filter)
        - policy pass (hard filter)
        - preferred_provider hint (+20 bonus)
        - availability / health (+10 if healthy)
        - latency history (lower average -> higher score)
        """
        candidates = self._get_capable_providers(req.capability)
        if not candidates:
            raise CapabilityUnavailableError(
                f"No providers registered for capability '{req.capability}'"
            )

        scored: list[tuple[int, str]] = []
        policy_denials: list[str] = []

        for pid in candidates:
            client = self._providers.get(pid)
            if client is None:
                continue

            # Policy gate
            policy_result = self._policy.evaluate(req, pid)
            if not policy_result.allowed:
                policy_denials.append(f"{pid}: {policy_result.reason}")
                continue

            score = 50  # base score

            # Preferred provider bonus
            if req.constraints.preferred_provider == pid:
                score += 20

            # Priority from metadata
            meta = _PROVIDER_META.get(pid, {})
            score += (10 - meta.get("priority", 5))

            # Latency history: lower average = higher score
            history = self._latency_history.get(pid, [])
            if history:
                avg_latency = sum(history) / len(history)
                # Max latency constraint
                if req.constraints.max_latency_ms and avg_latency > req.constraints.max_latency_ms:
                    score -= 30
                else:
                    score += max(0, 20 - int(avg_latency / 100))

            scored.append((score, pid))

        if not scored:
            reasons = "; ".join(policy_denials) if policy_denials else "no eligible providers"
            raise PolicyDeniedError(f"All providers denied by policy: {reasons}")

        # Sort descending by score
        scored.sort(key=lambda x: x[0], reverse=True)
        best_id = scored[0][1]
        return best_id, self._providers[best_id]

    def _get_capable_providers(self, capability: str) -> list[str]:
        """Return provider IDs that claim to support a capability."""
        return CAPABILITY_REGISTRY.get(capability, [])

    # ------------------------------------------------------------------
    # Fallback chain
    # ------------------------------------------------------------------

    def _build_fallback_chain(
        self,
        capability: str,
        excluded: list[str],
    ) -> list[str]:
        """Build ordered fallback chain excluding already-tried providers.

        Fallback is same-class only: we never fall back across provider
        classes (e.g. from a text provider to a speech provider).
        """
        all_providers = self._get_capable_providers(capability)
        return [pid for pid in all_providers if pid not in excluded]

    # ------------------------------------------------------------------
    # Execution
    # ------------------------------------------------------------------

    def _execute_with_fallback(
        self,
        req: CapabilityRequest,
        provider_id: str,
        client: Any,
        trace: DecisionTrace,
    ) -> tuple[dict, str, bool, int]:
        """Execute with automatic same-class fallback on failure.

        Returns (output_dict, provider_id, fallback_used, latency_ms).
        """
        trace.candidates_evaluated = self._get_capable_providers(req.capability)
        trace.selected_provider = provider_id
        trace.selection_reason = "highest scoring eligible provider"

        tried: list[str] = []
        current_id = provider_id
        current_client = client
        fallback_used = False

        while True:
            tried.append(current_id)

            # Attempt execution with retries on the current provider
            result, latency = self._execute_single(req, current_id, current_client)

            if result is not None and result.success:
                self._record_latency(current_id, latency)
                trace.policy_checks = self._policy.evaluate(req, current_id).checks_performed
                trace.fallback_chain = tried
                return (
                    {"text": result.output, "metadata": result.metadata},
                    current_id,
                    fallback_used,
                    latency,
                )

            # Try fallback to next same-class provider
            chain = self._build_fallback_chain(req.capability, tried)
            if not chain:
                trace.fallback_chain = tried
                raise FallbackExhaustedError(
                    f"All providers exhausted for '{req.capability}': tried {tried}"
                )

            # Move to next provider
            next_id = chain[0]
            next_client = self._providers.get(next_id)
            if next_client is None:
                trace.fallback_chain = tried
                raise FallbackExhaustedError(
                    f"Fallback provider '{next_id}' not available"
                )

            # Policy check on fallback provider
            policy_result = self._policy.evaluate(req, next_id)
            if not policy_result.allowed:
                trace.fallback_chain = tried
                raise PolicyDeniedError(
                    f"Fallback provider '{next_id}' denied: {policy_result.reason}"
                )

            logger.info(
                "Falling back from %s to %s for %s",
                current_id, next_id, req.capability,
            )
            current_id = next_id
            current_client = next_client
            fallback_used = True

    def _execute_single(
        self,
        req: CapabilityRequest,
        provider_id: str,
        client: Any,
    ) -> tuple[InferenceResult | None, int]:
        """Execute on a single provider with retry.

        Returns (InferenceResult_or_None, latency_ms).
        """
        last_result: InferenceResult | None = None
        total_latency = 0

        for attempt in range(self._retry.max_retries + 1):
            if attempt > 0:
                delay = self._retry.delay_ms(attempt - 1)
                time.sleep(delay / 1000.0)

            t0 = time.monotonic()

            prompt = req.input.get("prompt", "")
            system = req.input.get("system", "")
            temperature = req.input.get("temperature", 0.3)

            try:
                last_result = client.generate(
                    prompt,
                    system=system,
                    temperature=temperature,
                )
            except Exception as exc:
                latency = int((time.monotonic() - t0) * 1000)
                total_latency += latency
                logger.warning(
                    "Provider %s attempt %d failed: %s",
                    provider_id, attempt, exc,
                )
                error = ProviderFailedError(str(exc))
                if not self._retry.should_retry(attempt, error):
                    return None, total_latency
                continue

            latency = last_result.latency_ms if last_result else int((time.monotonic() - t0) * 1000)
            total_latency += latency

            if last_result and last_result.success:
                return last_result, total_latency

            # Check if retryable
            error = ProviderFailedError(last_result.error or "unknown error")
            if not self._retry.should_retry(attempt, error):
                return last_result, total_latency

        return last_result, total_latency

    def _record_latency(self, provider_id: str, latency_ms: int) -> None:
        """Record latency for future provider scoring (keep last 20)."""
        history = self._latency_history.setdefault(provider_id, [])
        history.append(latency_ms)
        if len(history) > 20:
            self._latency_history[provider_id] = history[-20:]
