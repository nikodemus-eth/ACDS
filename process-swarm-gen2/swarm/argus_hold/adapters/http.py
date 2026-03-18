import urllib.request
import urllib.error
from urllib.parse import urlparse
from swarm.argus_hold.models import CommandEnvelope
from swarm.argus_hold.errors import ExecutionError

class HttpAdapter:
    """Fetches content from whitelisted HTTP endpoints."""

    def execute_command(self, envelope, workspace_root, prior_results) -> dict:
        params = envelope.parameters
        url = params["url"]
        method = params.get("method", "GET")
        timeout_ms = params.get("timeout_ms", 30000)
        max_bytes = params.get("max_bytes", 5 * 1024 * 1024)

        req = urllib.request.Request(url, method=method, headers={"User-Agent": "ARGUS-Hold/1.0"})
        try:
            with urllib.request.urlopen(req, timeout=timeout_ms / 1000) as resp:
                body = resp.read(max_bytes + 1)  # Read one extra to detect truncation
                truncated = len(body) > max_bytes
                if truncated:
                    body = body[:max_bytes]
                return {
                    "status_code": resp.status,
                    "headers": dict(resp.headers),
                    "body": body.decode("utf-8", errors="replace"),
                    "bytes_read": len(body),
                    "truncated": truncated,
                }
        except urllib.error.URLError as exc:
            raise ExecutionError(f"HTTP fetch failed: {exc}") from exc
