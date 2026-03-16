"""ProofUI HTTP server — read-only admin console and dashboard.

Provides a self-contained HTTP interface for observing the swarm platform.
All state is read from disk artifacts and the registry SQLite database.
"""
from __future__ import annotations

import json
import logging
import re
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlparse

from swarm.events.recorder import EventRecorder
from swarm.governance.lifecycle import LifecycleManager
from swarm.registry.database import RegistryDatabase
from swarm.registry.repository import SwarmRepository

logger = logging.getLogger(__name__)


# ──────────────────────────────────────────────────────────────
# ProofUIState — reads runtime artifacts from disk
# ──────────────────────────────────────────────────────────────


class ProofUIState:
    """Reads runtime artifacts from the openclaw root directory."""

    def __init__(self, openclaw_root: Path) -> None:
        self.artifacts_root = openclaw_root / "artifacts"
        self.ledger_path = openclaw_root / "ledger" / "execution_ledger.log"
        self.identity_path = openclaw_root / "node_identity.json"

    def _read_json_dir(self, subpath: str) -> list[dict]:
        """Read all JSON files from an artifact subdirectory."""
        directory = self.artifacts_root / subpath
        if not directory.is_dir():
            return []
        results: list[dict] = []
        for fp in sorted(directory.glob("*.json")):
            try:
                with open(fp) as f:
                    results.append(json.load(f))
            except (json.JSONDecodeError, OSError):
                logger.warning("Failed to read artifact: %s", fp)
        return results

    def get_executions(self) -> list[dict]:
        """Read artifacts/executions/*.json."""
        return self._read_json_dir("executions")

    def get_plans(self) -> list[dict]:
        """Read artifacts/plans/*.json."""
        return self._read_json_dir("plans")

    def get_validations(self) -> list[dict]:
        """Read artifacts/validation/*.json."""
        return self._read_json_dir("validation")

    def get_leases(self) -> list[dict]:
        """Read artifacts/leases/active/*.json."""
        return self._read_json_dir("leases/active")

    def get_proposals(self) -> list[dict]:
        """Read artifacts/proposals/*.json."""
        return self._read_json_dir("proposals")

    def get_ledger_entries(self) -> list[dict]:
        """Parse the execution ledger log file."""
        if not self.ledger_path.is_file():
            return []
        entries: list[dict] = []
        try:
            with open(self.ledger_path) as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        entries.append(json.loads(line))
                    except json.JSONDecodeError:
                        entries.append({"raw": line})
        except OSError:
            logger.warning("Failed to read ledger: %s", self.ledger_path)
        return entries

    def get_identity(self) -> dict:
        """Read node_identity.json."""
        if not self.identity_path.is_file():
            return {}
        try:
            with open(self.identity_path) as f:
                return json.load(f)
        except (json.JSONDecodeError, OSError):
            return {}

    def get_dashboard(self) -> dict:
        """Enriched payload with linked artifacts for the dashboard view."""
        executions = self.get_executions()
        plans = self.get_plans()
        validations = self.get_validations()
        leases = self.get_leases()
        proposals = self.get_proposals()
        identity = self.get_identity()

        total_executions = len(executions)
        passed = sum(
            1 for e in executions
            if e.get("status") in ("passed", "success", "completed")
        )
        pass_rate = (passed / total_executions * 100) if total_executions else 0.0

        return {
            "total_executions": total_executions,
            "passed_executions": passed,
            "pass_rate": round(pass_rate, 1),
            "total_plans": len(plans),
            "total_validations": len(validations),
            "active_leases": len(leases),
            "total_proposals": len(proposals),
            "node_id": identity.get("node_id", "unknown"),
            "recent_executions": executions[-10:],
            "recent_plans": plans[-5:],
        }


# ──────────────────────────────────────────────────────────────
# SwarmPlatform — backend for swarm management
# ──────────────────────────────────────────────────────────────


class SwarmPlatform:
    """Backend for swarm management via the registry database."""

    def __init__(self, openclaw_root: Path) -> None:
        import sqlite3 as _sqlite3

        db_path = str(openclaw_root / "platform.db")
        self.db = RegistryDatabase(db_path)
        # Connect with check_same_thread=False for HTTP server threading
        self.db.conn = _sqlite3.connect(db_path, check_same_thread=False)
        self.db.conn.row_factory = _sqlite3.Row
        self.db.conn.execute("PRAGMA journal_mode=WAL")
        self.db.conn.execute("PRAGMA foreign_keys=ON")
        self.db.migrate()
        self.repo = SwarmRepository(self.db)
        self.events = EventRecorder(self.repo)
        self.lifecycle = LifecycleManager(self.repo, self.events)


# ──────────────────────────────────────────────────────────────
# Console HTML — self-contained admin dashboard
# ──────────────────────────────────────────────────────────────

CONSOLE_HTML = r"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>ProofUI - Process Swarm Console</title>
<style>
:root {
    --bg: #0a0e17;
    --surface: #141926;
    --border: #1e2a3a;
    --text: #e0e6f0;
    --text-dim: #6b7a8d;
    --accent: #00bcd4;
    --green: #4caf50;
    --red: #f44336;
    --amber: #ff9800;
}
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
    font-family: 'Menlo', 'Consolas', 'Courier New', monospace;
    background: var(--bg);
    color: var(--text);
    min-height: 100vh;
}
a { color: var(--accent); text-decoration: none; }
a:hover { text-decoration: underline; }

/* Layout */
.app { display: flex; min-height: 100vh; }
.sidebar {
    width: 220px;
    background: var(--surface);
    border-right: 1px solid var(--border);
    padding: 20px 0;
    flex-shrink: 0;
}
.sidebar h1 {
    font-size: 14px;
    color: var(--accent);
    padding: 0 20px 20px;
    border-bottom: 1px solid var(--border);
    margin-bottom: 10px;
}
.nav-item {
    display: block;
    padding: 10px 20px;
    color: var(--text-dim);
    cursor: pointer;
    font-size: 13px;
    border-left: 3px solid transparent;
}
.nav-item:hover { color: var(--text); background: rgba(0,188,212,0.05); }
.nav-item.active {
    color: var(--accent);
    border-left-color: var(--accent);
    background: rgba(0,188,212,0.08);
}
.main { flex: 1; padding: 24px; overflow-y: auto; }
.page-title { font-size: 18px; margin-bottom: 20px; color: var(--accent); }

/* Cards */
.stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px; margin-bottom: 24px; }
.stat-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 16px;
}
.stat-card .label { font-size: 11px; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.5px; }
.stat-card .value { font-size: 28px; color: var(--accent); margin-top: 6px; }

/* Table */
table { width: 100%; border-collapse: collapse; background: var(--surface); border-radius: 6px; overflow: hidden; }
th { text-align: left; padding: 10px 14px; font-size: 11px; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid var(--border); }
td { padding: 10px 14px; font-size: 13px; border-bottom: 1px solid var(--border); }
tr:last-child td { border-bottom: none; }
tr:hover td { background: rgba(0,188,212,0.03); }

/* Badges */
.badge {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 10px;
    font-size: 11px;
    font-weight: bold;
    text-transform: uppercase;
}
.badge-green { background: rgba(76,175,80,0.15); color: var(--green); }
.badge-red { background: rgba(244,67,54,0.15); color: var(--red); }
.badge-amber { background: rgba(255,152,0,0.15); color: var(--amber); }
.badge-blue { background: rgba(0,188,212,0.15); color: var(--accent); }
.badge-dim { background: rgba(107,122,141,0.15); color: var(--text-dim); }

/* Detail panel */
.detail-panel {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 20px;
    margin-bottom: 16px;
}
.detail-row { display: flex; padding: 6px 0; }
.detail-label { width: 180px; color: var(--text-dim); font-size: 12px; flex-shrink: 0; }
.detail-value { font-size: 13px; }

/* Filters */
.filters { display: flex; gap: 12px; margin-bottom: 16px; align-items: center; }
.filters select, .filters input {
    background: var(--surface);
    border: 1px solid var(--border);
    color: var(--text);
    padding: 6px 10px;
    border-radius: 4px;
    font-family: inherit;
    font-size: 12px;
}
.btn {
    background: var(--accent);
    color: var(--bg);
    border: none;
    padding: 8px 16px;
    border-radius: 4px;
    cursor: pointer;
    font-family: inherit;
    font-size: 12px;
    font-weight: bold;
}
.btn:hover { opacity: 0.9; }

.empty-state { color: var(--text-dim); text-align: center; padding: 40px; font-size: 13px; }
</style>
</head>
<body>
<div class="app">
    <nav class="sidebar">
        <h1>ProofUI</h1>
        <a class="nav-item" href="#dashboard">Dashboard</a>
        <a class="nav-item" href="#swarms">Swarms</a>
        <a class="nav-item" href="#runs">Runs</a>
        <a class="nav-item" href="#events">Events</a>
        <a class="nav-item" href="#tools">Tools</a>
        <a class="nav-item" href="#settings">Settings</a>
    </nav>
    <main class="main" id="content"></main>
</div>
<script>
// -- Helpers --
async function apiGet(path) {
    const resp = await fetch('/api/' + path);
    if (!resp.ok) throw new Error('API error: ' + resp.status);
    return resp.json();
}

async function apiPost(path, body) {
    const resp = await fetch('/api/' + path, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(body),
    });
    if (!resp.ok) throw new Error('API error: ' + resp.status);
    return resp.json();
}

function h(tag, attrs, children) {
    const el = document.createElement(tag);
    if (attrs) Object.entries(attrs).forEach(function(pair) {
        var k = pair[0], v = pair[1];
        if (k === 'className') el.className = v;
        else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
        else el.setAttribute(k, v);
    });
    if (children != null) {
        if (typeof children === 'string') el.textContent = children;
        else if (Array.isArray(children)) children.forEach(function(c) { if (c) el.appendChild(c); });
        else el.appendChild(children);
    }
    return el;
}

function statusBadge(status) {
    if (!status) return h('span', {className: 'badge badge-dim'}, 'unknown');
    var s = String(status).toLowerCase();
    var cls = 'badge-dim';
    if (['passed','success','completed','enabled','active','approved'].indexOf(s) >= 0) cls = 'badge-green';
    else if (['failed','error','revoked','rejected','disabled'].indexOf(s) >= 0) cls = 'badge-red';
    else if (['running','queued','pending','drafting','reviewing','paused'].indexOf(s) >= 0) cls = 'badge-amber';
    else if (['experimental','planned'].indexOf(s) >= 0) cls = 'badge-blue';
    return h('span', {className: 'badge ' + cls}, status);
}

function formatTime(iso) {
    if (!iso) return '-';
    try { return new Date(iso).toLocaleString(); } catch(e) { return iso; }
}

function truncId(id) {
    if (!id) return '-';
    return id.length > 16 ? id.slice(0, 14) + '..' : id;
}

function clearContent() {
    var content = document.getElementById('content');
    while (content.firstChild) content.removeChild(content.firstChild);
    return content;
}

// -- Pages --
async function renderDashboard(container) {
    container.appendChild(h('div', {className: 'page-title'}, 'Dashboard'));
    try {
        var d = await apiGet('dashboard');
        var grid = h('div', {className: 'stat-grid'}, [
            statCard('Executions', d.total_executions),
            statCard('Pass Rate', d.pass_rate + '%'),
            statCard('Active Leases', d.active_leases),
            statCard('Plans', d.total_plans),
            statCard('Proposals', d.total_proposals),
            statCard('Validations', d.total_validations),
        ]);
        container.appendChild(grid);

        try {
            var swarms = await apiGet('swarms');
            var runs = await apiGet('runs?limit=10');
            var sg = h('div', {className: 'stat-grid'}, [
                statCard('Swarms', swarms.length),
                statCard('Recent Runs', runs.length),
            ]);
            container.appendChild(sg);
            if (runs.length) {
                container.appendChild(h('div', {className: 'page-title', style: 'margin-top:16px'}, 'Recent Runs'));
                container.appendChild(runsTable(runs));
            }
        } catch(e2) {}

        if (d.recent_executions && d.recent_executions.length) {
            container.appendChild(h('div', {className: 'page-title', style: 'margin-top:16px'}, 'Recent Executions'));
            var tbl = h('table', null, [
                h('thead', null, h('tr', null, [
                    h('th', null, 'ID'), h('th', null, 'Status'), h('th', null, 'Time'),
                ])),
                h('tbody', null, d.recent_executions.map(function(e) {
                    return h('tr', null, [
                        h('td', null, truncId(e.execution_id || e.id || '')),
                        h('td', null, statusBadge(e.status)),
                        h('td', null, formatTime(e.created_at || e.timestamp)),
                    ]);
                })),
            ]);
            container.appendChild(tbl);
        }
    } catch(e) {
        container.appendChild(h('div', {className: 'empty-state'}, 'Could not load dashboard: ' + e.message));
    }
}

function statCard(label, value) {
    return h('div', {className: 'stat-card'}, [
        h('div', {className: 'label'}, label),
        h('div', {className: 'value'}, String(value)),
    ]);
}

function runsTable(runs) {
    return h('table', null, [
        h('thead', null, h('tr', null, [
            h('th', null, 'Run ID'), h('th', null, 'Swarm'), h('th', null, 'Status'), h('th', null, 'Triggered'),
        ])),
        h('tbody', null, runs.map(function(r) {
            return h('tr', null, [
                h('td', null, truncId(r.run_id)),
                h('td', null, truncId(r.swarm_id)),
                h('td', null, statusBadge(r.run_status)),
                h('td', null, formatTime(r.triggered_at)),
            ]);
        })),
    ]);
}

async function renderSwarms(container) {
    container.appendChild(h('div', {className: 'page-title'}, 'Swarms'));
    try {
        var swarms = await apiGet('swarms');
        if (!swarms.length) { container.appendChild(h('div', {className: 'empty-state'}, 'No swarms defined')); return; }
        var tbl = h('table', null, [
            h('thead', null, h('tr', null, [
                h('th', null, 'Name'), h('th', null, 'ID'), h('th', null, 'Status'), h('th', null, 'Created'),
            ])),
            h('tbody', null, swarms.map(function(s) {
                return h('tr', {style: 'cursor:pointer', onClick: function() { location.hash = '#swarm/' + s.swarm_id; }}, [
                    h('td', null, s.swarm_name),
                    h('td', null, truncId(s.swarm_id)),
                    h('td', null, statusBadge(s.lifecycle_status)),
                    h('td', null, formatTime(s.created_at)),
                ]);
            })),
        ]);
        container.appendChild(tbl);
    } catch(e) {
        container.appendChild(h('div', {className: 'empty-state'}, 'Error: ' + e.message));
    }
}

async function renderSwarmDetail(container, swarmId) {
    container.appendChild(h('div', {className: 'page-title'}, 'Swarm Detail'));
    try {
        var data = await apiGet('swarm/' + swarmId);
        if (!data.swarm) { container.appendChild(h('div', {className: 'empty-state'}, 'Swarm not found')); return; }
        var s = data.swarm;
        var panel = h('div', {className: 'detail-panel'}, [
            detailRow('Name', s.swarm_name),
            detailRow('ID', s.swarm_id),
            detailRow('Status', null, statusBadge(s.lifecycle_status)),
            detailRow('Description', s.description || '-'),
            detailRow('Created', formatTime(s.created_at)),
            detailRow('Created By', s.created_by),
        ]);
        container.appendChild(panel);

        if (data.warnings && data.warnings.length) {
            container.appendChild(h('div', {className: 'page-title'}, 'Warnings'));
            data.warnings.forEach(function(w) {
                container.appendChild(h('div', {className: 'detail-panel'}, [
                    detailRow('Severity', w.severity),
                    detailRow('Message', w.message),
                    detailRow('Created', formatTime(w.created_at)),
                ]));
            });
        }

        if (data.events && data.events.length) {
            container.appendChild(h('div', {className: 'page-title'}, 'Events'));
            var tbl = h('table', null, [
                h('thead', null, h('tr', null, [h('th', null, 'Type'), h('th', null, 'Summary'), h('th', null, 'Time')])),
                h('tbody', null, data.events.map(function(ev) {
                    return h('tr', null, [
                        h('td', null, ev.event_type),
                        h('td', null, ev.summary || '-'),
                        h('td', null, formatTime(ev.event_time)),
                    ]);
                })),
            ]);
            container.appendChild(tbl);
        }
    } catch(e) {
        container.appendChild(h('div', {className: 'empty-state'}, 'Error: ' + e.message));
    }
}

function detailRow(label, value, el) {
    return h('div', {className: 'detail-row'}, [
        h('div', {className: 'detail-label'}, label),
        el ? h('div', {className: 'detail-value'}, el) : h('div', {className: 'detail-value'}, value || '-'),
    ]);
}

async function renderRuns(container) {
    container.appendChild(h('div', {className: 'page-title'}, 'Runs'));
    try {
        var runs = await apiGet('runs?limit=50');
        if (!runs.length) { container.appendChild(h('div', {className: 'empty-state'}, 'No runs found')); return; }
        container.appendChild(runsTable(runs));
    } catch(e) {
        container.appendChild(h('div', {className: 'empty-state'}, 'Error: ' + e.message));
    }
}

async function renderEvents(container) {
    container.appendChild(h('div', {className: 'page-title'}, 'Events'));
    try {
        var events = await apiGet('events?limit=100');
        if (!events.length) { container.appendChild(h('div', {className: 'empty-state'}, 'No events recorded')); return; }
        var tbl = h('table', null, [
            h('thead', null, h('tr', null, [
                h('th', null, 'Event'), h('th', null, 'Swarm'), h('th', null, 'Summary'), h('th', null, 'Time'),
            ])),
            h('tbody', null, events.map(function(ev) {
                return h('tr', null, [
                    h('td', null, ev.event_type),
                    h('td', null, truncId(ev.swarm_id)),
                    h('td', null, ev.summary || '-'),
                    h('td', null, formatTime(ev.event_time)),
                ]);
            })),
        ]);
        container.appendChild(tbl);
    } catch(e) {
        container.appendChild(h('div', {className: 'empty-state'}, 'Error: ' + e.message));
    }
}

async function renderTools(container) {
    container.appendChild(h('div', {className: 'page-title'}, 'Tools'));
    try {
        var tools = await apiGet('tools');
        if (!tools.length) { container.appendChild(h('div', {className: 'empty-state'}, 'No tools registered')); return; }
        var tbl = h('table', null, [
            h('thead', null, h('tr', null, [
                h('th', null, 'Name'), h('th', null, 'Family'), h('th', null, 'Status'), h('th', null, 'Dry Run'),
            ])),
            h('tbody', null, tools.map(function(t) {
                return h('tr', null, [
                    h('td', null, t.tool_name),
                    h('td', null, t.tool_family || '-'),
                    h('td', null, statusBadge(t.maturity_status)),
                    h('td', null, t.supports_dry_run ? 'Yes' : 'No'),
                ]);
            })),
        ]);
        container.appendChild(tbl);
    } catch(e) {
        container.appendChild(h('div', {className: 'empty-state'}, 'Error: ' + e.message));
    }
}

async function renderSettings(container) {
    container.appendChild(h('div', {className: 'page-title'}, 'Settings'));
    try {
        var id = await apiGet('settings/identity');
        var panel = h('div', {className: 'detail-panel'}, [
            detailRow('Node ID', id.node_id),
            detailRow('Role', id.node_role),
            detailRow('Environment', id.environment_class),
            detailRow('Status', id.status),
            detailRow('Created', formatTime(id.created_at)),
        ]);
        container.appendChild(panel);
    } catch(e) {
        container.appendChild(h('div', {className: 'empty-state'}, 'Error: ' + e.message));
    }
}

// -- Router --
function route() {
    var hash = location.hash.slice(1) || 'dashboard';
    var content = clearContent();

    document.querySelectorAll('.nav-item').forEach(function(el) {
        var target = el.getAttribute('href');
        if (target === '#' + hash || (hash.indexOf('swarm/') === 0 && target === '#swarms')) {
            el.classList.add('active');
        } else {
            el.classList.remove('active');
        }
    });

    if (hash === 'dashboard') renderDashboard(content);
    else if (hash === 'swarms') renderSwarms(content);
    else if (hash.indexOf('swarm/') === 0) renderSwarmDetail(content, hash.slice(6));
    else if (hash === 'runs') renderRuns(content);
    else if (hash === 'events') renderEvents(content);
    else if (hash === 'tools') renderTools(content);
    else if (hash === 'settings') renderSettings(content);
    else renderDashboard(content);
}

window.addEventListener('hashchange', route);
window.addEventListener('DOMContentLoaded', route);
</script>
</body>
</html>"""


# ──────────────────────────────────────────────────────────────
# ProofUIHandler — HTTP request handler
# ──────────────────────────────────────────────────────────────

# Path patterns for dynamic routes
_SWARM_DETAIL_RE = re.compile(r"^/api/swarm/([^/]+)$")
_SWARM_RUNS_RE = re.compile(r"^/api/swarm/([^/]+)/runs$")
_SWARM_EVENTS_RE = re.compile(r"^/api/swarm/([^/]+)/events$")
_RUN_DETAIL_RE = re.compile(r"^/api/run/([^/]+)$")


def _make_handler(
    state: ProofUIState, swarm_platform: SwarmPlatform,
) -> type[BaseHTTPRequestHandler]:
    """Create a handler class with bound state and platform references."""

    class ProofUIHandler(BaseHTTPRequestHandler):
        """HTTP request handler for the ProofUI console."""

        def log_message(self, fmt: str, *args: Any) -> None:
            logger.info(fmt, *args)

        # ── Response helpers ──

        def _json_response(self, data: Any, status: int = 200) -> None:
            body = json.dumps(data, default=str).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
            self.end_headers()
            self.wfile.write(body)

        def _error_response(self, status: int, message: str) -> None:
            self._json_response({"error": message}, status=status)

        def _read_body(self) -> dict:
            length = int(self.headers.get("Content-Length", 0))
            if length == 0:
                return {}
            raw = self.rfile.read(length)
            return json.loads(raw)

        def _serve_scoped_file(self, path: str, root: Path) -> None:
            """Serve a file with path traversal protection."""
            resolved = (root / path).resolve()
            if not str(resolved).startswith(str(root.resolve())):
                self._error_response(403, "Path traversal blocked")
                return
            if not resolved.is_file():
                self._error_response(404, "Not found")
                return
            try:
                content = resolved.read_bytes()
                self.send_response(200)
                if resolved.suffix == ".html":
                    self.send_header("Content-Type", "text/html; charset=utf-8")
                elif resolved.suffix == ".json":
                    self.send_header("Content-Type", "application/json")
                else:
                    self.send_header("Content-Type", "application/octet-stream")
                self.send_header("Content-Length", str(len(content)))
                self.end_headers()
                self.wfile.write(content)
            except OSError:
                self._error_response(500, "Read error")

        # ── Query param helpers ──

        def _query_params(self) -> dict[str, str]:
            parsed = urlparse(self.path)
            params = parse_qs(parsed.query)
            return {k: v[0] for k, v in params.items()}

        def _clean_path(self) -> str:
            return urlparse(self.path).path

        # ── OPTIONS (CORS preflight) ──

        def do_OPTIONS(self) -> None:
            self.send_response(204)
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
            self.end_headers()

        # ── GET routes ──

        def do_GET(self) -> None:
            path = self._clean_path()
            params = self._query_params()

            # Static routes
            if path == "/":
                self.send_response(302)
                self.send_header("Location", "/console")
                self.end_headers()
                return

            if path == "/console":
                body = CONSOLE_HTML.encode("utf-8")
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                return

            # Artifact API endpoints
            if path == "/api/dashboard":
                self._json_response(state.get_dashboard())
                return
            if path == "/api/executions":
                self._json_response(state.get_executions())
                return
            if path == "/api/plans":
                self._json_response(state.get_plans())
                return
            if path == "/api/validations":
                self._json_response(state.get_validations())
                return
            if path == "/api/leases":
                self._json_response(state.get_leases())
                return
            if path == "/api/ledger":
                self._json_response(state.get_ledger_entries())
                return
            if path == "/api/identity":
                self._json_response(state.get_identity())
                return

            # Swarm platform API endpoints
            if path == "/api/swarms":
                status_filter = params.get("status")
                self._json_response(
                    swarm_platform.repo.list_swarms(status=status_filter)
                )
                return

            # Dynamic swarm routes
            m = _SWARM_DETAIL_RE.match(path)
            if m:
                swarm_id = m.group(1)
                swarm = swarm_platform.repo.get_swarm(swarm_id)
                if not swarm:
                    self._error_response(404, "Swarm not found")
                    return
                warnings = swarm_platform.repo.list_governance_warning_records(
                    swarm_id=swarm_id,
                )
                events = swarm_platform.repo.list_events(swarm_id)
                self._json_response({
                    "swarm": swarm,
                    "warnings": warnings,
                    "events": events,
                })
                return

            m = _SWARM_RUNS_RE.match(path)
            if m:
                self._json_response(
                    swarm_platform.repo.list_runs(m.group(1))
                )
                return

            m = _SWARM_EVENTS_RE.match(path)
            if m:
                self._json_response(
                    swarm_platform.repo.list_events(m.group(1))
                )
                return

            if path == "/api/runs":
                status_filter = params.get("status")
                limit = int(params.get("limit", "100"))
                self._json_response(
                    swarm_platform.repo.list_all_runs(status=status_filter, limit=limit)
                )
                return

            m = _RUN_DETAIL_RE.match(path)
            if m:
                run = swarm_platform.repo.get_run(m.group(1))
                if not run:
                    self._error_response(404, "Run not found")
                    return
                self._json_response(run)
                return

            if path == "/api/tools":
                status_filter = params.get("status")
                self._json_response(
                    swarm_platform.repo.list_tools(status=status_filter)
                )
                return

            if path == "/api/events":
                event_type = params.get("event_type")
                limit = int(params.get("limit", "200"))
                self._json_response(
                    swarm_platform.repo.list_all_events(
                        event_type=event_type, limit=limit,
                    )
                )
                return

            if path == "/api/schedules":
                self._json_response(swarm_platform.repo.list_schedules())
                return

            if path == "/api/settings/identity":
                self._json_response(state.get_identity())
                return

            self._error_response(404, "Not found")

        # ── POST routes ──

        def do_POST(self) -> None:
            path = self._clean_path()

            try:
                body = self._read_body()
            except (json.JSONDecodeError, ValueError):
                self._error_response(400, "Invalid JSON body")
                return

            if path == "/api/swarm/create":
                name = body.get("name", "").strip()
                description = body.get("description", "")
                created_by = body.get("created_by", "proof_ui")
                steps = body.get("steps", [])
                if not name:
                    self._error_response(400, "name is required")
                    return
                from swarm.abi.api import SwarmSkillABI
                abi = SwarmSkillABI(
                    swarm_platform.repo,
                    swarm_platform.events,
                    state.artifacts_root.parent,
                )
                result = abi.create_swarm_definition(
                    name=name,
                    description=description,
                    step_outline=steps,
                    created_by=created_by,
                )
                self._json_response(result, status=201)
                return

            if path == "/api/swarm/transition":
                swarm_id = body.get("swarm_id", "")
                to_state = body.get("to_state", "")
                actor_id = body.get("actor_id", "proof_ui")
                actor_role = body.get("actor_role", "publisher")
                reason = body.get("reason")
                if not swarm_id or not to_state:
                    self._error_response(400, "swarm_id and to_state required")
                    return
                try:
                    event_id = swarm_platform.lifecycle.transition(
                        swarm_id, to_state,
                        actor_id=actor_id,
                        actor_role=actor_role,
                        reason=reason,
                    )
                    self._json_response({"event_id": event_id})
                except ValueError as exc:
                    self._error_response(400, str(exc))
                return

            if path == "/api/swarm/run":
                swarm_id = body.get("swarm_id", "")
                trigger_source = body.get("trigger_source", "manual_proof_ui")
                created_by = body.get("created_by", "proof_ui")
                if not swarm_id:
                    self._error_response(400, "swarm_id required")
                    return
                run_id = swarm_platform.repo.create_run(
                    swarm_id, trigger_source, created_by_trigger=created_by,
                )
                self._json_response({"run_id": run_id}, status=201)
                return

            if path == "/api/swarm/schedule":
                swarm_id = body.get("swarm_id", "")
                if not swarm_id:
                    self._error_response(400, "swarm_id required")
                    return
                from swarm.abi.api import SwarmSkillABI
                abi = SwarmSkillABI(
                    swarm_platform.repo,
                    swarm_platform.events,
                    state.artifacts_root.parent,
                )
                schedule_id = abi.configure_schedule(swarm_id, body)
                self._json_response({"schedule_id": schedule_id}, status=201)
                return

            if path == "/api/swarm/delivery":
                swarm_id = body.get("swarm_id", "")
                if not swarm_id:
                    self._error_response(400, "swarm_id required")
                    return
                from swarm.abi.api import SwarmSkillABI
                abi = SwarmSkillABI(
                    swarm_platform.repo,
                    swarm_platform.events,
                    state.artifacts_root.parent,
                )
                delivery_id = abi.configure_delivery(swarm_id, body)
                self._json_response({"delivery_id": delivery_id}, status=201)
                return

            self._error_response(404, "Not found")

    return ProofUIHandler


# ──────────────────────────────────────────────────────────────
# Server start
# ──────────────────────────────────────────────────────────────


def start_server(root: str, port: int = 18790) -> HTTPServer:
    """Start the ProofUI HTTP server.

    Returns the HTTPServer instance (after calling serve_forever in blocking mode).
    """
    openclaw_root = Path(root).resolve()
    ui_state = ProofUIState(openclaw_root)
    swarm_plat = SwarmPlatform(openclaw_root)
    handler_cls = _make_handler(ui_state, swarm_plat)

    server = HTTPServer(("0.0.0.0", port), handler_cls)
    logger.info("ProofUI listening on http://0.0.0.0:%d", port)
    print(f"ProofUI listening on http://0.0.0.0:{port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
        swarm_plat.db.close()
    return server
