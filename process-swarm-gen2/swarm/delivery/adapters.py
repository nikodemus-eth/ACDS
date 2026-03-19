"""Delivery adapters for Process Swarm.

Each adapter implements the send() interface for a specific
delivery channel. EmailAdapter supports both stub mode (no config)
and real SMTP transport (with smtp_config).
"""

from __future__ import annotations

import json
import logging
import os
import smtplib
import urllib.error
import urllib.request
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
    """Email delivery adapter via SMTP.

    Without smtp_config: reports honest failure (no transport available).
    With smtp_config containing a valid host: real SMTP transport.
    """

    def __init__(self, *, smtp_config: dict | None = None):
        self._config = smtp_config

    @property
    def _is_configured(self) -> bool:
        if self._config is None:
            return False
        return bool(self._config.get("host", ""))

    def send(self, destination: str, message: dict) -> dict:
        if not self._is_configured:
            return self._send_unconfigured(destination, message)

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

    def _send_unconfigured(self, destination: str, message: dict) -> dict:
        run_id = message.get("run_id", "unknown")
        logger.warning(
            "EMAIL DELIVERY SKIPPED: SMTP not configured. to=%s swarm=%s run=%s",
            destination,
            message.get("swarm_name", "unknown"),
            run_id,
        )
        return {
            "success": False,
            "provider_message_id": None,
            "provider_response": "SMTP not configured — no email transport available",
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
    """Telegram delivery adapter via Bot API.

    Without bot_token: reports honest failure.
    With bot_token: sends real messages via https://api.telegram.org.
    """

    def __init__(self, *, bot_token: str | None = None):
        self._token = bot_token or os.environ.get("TELEGRAM_BOT_TOKEN")

    def send(self, destination: str, message: dict) -> dict:
        run_id = message.get("run_id", "unknown")

        if not self._token:
            logger.warning(
                "TELEGRAM DELIVERY SKIPPED: no bot token. chat_id=%s run=%s",
                destination, run_id,
            )
            return {
                "success": False,
                "provider_message_id": None,
                "provider_response": "Telegram bot token not configured",
            }

        subject = message.get("subject", "Swarm Result")
        body = message.get("body", "")
        text = f"*{subject}*\n\n{body}" if body else subject

        # Token must be in URL path per Telegram Bot API design.
        # Never log this URL directly — use _safe_url() for log output.
        url = f"https://api.telegram.org/bot{self._token}/sendMessage"
        payload = json.dumps({
            "chat_id": destination,
            "text": text,
            "parse_mode": "Markdown",
        }).encode()

        req = urllib.request.Request(
            url,
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )

        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                result = json.loads(resp.read())
                msg_id = result.get("result", {}).get("message_id", "")
                logger.info(
                    "TELEGRAM DELIVERY SENT: chat_id=%s message_id=%s run=%s",
                    destination, msg_id, run_id,
                )
                return {
                    "success": True,
                    "provider_message_id": f"tg-{msg_id}",
                    "provider_response": f"Sent to chat {destination}",
                }
        except urllib.error.HTTPError as exc:
            error_body = exc.read().decode(errors="replace")
            # Log full error at DEBUG only; never expose raw API response
            logger.debug("Telegram API error body: %s", error_body)
            logger.error(
                "Telegram API error %s for chat_id=%s run=%s",
                exc.code, destination, run_id,
            )
            return {
                "success": False,
                "provider_message_id": None,
                "provider_response": f"Telegram API error {exc.code}",
            }
        except OSError as exc:
            # Sanitize: str(exc) could contain the URL with token
            safe_msg = str(exc)
            if self._token and self._token in safe_msg:
                safe_msg = safe_msg.replace(self._token, "***")
            return {
                "success": False,
                "provider_message_id": None,
                "provider_response": f"TRANSPORT_FAILED: {safe_msg}",
            }
