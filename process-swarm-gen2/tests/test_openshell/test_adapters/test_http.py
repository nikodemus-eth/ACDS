"""Tests for swarm.openshell.adapters.http — HttpAdapter.

Uses a real HTTP server (http.server.HTTPServer) on a random port instead of
mocks, stubs, or monkeypatches.
"""

from __future__ import annotations

import threading
from http.server import HTTPServer, BaseHTTPRequestHandler
from pathlib import Path

import pytest

from swarm.openshell.adapters.http import HttpAdapter
from swarm.openshell.errors import ExecutionError
from swarm.openshell.models import (
    CommandEnvelope,
    SideEffectLevel,
    new_id,
    now_utc,
)


# ---------------------------------------------------------------------------
# Test HTTP handler
# ---------------------------------------------------------------------------

class _Handler(BaseHTTPRequestHandler):
    """Minimal handler providing the endpoints needed by the test suite."""

    def do_GET(self):  # noqa: N802
        if self.path == "/data":
            self._respond(200, b"Hello", "text/plain")
        elif self.path == "/big":
            self._respond(200, b"A" * 200, "text/plain")
        elif self.path == "/echo-ua":
            ua = self.headers.get("User-Agent", "")
            self._respond(200, ua.encode(), "text/plain")
        elif self.path == "/error":
            self._respond(500, b"Internal Server Error", "text/plain")
        else:
            self._respond(404, b"Not Found", "text/plain")

    def do_HEAD(self):  # noqa: N802
        self.send_response(200)
        self.send_header("Content-Type", "text/plain")
        self.end_headers()

    def _respond(self, code: int, body: bytes, content_type: str):
        self.send_response(code)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format, *args):  # noqa: A002
        """Suppress all request logging."""


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def http_server():
    """Start a real HTTPServer on a random port; tear down after the module."""
    server = HTTPServer(("127.0.0.1", 0), _Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    yield server
    server.shutdown()


@pytest.fixture()
def workspace(tmp_path):
    """Local workspace fixture (function-scoped, compatible with tmp_path)."""
    ws = tmp_path / "workspace" / "run-test"
    ws.mkdir(parents=True)
    return ws


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _base_url(server: HTTPServer) -> str:
    host, port = server.server_address
    return f"http://{host}:{port}"


def _make_envelope(params: dict) -> CommandEnvelope:
    return CommandEnvelope(
        envelope_id=new_id("env"),
        command_name="http.fetch_whitelisted",
        version="v1",
        parameters=params,
        side_effect_level=SideEffectLevel.EXTERNAL_ACTION,
        run_id="run-1",
        swarm_id="swarm-1",
        created_at=now_utc(),
    )


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

class TestHttpAdapterHappyPath:
    """Tests for successful HTTP fetches against the real server."""

    def test_simple_get(self, http_server, workspace):
        adapter = HttpAdapter()
        env = _make_envelope({"url": f"{_base_url(http_server)}/data"})
        result = adapter.execute_command(env, workspace, {})
        assert result["status_code"] == 200
        assert result["body"] == "Hello"
        assert result["bytes_read"] == 5
        assert result["truncated"] is False

    def test_truncation_detection(self, http_server, workspace):
        adapter = HttpAdapter()
        env = _make_envelope({
            "url": f"{_base_url(http_server)}/big",
            "max_bytes": 100,
        })
        result = adapter.execute_command(env, workspace, {})
        assert result["truncated"] is True
        assert result["bytes_read"] == 100

    def test_custom_method(self, http_server, workspace):
        adapter = HttpAdapter()
        env = _make_envelope({
            "url": f"{_base_url(http_server)}/",
            "method": "HEAD",
        })
        result = adapter.execute_command(env, workspace, {})
        assert result["status_code"] == 200

    def test_user_agent_set(self, http_server, workspace):
        adapter = HttpAdapter()
        env = _make_envelope({"url": f"{_base_url(http_server)}/echo-ua"})
        result = adapter.execute_command(env, workspace, {})
        assert result["body"] == "OpenShell/1.0"


class TestHttpAdapterErrors:
    """Tests for HTTP error handling."""

    def test_url_error_raises_execution_error(self, workspace):
        adapter = HttpAdapter()
        env = _make_envelope({"url": "http://127.0.0.1:1"})
        with pytest.raises(ExecutionError, match="HTTP fetch failed"):
            adapter.execute_command(env, workspace, {})
