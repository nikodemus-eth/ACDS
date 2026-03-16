"""Delivery adapters for Process Swarm.

Each adapter implements the send() interface for a specific
delivery channel. EmailAdapter supports both stub mode (no config)
and real SMTP transport (with smtp_config).
"""

from __future__ import annotations

import logging
import smtplib
import uuid
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path

from swarm.delivery.validation import resolve_smtp_credentials, validate_email_policy

logger = logging.getLogger(__name__)


class DeliveryAdapter:
    """Base adapter interface for delivery channels."""

    def send(self, destination: str, message: dict) -> dict:
        """Send a message to a destination.

        Returns dict with success, provider_message_id, provider_response.
        """
        raise NotImplementedError


class EmailAdapter(DeliveryAdapter):
    """Email delivery adapter with stub and SMTP modes.

    Without smtp_config: stub mode (logs only).
    With smtp_config containing a valid host: real SMTP transport.
    """

    def __init__(self, *, smtp_config: dict | None = None):
        self._config = smtp_config

    @property
    def _is_stub(self) -> bool:
        if self._config is None:
            return True
        return not self._config.get("host", "")

    def send(self, destination: str, message: dict) -> dict:
        if self._is_stub:
            return self._send_stub(destination, message)

        # Policy validation
        policy_msg = {
            "sender": self._config.get("sender", {}).get("address", ""),
            "recipients": [destination],
            "subject": message.get("subject", "Swarm Execution Result"),
            "body_plain": message.get("body", ""),
        }
        errors = validate_email_policy(policy_msg, self._config)
        if errors:
            return {
                "success": False,
                "provider_message_id": None,
                "provider_response": f"POLICY_REJECTED: {'; '.join(errors)}",
            }

        return self._send_smtp(destination, message)

    def _send_stub(self, destination: str, message: dict) -> dict:
        run_id = message.get("run_id", "unknown")
        logger.info(
            "EMAIL DELIVERY [stub]: to=%s swarm=%s run=%s",
            destination,
            message.get("swarm_name", "unknown"),
            run_id,
        )
        return {
            "success": True,
            "provider_message_id": f"email-stub-{run_id}",
            "provider_response": f"Stub delivery to {destination}",
        }

    def _send_smtp(self, destination: str, message: dict) -> dict:
        run_id = message.get("run_id", "unknown")
        subject = message.get("subject", "Swarm Execution Result")
        body = message.get("body", "")
        sender_cfg = self._config.get("sender", {})
        sender_addr = sender_cfg.get("address", "noreply@localhost")

        username, password = resolve_smtp_credentials(self._config)

        msg = MIMEText(body, "plain")
        msg["From"] = sender_addr
        msg["To"] = destination
        msg["Subject"] = subject

        host = self._config["host"]
        port = self._config.get("port", 587)
        timeout = self._config.get("connection", {}).get("timeout_seconds", 30)

        try:
            server = smtplib.SMTP(host, port, timeout=timeout)
            if self._config.get("tls_mode", "starttls") == "starttls":
                server.starttls()
            if username and password:
                server.login(username, password)
            server.send_message(msg)
            server.quit()
        except smtplib.SMTPAuthenticationError as exc:
            return {
                "success": False,
                "provider_message_id": None,
                "provider_response": f"SMTP authentication failed: {exc.smtp_code}",
            }
        except OSError as exc:
            return {
                "success": False,
                "provider_message_id": None,
                "provider_response": f"TRANSPORT_FAILED: {exc}",
            }

        msg_id = f"smtp-{uuid.uuid4().hex[:12]}"
        return {
            "success": True,
            "provider_message_id": msg_id,
            "provider_response": f"Sent via {host}:{port}",
        }


class TelegramAdapter(DeliveryAdapter):
    """MVP Telegram delivery adapter (stub — logs only)."""

    def send(self, destination: str, message: dict) -> dict:
        run_id = message.get("run_id", "unknown")
        logger.info(
            "TELEGRAM DELIVERY [stub]: chat_id=%s swarm=%s run=%s",
            destination,
            message.get("swarm_name", "unknown"),
            run_id,
        )
        return {
            "success": True,
            "provider_message_id": f"tg-stub-{run_id}",
            "provider_response": f"Stub delivery to chat {destination}",
        }
