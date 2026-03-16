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
    LoadTier,
    RoutingConstraints,
    RoutingRequest,
    TaskType,
)

logger = logging.getLogger(__name__)


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
    ) -> Optional[str]: ...


class ACDSInferenceProvider:
    """Inference provider backed by the ACDS Dispatch API.

    Routes each inference request through ACDS, which selects the best
    available model based on task type, cognitive grade, and policy.
    Falls back to None (rules mode) if ACDS is unreachable.
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
            base_url=config.get("acds_base_url", "http://localhost:3000"),
            auth_token=config.get("acds_auth_token"),
            timeout_seconds=config.get("acds_timeout_seconds", 30),
        )
        logger.info("Inference provider: ACDS at %s", client.base_url)
        return ACDSInferenceProvider(client)

    logger.info("Inference provider: rules-only (no LLM)")
    return RulesOnlyProvider()
