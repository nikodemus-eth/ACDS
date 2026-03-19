"""Delivery Engine for Process Swarm.

Dispatches execution results to configured delivery channels
after swarm runs complete. Records delivery receipts for audit.

The engine is downstream from the runtime and must not
modify runtime artifacts.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Optional

from swarm.delivery.adapters import (
    DeliveryAdapter,
    EmailAdapter,
    TelegramAdapter,
)
from swarm.events.recorder import EventRecorder
from swarm.governance.warnings import (
    evaluate_secondary_truth,
    persist_warning_records,
)
from swarm.registry.repository import SwarmRepository

logger = logging.getLogger(__name__)

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class DeliveryEngine:
    """Post-execution delivery dispatcher."""

    def __init__(
        self,
        repository: SwarmRepository,
        event_recorder: EventRecorder,
        *,
        smtp_config: dict | None = None,
        telegram_bot_token: str | None = None,
    ):
        self.repo = repository
        self.events = event_recorder
        self.adapters: dict[str, DeliveryAdapter] = {
            "email": EmailAdapter(smtp_config=smtp_config),
            "telegram": TelegramAdapter(bot_token=telegram_bot_token),
        }

    def deliver(self, run_id: str) -> Optional[str]:
        """Deliver results for a completed run.

        Returns receipt_id if delivery was sent, None if no delivery configured.
        """
        run = self.repo.get_run(run_id)
        if not run:
            return None

        swarm_id = run["swarm_id"]
        swarm = self.repo.get_swarm(swarm_id)
        if not swarm:
            return None

        # Check if delivery is configured
        delivery_id = swarm.get("delivery_id")
        if not delivery_id:
            delivery_config = self.repo.get_delivery_by_swarm(swarm_id)
        else:
            delivery_config = self.repo.get_delivery(delivery_id)

        if not delivery_config:
            return None

        if not delivery_config.get("enabled"):
            return None

        # Secondary truth policy check
        truth_warnings = evaluate_secondary_truth(
            run=run,
            trigger_stage="delivery_resolution",
            actor_id="system",
            actor_role="delivery_engine",
            preview_only=False,
            affected_artifact_refs=[run_id],
        )
        block_warnings = [
            w for w in truth_warnings if w["severity"] == "block"
        ]
        for w in truth_warnings:
            w["swarm_id"] = swarm_id
            w["run_id"] = run_id
        if block_warnings:
            persist_warning_records(
                self.repo,
                self.events,
                block_warnings,
                operator_decision="blocked_by_system",
            )
            return None

        delivery_type = delivery_config["delivery_type"]
        destination = delivery_config["destination"]
        actual_delivery_id = delivery_config["delivery_id"]

        # Recipient profile resolution
        profile_id = delivery_config.get("recipient_profile_id")
        resolved_recipients = None
        if profile_id and delivery_type == "email":
            resolution = self._resolve_recipient_profile(
                profile_id, swarm_id, run_id, actual_delivery_id
            )
            if resolution.get("error"):
                with self.repo.atomic():
                    receipt_id = self.repo.create_delivery_receipt(
                        run_id=run_id,
                        delivery_id=actual_delivery_id,
                        delivery_type=delivery_type,
                        status="failed",
                        provider_response_summary=resolution["error"],
                    )
                    self.repo.update_run(run_id, delivery_status="failed")
                    self.events.delivery_failed(
                        swarm_id, run_id, resolution["error"]
                    )
                return receipt_id
            resolved_recipients = resolution

        # Get adapter
        adapter = self.adapters.get(delivery_type)
        if not adapter:
            with self.repo.atomic():
                receipt_id = self.repo.create_delivery_receipt(
                    run_id=run_id,
                    delivery_id=actual_delivery_id,
                    delivery_type=delivery_type,
                    status="failed",
                    provider_response_summary=f"No adapter for type '{delivery_type}'",
                )
                self.repo.update_run(run_id, delivery_status="failed")
                self.events.delivery_failed(
                    swarm_id, run_id, f"No adapter for type '{delivery_type}'"
                )
            return receipt_id

        # Build message
        message = self._build_message(swarm, run, delivery_config)

        # Attach resolved recipients
        if resolved_recipients:
            message["to"] = resolved_recipients["to"]
            message["cc"] = resolved_recipients.get("cc", [])
            message["bcc"] = resolved_recipients.get("bcc", [])
            destination = ", ".join(resolved_recipients["to"])

        # Dispatch
        try:
            result = adapter.send(destination, message)
        except Exception as e:
            with self.repo.atomic():
                receipt_id = self.repo.create_delivery_receipt(
                    run_id=run_id,
                    delivery_id=actual_delivery_id,
                    delivery_type=delivery_type,
                    status="failed",
                    provider_response_summary=str(e),
                )
                self.repo.update_run(run_id, delivery_status="failed")
                self.events.delivery_failed(swarm_id, run_id, str(e))
            return receipt_id

        # Record receipt atomically
        with self.repo.atomic():
            if result.get("success"):
                receipt_id = self.repo.create_delivery_receipt(
                    run_id=run_id,
                    delivery_id=actual_delivery_id,
                    delivery_type=delivery_type,
                    status="sent",
                    provider_message_id=result.get("provider_message_id"),
                    provider_response_summary=result.get("provider_response"),
                )
                self.repo.update_run(run_id, delivery_status="sent")
                self.events.delivery_sent(swarm_id, run_id, receipt_id)
            else:
                receipt_id = self.repo.create_delivery_receipt(
                    run_id=run_id,
                    delivery_id=actual_delivery_id,
                    delivery_type=delivery_type,
                    status="failed",
                    provider_response_summary=result.get(
                        "provider_response", "Unknown failure"
                    ),
                )
                self.repo.update_run(run_id, delivery_status="failed")
                self.events.delivery_failed(
                    swarm_id, run_id, result.get("provider_response", "Unknown")
                )

        return receipt_id

    def _build_message(
        self,
        swarm: dict,
        run: dict,
        delivery_config: dict,
    ) -> dict:
        """Construct the delivery message payload."""
        swarm_name = swarm.get("swarm_name", "Unknown Swarm")
        run_id = run.get("run_id", "unknown")
        run_status = run.get("run_status", "unknown")

        artifact_refs = run.get("artifact_refs_json")
        if artifact_refs and isinstance(artifact_refs, str):
            try:
                artifact_refs = json.loads(artifact_refs)
            except json.JSONDecodeError:
                artifact_refs = []
        artifact_refs = artifact_refs or []

        status_label = "Completed" if run_status == "succeeded" else "Failed"
        subject = f"[Process Swarm] {swarm_name} — {status_label}"

        template = delivery_config.get("message_template")
        if template:
            body = template.format(
                swarm_name=swarm_name,
                run_id=run_id,
                status=run_status,
                artifact_list="\n".join(f"  - {a}" for a in artifact_refs),
            )
        else:
            body_lines = [
                f"Swarm: {swarm_name}",
                f"Run: {run_id}",
                f"Status: {run_status}",
            ]
            if run.get("error_summary"):
                body_lines.append(f"Error: {run['error_summary']}")
            if artifact_refs:
                body_lines.append("Artifacts:")
                for a in artifact_refs:
                    body_lines.append(f"  - {a}")
            body = "\n".join(body_lines)

        return {
            "subject": subject,
            "body": body,
            "swarm_name": swarm_name,
            "run_id": run_id,
            "status": run_status,
            "artifacts": artifact_refs,
        }

    def _resolve_recipient_profile(
        self,
        profile_id: str,
        swarm_id: str,
        run_id: str,
        delivery_id: str,
    ) -> dict:
        """Resolve a recipient profile to delivery addresses (fail-closed)."""
        profile = self.repo.get_recipient_profile(profile_id)
        if not profile:
            return {
                "error": f"RECIPIENT_PROFILE_NOT_FOUND: {profile_id}",
                "code": "RECIPIENT_PROFILE_NOT_FOUND",
            }

        if not profile.get("enabled"):
            return {
                "error": f"RECIPIENT_PROFILE_DISABLED: {profile_id}",
                "code": "RECIPIENT_PROFILE_DISABLED",
            }

        to_addrs = profile.get("to_addresses", [])
        cc_addrs = profile.get("cc_addresses") or []
        bcc_addrs = profile.get("bcc_addresses") or []

        if not to_addrs:
            return {
                "error": f"RECIPIENT_PROFILE_INVALID_ADDRESS: no to_addresses in {profile_id}",
                "code": "RECIPIENT_PROFILE_INVALID_ADDRESS",
            }

        all_addrs = to_addrs + cc_addrs + bcc_addrs
        invalid = [a for a in all_addrs if not _EMAIL_RE.match(a)]
        if invalid:
            return {
                "error": f"RECIPIENT_PROFILE_INVALID_ADDRESS: {', '.join(invalid[:5])}",
                "code": "RECIPIENT_PROFILE_INVALID_ADDRESS",
            }

        max_recipients = profile.get("max_recipients")
        if max_recipients and len(all_addrs) > max_recipients:
            return {
                "error": f"RECIPIENT_LIMIT_EXCEEDED: {len(all_addrs)} > {max_recipients}",
                "code": "RECIPIENT_LIMIT_EXCEEDED",
            }

        return {
            "to": to_addrs,
            "cc": cc_addrs,
            "bcc": bcc_addrs,
            "profile_name": profile.get("profile_name"),
        }
