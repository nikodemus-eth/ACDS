"""Session Watcher — monitors gateway session logs and records runs to M4.

Tails the OpenClaw gateway session JSONL files, detects completed agent
runs, and feeds them to GatewayRecorder so every run shows up in ProofUI.

The watcher maintains a cursor file so it only processes new entries
on restart.
"""

from __future__ import annotations

import json
import logging
import re
import signal
import time
from pathlib import Path
from typing import Optional

from swarm.bridge.gateway_recorder import GatewayRecorder

logger = logging.getLogger(__name__)


class SessionWatcher:
    """Watches OpenClaw gateway session files for completed agent runs."""

    def __init__(
        self,
        openclaw_root: str | Path,
        state_home: str | Path,
    ):
        self.openclaw_root = Path(openclaw_root).resolve()
        self.state_home = Path(state_home).resolve()
        self.sessions_dir = self.state_home / "agents" / "main" / "sessions"
        self.cursor_file = self.openclaw_root / ".bridge_cursor.json"
        self.recorder = GatewayRecorder(self.openclaw_root)
        self.cursors: dict[str, int] = self._load_cursors()
        self._running = True

    def _load_cursors(self) -> dict[str, int]:
        """Load cursor positions from disk."""
        if self.cursor_file.exists():
            try:
                with open(self.cursor_file) as f:
                    return json.load(f)
            except (json.JSONDecodeError, OSError):
                pass
        return {}

    def _save_cursors(self):
        """Persist cursor positions."""
        with open(self.cursor_file, "w") as f:
            json.dump(self.cursors, f)

    def scan_sessions(self) -> int:
        """Scan all session JSONL files for new completed runs.

        Returns the number of new runs recorded.
        """
        if not self.sessions_dir.exists():
            return 0

        recorded = 0
        for session_file in self.sessions_dir.glob("*.jsonl"):
            if session_file.name.endswith(".lock"):
                continue
            recorded += self._process_session_file(session_file)

        if recorded > 0:
            self._save_cursors()

        return recorded

    def _process_session_file(self, path: Path) -> int:
        """Process a single session JSONL file from the cursor position."""
        key = path.name
        cursor = self.cursors.get(key, 0)
        recorded = 0
        last_user_message: Optional[str] = None
        session_model_info: dict = {}

        try:
            with open(path) as f:
                f.seek(cursor)
                while True:
                    line = f.readline()
                    if not line:
                        break
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        entry = json.loads(line)
                    except json.JSONDecodeError:
                        continue

                    entry_type = entry.get("type")

                    # Track model changes
                    if entry_type == "model_change":
                        session_model_info["provider"] = entry.get(
                            "provider", "unknown"
                        )
                        session_model_info["model"] = entry.get(
                            "modelId", "unknown"
                        )
                        continue

                    # Track model snapshots
                    if (
                        entry_type == "custom"
                        and entry.get("customType") == "model-snapshot"
                    ):
                        data = entry.get("data", {})
                        session_model_info["provider"] = data.get(
                            "provider",
                            session_model_info.get("provider", "unknown"),
                        )
                        session_model_info["model"] = data.get(
                            "modelId",
                            session_model_info.get("model", "unknown"),
                        )
                        continue

                    if entry_type != "message":
                        continue

                    msg = entry.get("message", {})
                    role = msg.get("role")

                    if role == "user":
                        content = msg.get("content", "")
                        if isinstance(content, list):
                            texts = [
                                p.get("text", "")
                                for p in content
                                if isinstance(p, dict)
                                and p.get("type") == "text"
                            ]
                            content = "\n".join(texts)
                        real_text = self._extract_user_text(content)
                        if real_text:
                            last_user_message = real_text

                    elif role == "assistant" and last_user_message:
                        content = msg.get("content", "")
                        if isinstance(content, list):
                            texts = [
                                p.get("text", "")
                                for p in content
                                if isinstance(p, dict)
                                and p.get("type") == "text"
                            ]
                            content = "\n".join(texts)
                        if not content or len(content.strip()) == 0:
                            continue

                        entry_id = entry.get("id", str(hash(content))[:12])

                        self._record_turn(
                            entry_id=entry_id,
                            user_message=last_user_message,
                            response_text=content,
                            session_id=path.stem,
                            model_info=session_model_info,
                        )
                        recorded += 1
                        last_user_message = None

                self.cursors[key] = f.tell()
        except OSError as e:
            logger.warning("Failed to read session %s: %s", path, e)

        return recorded

    @staticmethod
    def _extract_user_text(content: str) -> Optional[str]:
        """Extract the real user message from gateway-wrapped content.

        Gateway wraps user messages with metadata and timestamps.
        Returns None for system-generated messages.
        """
        if not content or not content.strip():
            return None

        skip_prefixes = (
            "A new session was started",
            "Continue where you left off",
            "The previous model attempt",
        )
        for prefix in skip_prefixes:
            if content.strip().startswith(prefix):
                return None

        text = content.strip()

        # Strip metadata wrapper if present
        if text.startswith("Conversation info (untrusted metadata):"):
            match = re.search(r"```\s*\n\s*\[.*?\]\s*(.*)", text, re.DOTALL)
            if match:
                text = match.group(1).strip()
            else:
                match = re.search(
                    r"\[(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s.*?\]\s*(.*)",
                    text,
                    re.DOTALL,
                )
                if match:
                    text = match.group(1).strip()
                else:
                    return None

        # Strip leading timestamp
        text = re.sub(
            r"^\[(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}\s+\w+\]\s*",
            "",
            text,
        ).strip()

        if not text:
            return None

        return text

    def _record_turn(
        self,
        entry_id: str,
        user_message: str,
        response_text: str,
        session_id: str,
        model_info: dict,
    ):
        """Record a user->assistant turn as M4 artifacts."""
        try:
            self.recorder.record_agent_run(
                run_id=entry_id,
                channel="webchat",
                message=user_message,
                response_text=response_text,
                model=model_info.get("model", "unknown"),
                provider=model_info.get("provider", "unknown"),
                duration_ms=0,
                session_id=session_id,
            )
        except Exception as e:
            logger.error("Failed to record turn %s: %s", entry_id, e)

    def watch(self, poll_interval: float = 3.0):
        """Continuously watch for new session entries."""
        logger.info("Session watcher started (poll=%.1fs)", poll_interval)

        while self._running:
            try:
                count = self.scan_sessions()
                if count > 0:
                    logger.info("Recorded %d new run(s)", count)
            except Exception as e:
                logger.error("Scan error: %s", e)

            time.sleep(poll_interval)

    def stop(self):
        """Signal the watcher to stop."""
        self._running = False
        self._save_cursors()
