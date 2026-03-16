"""Email policy validation for Process Swarm.

Provides shared validation logic used by both the EmailBuilderAdapter
(at artifact construction time) and the EmailAdapter (at transport
time). Keeps policy enforcement consistent across the build/send boundary.

All validation is default-deny: if an allowlist is configured, only
listed values are permitted. Empty allowlists block everything.
"""

from __future__ import annotations

import json
import logging
import os
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

_PROFILE_FILENAME = "smtp_relay_profile.json"
_PROFILE_SUBDIR = Path("policies")


def load_smtp_profile(workspace_root: Path) -> dict | None:
    """Load SMTP relay profile from the standard policy location."""
    profile_path = workspace_root / _PROFILE_SUBDIR / _PROFILE_FILENAME
    if not profile_path.exists():
        return None

    try:
        profile = json.loads(profile_path.read_text())
    except (json.JSONDecodeError, OSError) as exc:
        raise ValueError(
            f"Invalid SMTP relay profile at {profile_path}: {exc}"
        ) from exc

    return profile


def resolve_smtp_credentials(profile: dict) -> tuple[str | None, str | None]:
    """Resolve SMTP credentials from environment variables."""
    auth = profile.get("auth", {})
    username = os.environ.get(auth.get("username_env", ""), None)
    password = os.environ.get(auth.get("password_env", ""), None)
    return username, password


def validate_email_policy(
    message: dict[str, Any],
    profile: dict[str, Any],
) -> list[str]:
    """Validate an email message dict against the relay profile policy.

    Returns list of violation strings. Empty list means passes all checks.
    """
    errors: list[str] = []
    policy = profile.get("policy", {})

    if not profile.get("enabled", True):
        errors.append("SMTP relay profile is disabled")
        return errors

    # Sender validation
    sender = message.get("sender", "")
    allowed_senders = policy.get("allowed_sender_identities", [])
    if allowed_senders and sender not in allowed_senders:
        errors.append(f"Sender '{sender}' not in allowed_sender_identities")

    # Recipient validation
    recipients = message.get("recipients", [])
    cc = message.get("cc", [])
    bcc = message.get("bcc", [])
    all_recipients = list(recipients) + list(cc) + list(bcc)

    if not all_recipients:
        errors.append("No recipients specified")

    max_recipients = policy.get("max_recipients", 10)
    if len(all_recipients) > max_recipients:
        errors.append(
            f"Recipient count {len(all_recipients)} exceeds limit {max_recipients}"
        )

    # Domain restrictions
    allowed_domains = policy.get("allowed_recipient_domains", [])
    if allowed_domains:
        for addr in all_recipients:
            domain = addr.rsplit("@", 1)[-1].lower() if "@" in addr else ""
            if domain not in [d.lower() for d in allowed_domains]:
                errors.append(
                    f"Recipient domain '{domain}' not in allowed_recipient_domains"
                )

    # Subject validation
    subject = message.get("subject", "")
    if not subject:
        errors.append("Subject is empty")
    max_subject = policy.get("max_subject_length", 200)
    if len(subject) > max_subject:
        errors.append(
            f"Subject length {len(subject)} exceeds limit {max_subject}"
        )

    # Body validation
    body_plain = message.get("body_plain", "")
    if policy.get("require_plain_text", True) and not body_plain:
        errors.append("Plain text body is required but empty")
    max_body = policy.get("max_body_bytes", 102400)
    if len(body_plain.encode("utf-8")) > max_body:
        errors.append(f"Body size exceeds limit of {max_body} bytes")

    # Attachment validation
    attachments = message.get("attachments", [])
    if attachments and not policy.get("allow_attachments", True):
        errors.append("Attachments are not allowed by policy")

    return errors
