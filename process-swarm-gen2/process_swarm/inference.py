"""Inference provider abstraction for Process Swarm.

Defines a protocol for LLM inference that can be backed by ACDS
(Adaptive Cognitive Dispatch System) or run in rules-only mode.
"""
from __future__ import annotations

import logging
from typing import Optional, Protocol, runtime_checkable

from process_swarm.acds_client import (
    ACDSClient,
    ACDSClientError,
    CognitiveGrade,
    DecisionPosture,
    DispatchRunRequest,
    ExecutionConstraints,
    IntentEnvelope,
    LoadTier,
    RoutingConstraints,
    RoutingRequest,
    TaskType,
    TriageRunRequest,
)
from datetime import datetime, timezone

logger = logging.getLogger(__name__)


COGNITIVE_TO_QUALITY = {
    CognitiveGrade.BASIC.value: "low",
    CognitiveGrade.STANDARD.value: "medium",
    CognitiveGrade.ENHANCED.value: "high",
    CognitiveGrade.FRONTIER.value: "critical",
    CognitiveGrade.SPECIALIZED.value: "critical",
}


@runtime_checkable
class InferenceProvider(Protocol):
    """Protocol for LLM inference backends.

    Implementations return the model's text output, or None if inference
    is unavailable (signaling the caller to fall back to rules).
    """

    def infer(
        self,
        prompt: str,
        *,
        task_type: str = TaskType.GENERATION.value,
        cognitive_grade: str = CognitiveGrade.STANDARD.value,
        process: str = "definer",
        step: str = "general",
        sensitivity: str = "internal",
        modality: str = "text_to_text",
        quality_tier: Optional[str] = None,
        run_id: Optional[str] = None,
    ) -> Optional[str]: ...


class ACDSInferenceProvider:
    """Inference provider backed by the ACDS ITS (Inference Triage System).

    Routes each inference request through ACDS /triage/run, which selects
    the minimum sufficient model based on task characteristics and policy.
    Falls back to legacy /dispatch/run if /triage/run is unavailable,
    then to None (rules mode) if ACDS is unreachable entirely.
    """

    def __init__(self, client: ACDSClient):
        self._client = client

    def infer(
        self,
        prompt: str,
        *,
        task_type: str = TaskType.GENERATION.value,
        cognitive_grade: str = CognitiveGrade.STANDARD.value,
        process: str = "definer",
        step: str = "general",
        sensitivity: str = "internal",
        modality: str = "text_to_text",
        quality_tier: Optional[str] = None,
        run_id: Optional[str] = None,
    ) -> Optional[str]:
        resolved_quality = quality_tier or COGNITIVE_TO_QUALITY.get(cognitive_grade, "medium")

        # Try ITS triage first
        try:
            return self._infer_via_triage(
                prompt, task_type=task_type, process=process, step=step,
                sensitivity=sensitivity, modality=modality, quality_tier=resolved_quality,
            )
        except ACDSClientError as e:
            if e.status_code == 404:
                logger.info("ITS /triage/run not available (404), falling back to /dispatch/run")
            else:
                logger.warning("ITS triage failed (%s), falling back to /dispatch/run", e)

        # Fall back to legacy dispatch
        return self._infer_via_dispatch(
            prompt, task_type=task_type, cognitive_grade=cognitive_grade,
            process=process, step=step, run_id=run_id,
        )

    def _infer_via_triage(
        self,
        prompt: str,
        *,
        task_type: str,
        process: str,
        step: str,
        sensitivity: str,
        modality: str,
        quality_tier: str,
    ) -> Optional[str]:
        import uuid
        envelope = IntentEnvelope(
            intentId=str(uuid.uuid4()),
            taskClass=task_type,
            modality=modality,
            sensitivity=sensitivity,
            qualityTier=quality_tier,
            latencyTargetMs=30000,
            costSensitivity="medium",
            executionConstraints=ExecutionConstraints(
                localOnly=True,
                externalAllowed=False,
                offlineRequired=False,
            ),
            contextSizeEstimate="small",
            requiresSchemaValidation=False,
            origin="process_swarm",
            timestamp=datetime.now(timezone.utc).isoformat(),
        )
        request = TriageRunRequest(envelope=envelope, inputPayload=prompt)
        response = self._client.triage(request)

        if response.status == "succeeded":
            triage_id = response.triageDecision.get("triageId", "?")
            logger.info(
                "ITS triage succeeded: triageId=%s model=%s latency=%dms",
                triage_id, response.selectedModelProfileId, response.latencyMs,
            )
            return response.normalizedOutput

        logger.warning("ITS triage returned status=%s for step=%s", response.status, step)
        return None

    def _infer_via_dispatch(
        self,
        prompt: str,
        *,
        task_type: str,
        cognitive_grade: str,
        process: str,
        step: str,
        run_id: Optional[str] = None,
    ) -> Optional[str]:
        routing = RoutingRequest(
            application="process_swarm",
            process=process,
            step=step,
            taskType=task_type,
            loadTier=LoadTier.SINGLE_SHOT.value,
            decisionPosture=DecisionPosture.OPERATIONAL.value,
            cognitiveGrade=cognitive_grade,
            input=prompt,
            constraints=RoutingConstraints(
                privacy="local_only",
                maxLatencyMs=30000,
                costSensitivity="medium",
                structuredOutputRequired=False,
                traceabilityRequired=True,
            ),
        )
        request = DispatchRunRequest(
            routingRequest=routing,
            inputPayload=prompt,
            inputFormat="text",
            requestId=run_id,
        )
        try:
            response = self._client.dispatch(request)
            if response.status in ("succeeded", "fallback_succeeded"):
                logger.info(
                    "ACDS dispatch succeeded: model=%s latency=%dms fallback=%s",
                    response.selectedModelProfileId,
                    response.latencyMs,
                    response.fallbackUsed,
                )
                return response.normalizedOutput
            logger.warning(
                "ACDS dispatch returned status=%s for step=%s",
                response.status, step,
            )
            return None
        except ACDSClientError as e:
            logger.warning("ACDS dispatch failed (%s), falling back to rules", e)
            return None


class RulesOnlyProvider:
    """Stub provider that always returns None, forcing rules-based logic."""

    def infer(
        self,
        prompt: str,
        *,
        task_type: str = TaskType.GENERATION.value,
        cognitive_grade: str = CognitiveGrade.STANDARD.value,
        process: str = "definer",
        step: str = "general",
        sensitivity: str = "internal",
        modality: str = "text_to_text",
        quality_tier: Optional[str] = None,
        run_id: Optional[str] = None,
    ) -> Optional[str]:
        return None


def create_inference_provider(config: dict) -> InferenceProvider:
    """Factory that creates the appropriate inference provider from config.

    Config keys:
        provider: "acds" | "rules" (default: "rules")
        acds_base_url: str (default: "http://localhost:3000")
        acds_auth_token: str | None
        acds_timeout_seconds: int (default: 30)
    """
    provider_type = config.get("provider", "rules")

    if provider_type == "acds":
        client = ACDSClient(
            base_url=config.get("acds_base_url", "http://localhost:3100"),
            auth_token=config.get("acds_auth_token"),
            timeout_seconds=config.get("acds_timeout_seconds", 30),
        )
        logger.info("Inference provider: ACDS at %s", client.base_url)
        return ACDSInferenceProvider(client)

    logger.info("Inference provider: rules-only (no LLM)")
    return RulesOnlyProvider()
