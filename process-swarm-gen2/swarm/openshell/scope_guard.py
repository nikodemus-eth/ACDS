"""Stage 4 -- ScopeGuard: enforce filesystem and network scope boundaries.

Filesystem checks ensure that every path targets an allowed root and
does not match any denied pattern.  Write operations are additionally
gated by ``allowed_write_roots``.

Network checks require HTTPS, reject blocked hosts, and (when an
allowlist is configured) reject hosts that are not explicitly allowed.
"""

from __future__ import annotations

import fnmatch
from pathlib import Path
from urllib.parse import urlparse

from swarm.openshell.config import OpenShellConfig
from swarm.openshell.models import (
    CommandEnvelope,
    ScopeCheck,
    SideEffectLevel,
)


class ScopeGuard:
    """Enforces filesystem and network scope boundaries."""

    def __init__(self, config: OpenShellConfig) -> None:
        self.config = config

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def check(self, envelope: CommandEnvelope, workspace_root: Path) -> ScopeCheck:
        """Check whether command parameters stay within allowed scope.

        Parameters
        ----------
        envelope:
            The normalised command envelope.  Filesystem paths are read
            from ``envelope.parameters.get("path")``.  URLs are read
            from ``envelope.parameters.get("url")``.
        workspace_root:
            Absolute path to the current run workspace.  Relative paths
            in the envelope are resolved against this root.

        Returns
        -------
        ScopeCheck
            ``in_scope`` is ``True`` only when **all** checks pass.
        """
        violations: list[str] = []
        checked_paths: list[str] = []
        checked_hosts: list[str] = []

        # -- Filesystem scope --
        raw_path = envelope.parameters.get("path")
        if raw_path is not None:
            self._check_filesystem(
                raw_path=raw_path,
                workspace_root=workspace_root,
                envelope=envelope,
                checked_paths=checked_paths,
                violations=violations,
            )

        # -- Network scope --
        raw_url = envelope.parameters.get("url")
        if raw_url is not None:
            self._check_network(
                raw_url=raw_url,
                checked_hosts=checked_hosts,
                violations=violations,
            )

        return ScopeCheck(
            in_scope=len(violations) == 0,
            checked_paths=checked_paths,
            checked_hosts=checked_hosts,
            violations=violations,
        )

    # ------------------------------------------------------------------
    # Filesystem helpers
    # ------------------------------------------------------------------

    def _check_filesystem(
        self,
        raw_path: str,
        workspace_root: Path,
        envelope: CommandEnvelope,
        checked_paths: list[str],
        violations: list[str],
    ) -> None:
        """Validate a single filesystem path."""
        resolved = (workspace_root / raw_path).resolve()
        checked_paths.append(str(resolved))

        # 1. Must be within at least one allowed read root.
        allowed_roots = [
            Path(r).resolve() for r in self.config.allowed_read_roots
        ]
        if not any(self._is_relative_to(resolved, root) for root in allowed_roots):
            violations.append(
                f"Path '{resolved}' is not under any allowed read root."
            )

        # 2. Reject if path matches a denied pattern.
        for pattern in self.config.denied_fs_patterns:
            if fnmatch.fnmatch(str(resolved), pattern) or fnmatch.fnmatch(
                resolved.name, pattern,
            ):
                violations.append(
                    f"Path '{resolved}' matches denied pattern '{pattern}'."
                )

        # 3. Write commands must be within allowed_write_roots.
        if envelope.side_effect_level is SideEffectLevel.LOCAL_MUTATION:
            write_roots = [
                Path(r).resolve() for r in self.config.allowed_write_roots
            ]
            if not write_roots:
                violations.append(
                    f"Write operation requested but no allowed_write_roots "
                    f"are configured."
                )
            elif not any(
                self._is_relative_to(resolved, root) for root in write_roots
            ):
                violations.append(
                    f"Path '{resolved}' is not under any allowed write root."
                )

    # ------------------------------------------------------------------
    # Network helpers
    # ------------------------------------------------------------------

    def _check_network(
        self,
        raw_url: str,
        checked_hosts: list[str],
        violations: list[str],
    ) -> None:
        """Validate a single URL."""
        parsed = urlparse(raw_url)
        hostname = parsed.hostname or ""
        checked_hosts.append(hostname)

        # 1. Require HTTPS.
        if parsed.scheme and parsed.scheme != "https":
            violations.append(
                f"URL scheme '{parsed.scheme}' is not allowed; only HTTPS "
                f"is permitted."
            )

        # 2. Reject blocked hosts.
        if hostname in self.config.blocked_hosts:
            violations.append(
                f"Host '{hostname}' is in the blocked hosts list."
            )

        # 3. If an allowlist is configured, host must be listed.
        if self.config.allowed_hosts and hostname not in self.config.allowed_hosts:
            violations.append(
                f"Host '{hostname}' is not in the allowed hosts list."
            )

    # ------------------------------------------------------------------
    # Compatibility shim
    # ------------------------------------------------------------------

    @staticmethod
    def _is_relative_to(path: Path, root: Path) -> bool:
        """Return True if *path* is equal to or a child of *root*.

        Uses ``Path.is_relative_to`` when available (Python 3.9+) and
        falls back to string-prefix comparison on older runtimes.
        """
        return path.is_relative_to(root)
