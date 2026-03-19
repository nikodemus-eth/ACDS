"""ProofUI HTTP server — read-only admin console and dashboard.

Provides a self-contained HTTP interface for observing the swarm platform.
All state is read from disk artifacts and the registry SQLite database.
"""
from __future__ import annotations

import json
import logging
import re
from http.server import BaseHTTPRequestHandler, HTTPServer
from socketserver import ThreadingMixIn
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
        # Threading: HTTPServer dispatches to handler threads. SQLite requires
        # check_same_thread=False for multi-thread access. Safe with WAL mode
        # (enabled by RegistryDatabase.migrate) which allows concurrent reads.
        self.db.conn = _sqlite3.connect(db_path, check_same_thread=False)
        self.db.conn.row_factory = _sqlite3.Row
        self.db.conn.execute("PRAGMA journal_mode=WAL")
        self.db.conn.execute("PRAGMA foreign_keys=ON")
        self.db.migrate()
        self.repo = SwarmRepository(self.db)
        self.events = EventRecorder(self.repo)
        self.lifecycle = LifecycleManager(self.repo, self.events)
        self.openclaw_root = openclaw_root

    def execute_run(self, run_id: str) -> dict:
        """Execute a queued run through the adapter pipeline.

        Creates a SwarmRunner with its own DB connection (WAL mode allows
        concurrent readers) and delegates execution to it.
        """
        from swarm.runner import SwarmRunner
        runner = SwarmRunner(str(self.openclaw_root))
        try:
            return runner.execute_run(run_id)
        finally:
            runner.close()


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
    --border: #2a3a4a;
    --text: #e0e6f0;
    --text-dim: #8a9bb0;
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

/* Accessibility: Focus indicators (WCAG 2.4.7) */
:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
}
button:focus-visible, a:focus-visible, select:focus-visible, input:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
}
.nav-item:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
}
tr[tabindex]:focus-visible td { background: rgba(0,188,212,0.08); }
tr[tabindex]:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }

/* Accessibility: Skip link (WCAG 2.4.1) */
.skip-link {
    position: absolute;
    top: -50px;
    left: 16px;
    padding: 8px 16px;
    background: var(--accent);
    color: var(--bg);
    border-radius: 4px;
    font-weight: bold;
    font-size: 13px;
    z-index: 10000;
    transition: top 0.2s;
}
.skip-link:focus { top: 16px; }
</style>
</head>
<body>
<a href="#content" class="skip-link">Skip to main content</a>
<div class="app" role="application" aria-label="ProofUI Console">
    <nav class="sidebar" aria-label="Main navigation">
        <h1>ProofUI</h1>
        <a class="nav-item" href="#dashboard">Dashboard</a>
        <a class="nav-item" href="#swarms">Swarms</a>
        <a class="nav-item" href="#runs">Runs</a>
        <a class="nav-item" href="#events">Events</a>
        <a class="nav-item" href="#tools">Tools</a>
        <a class="nav-item" href="#settings">Settings</a>
        <div style="border-top:1px solid var(--border);margin-top:10px;padding-top:10px">
        <a class="nav-item" href="#acds-admin" style="color:var(--accent)">ACDS Admin</a>
        </div>
    </nav>
    <main class="main" id="content"></main>
    <div id="aria-live" role="status" aria-live="polite" aria-atomic="true" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)"></div>
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

// Accessibility: announce status changes to screen readers (aria-live region)
function announce(msg) {
    var el = document.getElementById('aria-live');
    if (el) el.textContent = msg;
}

// Accessible clickable row: tabindex + Enter/Space activation (WCAG 2.1.1)
function clickableRow(hash, children) {
    return h('tr', {
        tabindex: '0',
        role: 'link',
        'aria-label': 'Navigate to ' + hash,
        style: 'cursor:pointer',
        onClick: function() { location.hash = '#' + hash; },
        onKeyDown: function(e) {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); location.hash = '#' + hash; }
        },
    }, children);
}

function clearContent() {
    var content = document.getElementById('content');
    while (content.firstChild) content.removeChild(content.firstChild);
    return content;
}

// -- Engine Selector Popup (keyboard-accessible, WCAG 2.1 AA) --
function showEngineSelector(badge, actionId, field, currentEngine) {
    var old = document.getElementById('engine-selector');
    if (old) old.remove();

    var engines = [
        {value: '', label: '- None -', cls: 'badge-dim'},
        {value: 'ollama', label: 'Ollama', cls: 'badge-blue', models: ['qwen3:8b', 'llama3.3']},
        {value: 'apple_intelligence', label: 'Apple Intelligence', cls: 'badge-green', models: ['apple-fm-on-device']},
    ];

    var popup = h('div', {
        id: 'engine-selector',
        role: 'dialog',
        'aria-modal': 'true',
        'aria-label': 'Select inference engine',
        style: 'position:fixed;z-index:1000;background:var(--surface);border:1px solid var(--accent);border-radius:6px;padding:8px;min-width:200px;box-shadow:0 4px 16px rgba(0,0,0,0.4)',
    });

    var buttons = [];
    engines.forEach(function(eng) {
        var isActive = (eng.value === (currentEngine || ''));
        var item = h('button', {
            type: 'button',
            style: 'display:flex;align-items:center;gap:8px;width:100%;padding:8px 12px;cursor:pointer;border-radius:4px;border:none;background:' + (isActive ? 'rgba(0,188,212,0.15)' : 'transparent') + ';color:var(--text);font-family:inherit;font-size:12px;text-align:left',
            onClick: function() {
                var updates = {};
                updates[field] = eng.value;
                if (field === 'inference_engine' && eng.models) {
                    updates['inference_model'] = eng.models[0];
                } else if (field === 'inference_engine' && !eng.value) {
                    updates['inference_model'] = '';
                }
                updates['action_id'] = actionId;
                apiPost('action/update-inference', updates).then(function() {
                    popup.remove();
                    route();
                }).catch(function(err) {
                    alert('Failed: ' + err.message);
                });
            },
        }, [
            h('span', {className: 'badge ' + eng.cls, style: 'min-width:60px;text-align:center'}, eng.label),
            isActive ? h('span', {style: 'color:var(--accent);font-size:11px'}, '(current)') : null,
        ]);
        buttons.push(item);
        popup.appendChild(item);
    });

    // Cancel button
    var cancelBtn = h('button', {
        type: 'button',
        style: 'display:block;width:100%;padding:6px 12px;cursor:pointer;text-align:center;color:var(--text-dim);font-size:11px;margin-top:4px;border-top:1px solid var(--border);border:none;background:transparent;font-family:inherit',
        onClick: function() { popup.remove(); badge.focus(); },
    }, 'Cancel');
    buttons.push(cancelBtn);
    popup.appendChild(cancelBtn);

    // Position near the badge
    var rect = badge.getBoundingClientRect();
    popup.style.top = (rect.bottom + 4) + 'px';
    popup.style.left = rect.left + 'px';
    document.body.appendChild(popup);

    // Focus first button
    buttons[0].focus();

    // Keyboard: Escape closes, Arrow keys navigate
    popup.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') { popup.remove(); badge.focus(); e.preventDefault(); }
        var idx = buttons.indexOf(document.activeElement);
        if (e.key === 'ArrowDown' && idx < buttons.length - 1) { buttons[idx + 1].focus(); e.preventDefault(); }
        if (e.key === 'ArrowUp' && idx > 0) { buttons[idx - 1].focus(); e.preventDefault(); }
    });

    // Close on outside click
    setTimeout(function() {
        document.addEventListener('click', function closer(e) {
            if (!popup.contains(e.target) && e.target !== badge) {
                popup.remove();
                document.removeEventListener('click', closer);
            }
        });
    }, 50);
}

// -- Pages --
async function renderDashboard(container) {
    container.appendChild(h('h1', {className: 'page-title'}, 'Dashboard'));
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
            var [swarms, runs] = await Promise.all([apiGet('swarms'), apiGet('runs?limit=10')]);
            var sg = h('div', {className: 'stat-grid'}, [
                statCard('Swarms', swarms.length),
                statCard('Recent Runs', runs.length),
            ]);
            container.appendChild(sg);
            if (runs.length) {
                container.appendChild(h('h2', {className: 'page-title', style: 'margin-top:16px'}, 'Recent Runs'));
                container.appendChild(runsTable(runs));
            }
        } catch(e2) {}

        if (d.recent_executions && d.recent_executions.length) {
            container.appendChild(h('h2', {className: 'page-title', style: 'margin-top:16px'}, 'Recent Executions'));
            var tbl = h('table', null, [
                h('thead', null, h('tr', null, [
                    h('th', {scope: 'col'}, 'ID'), h('th', {scope: 'col'}, 'Status'), h('th', {scope: 'col'}, 'Time'),
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
            h('th', {scope: 'col'}, 'Run ID'), h('th', {scope: 'col'}, 'Swarm'), h('th', {scope: 'col'}, 'Status'), h('th', {scope: 'col'}, 'Triggered'),
        ])),
        h('tbody', null, runs.map(function(r) {
            var swarmLabel = r.swarm_name || truncId(r.swarm_id);
            return clickableRow('run/' + r.run_id, [
                h('td', null, truncId(r.run_id)),
                h('td', null, h('a', {href: '#swarm/' + r.swarm_id, style: 'color:var(--accent)', onClick: function(e) { e.stopPropagation(); }}, swarmLabel)),
                h('td', null, statusBadge(r.run_status)),
                h('td', null, formatTime(r.triggered_at)),
            ]);
        })),
    ]);
}

async function renderRunDetail(container, runId) {
    container.appendChild(h('h1', {className: 'page-title'}, 'Run Detail'));
    try {
        var data = await apiGet('run/' + runId);
        var run = data.run;

        // Header panel
        var panel = h('div', {className: 'detail-panel'}, [
            detailRow('Run ID', run.run_id),
            detailRow('Swarm', data.swarm_name || run.swarm_id),
            detailRow('Status', null, statusBadge(run.run_status)),
            detailRow('Trigger', run.trigger_source || '-'),
            detailRow('Created By', run.created_by_trigger || '-'),
            detailRow('Triggered', formatTime(run.triggered_at)),
            detailRow('Execution ID', run.runtime_execution_id || '-'),
            detailRow('Delivery', run.delivery_status || '-'),
        ]);
        if (run.error_summary) {
            panel.appendChild(detailRow('Error', run.error_summary));
        }
        container.appendChild(panel);

        // Stats
        var stats = h('div', {className: 'stat-grid'}, [
            statCard('Artifacts', String(data.artifact_files.length)),
            statCard('Steps', String(data.action_results.length)),
            statCard('Events', String(data.events.length)),
        ]);
        container.appendChild(stats);

        // Inference Trace
        if (data.inference_trace && data.inference_trace.length) {
            container.appendChild(h('h2', {className: 'page-title', style: 'margin-top:24px'}, 'Inference Trace'));
            var totalLatency = data.inference_trace.reduce(function(sum, t) { return sum + (t.latency_ms || 0); }, 0);
            var engines = {};
            data.inference_trace.forEach(function(t) {
                if (t.engine) engines[t.engine] = (engines[t.engine] || 0) + 1;
            });
            var engineSummary = Object.keys(engines).map(function(e) { return e + ': ' + engines[e]; }).join(', ');
            var traceStats = h('div', {className: 'stat-grid'}, [
                statCard('Total Latency', (totalLatency / 1000).toFixed(1) + 's'),
                statCard('Stages', String(data.inference_trace.length)),
                statCard('Engines', engineSummary || 'none'),
            ]);
            container.appendChild(traceStats);

            var traceTbl = h('table', null, [
                h('thead', null, h('tr', null, [
                    h('th', {scope: 'col'}, 'Stage'),
                    h('th', {scope: 'col'}, 'Tool'),
                    h('th', {scope: 'col'}, 'Engine'),
                    h('th', {scope: 'col'}, 'Model'),
                    h('th', {scope: 'col'}, 'Latency'),
                    h('th', {scope: 'col'}, 'Status'),
                ])),
                h('tbody', null, data.inference_trace.map(function(t) {
                    var engineBadge = '-';
                    if (t.engine === 'ollama') {
                        engineBadge = h('span', {className: 'badge badge-blue'}, 'Ollama');
                    } else if (t.engine === 'apple_intelligence') {
                        engineBadge = h('span', {className: 'badge badge-green'}, 'Apple AI');
                    } else if (t.engine) {
                        engineBadge = h('span', {className: 'badge'}, t.engine);
                    }
                    var latencyStr = t.latency_ms != null ? (t.latency_ms < 1000 ? t.latency_ms + 'ms' : (t.latency_ms / 1000).toFixed(1) + 's') : '-';
                    var fallbackNote = t.fallback_engine ? ' \u2192 ' + t.fallback_engine : '';
                    return h('tr', null, [
                        h('td', {style: 'font-weight:500'}, t.step || '-'),
                        h('td', null, t.tool || '-'),
                        h('td', null, typeof engineBadge === 'string' ? engineBadge : engineBadge),
                        h('td', {style: 'font-family:monospace;font-size:12px'}, (t.model || '-') + fallbackNote),
                        h('td', {style: 'font-family:monospace'}, latencyStr),
                        h('td', null, t.success ? statusBadge('succeeded') : statusBadge('failed')),
                    ]);
                })),
            ]);
            container.appendChild(traceTbl);
        }

        // Pipeline Steps (action results)
        if (data.action_results.length) {
            container.appendChild(h('h2', {className: 'page-title', style: 'margin-top:24px'}, 'Pipeline Steps'));
            var stepsTbl = h('table', null, [
                h('thead', null, h('tr', null, [
                    h('th', {scope: 'col'}, '#'), h('th', {scope: 'col'}, 'Action'), h('th', {scope: 'col'}, 'Tool'),
                    h('th', {scope: 'col'}, 'Status'), h('th', {scope: 'col'}, 'Started'), h('th', {scope: 'col'}, 'Completed'),
                    h('th', {scope: 'col'}, 'Artifact'),
                ])),
                h('tbody', null, data.action_results.map(function(ar) {
                    var artifactCell = '-';
                    if (ar.artifact_ref) {
                        artifactCell = h('a', {
                            href: '/api/artifact/' + runId + '/' + ar.artifact_ref,
                            target: '_blank',
                            style: 'color:var(--accent)',
                        }, ar.artifact_ref);
                    }
                    return h('tr', null, [
                        h('td', null, String(ar.step_order || '')),
                        h('td', null, ar.action_id || '-'),
                        h('td', null, ar.tool_id || '-'),
                        h('td', null, statusBadge(ar.execution_status)),
                        h('td', null, ar.started_at ? formatTime(ar.started_at) : '-'),
                        h('td', null, ar.completed_at ? formatTime(ar.completed_at) : '-'),
                        h('td', null, typeof artifactCell === 'string' ? artifactCell : artifactCell),
                    ]);
                })),
            ]);
            container.appendChild(stepsTbl);
        }

        // Artifacts
        if (data.artifact_files.length) {
            container.appendChild(h('h2', {className: 'page-title', style: 'margin-top:24px'}, 'Artifacts'));
            var artifactPanel = h('div', {className: 'detail-panel'});
            data.artifact_files.forEach(function(af) {
                var ext = af.path.split('.').pop().toLowerCase();
                var icon = ext === 'json' ? 'JSON' : ext === 'md' ? 'MD' : ext === 'txt' ? 'TXT' : 'FILE';
                var sizeStr = af.size < 1024 ? af.size + ' B' : (af.size / 1024).toFixed(1) + ' KB';

                var row = h('div', {style: 'display:flex;align-items:center;gap:12px;padding:8px 0;border-bottom:1px solid var(--border)'}, [
                    h('span', {className: 'badge badge-blue', style: 'min-width:40px;text-align:center'}, icon),
                    h('a', {
                        href: '/api/artifact/' + runId + '/' + af.path,
                        target: '_blank',
                        style: 'color:var(--accent);flex:1;font-size:13px',
                    }, af.path),
                    h('span', {style: 'color:var(--text-dim);font-size:12px'}, sizeStr),
                    h('button', {
                        className: 'btn',
                        style: 'padding:4px 10px;font-size:11px',
                        onClick: function() { viewArtifact(runId, af.path); },
                    }, 'View'),
                ]);
                artifactPanel.appendChild(row);
            });
            container.appendChild(artifactPanel);

            // Inline viewer
            container.appendChild(h('div', {id: 'artifact-viewer'}));
        }

        // Events
        if (data.events.length) {
            container.appendChild(h('h2', {className: 'page-title', style: 'margin-top:24px'}, 'Run Events'));
            var evtTbl = h('table', null, [
                h('thead', null, h('tr', null, [
                    h('th', {scope: 'col'}, 'Type'), h('th', {scope: 'col'}, 'Summary'), h('th', {scope: 'col'}, 'Time'),
                ])),
                h('tbody', null, data.events.map(function(ev) {
                    return h('tr', null, [
                        h('td', null, ev.event_type),
                        h('td', null, ev.summary || '-'),
                        h('td', null, formatTime(ev.event_time)),
                    ]);
                })),
            ]);
            container.appendChild(evtTbl);
        }

    } catch(e) {
        container.appendChild(h('div', {className: 'empty-state'}, 'Error: ' + e.message));
    }
}

async function viewArtifact(runId, filePath) {
    var viewer = document.getElementById('artifact-viewer');
    if (!viewer) return;
    while (viewer.firstChild) viewer.removeChild(viewer.firstChild);

    try {
        var resp = await fetch('/api/artifact/' + runId + '/' + filePath);
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        var text = await resp.text();

        var panel = h('div', {className: 'detail-panel', style: 'margin-top:12px'}, [
            h('div', {style: 'display:flex;justify-content:space-between;align-items:center;margin-bottom:12px'}, [
                h('div', {className: 'label'}, filePath),
                h('button', {className: 'btn', style: 'padding:4px 10px;font-size:11px', onClick: function() {
                    while (viewer.firstChild) viewer.removeChild(viewer.firstChild);
                }}, 'Close'),
            ]),
            h('pre', {style: 'white-space:pre-wrap;font-size:12px;max-height:500px;overflow-y:auto;color:var(--text);background:var(--bg);padding:12px;border-radius:4px;border:1px solid var(--border)'}, text),
        ]);
        viewer.appendChild(panel);
    } catch(e) {
        viewer.appendChild(h('div', {className: 'detail-panel', style: 'border-color:var(--red)'}, 'Error loading artifact: ' + e.message));
    }
}

async function renderSwarms(container) {
    container.appendChild(h('h1', {className: 'page-title'}, 'Swarms'));
    try {
        var swarms = await apiGet('swarms');
        if (!swarms.length) { container.appendChild(h('div', {className: 'empty-state'}, 'No swarms defined')); return; }
        var tbl = h('table', null, [
            h('thead', null, h('tr', null, [
                h('th', {scope: 'col'}, 'Name'), h('th', {scope: 'col'}, 'ID'), h('th', {scope: 'col'}, 'Status'), h('th', {scope: 'col'}, 'Created'),
            ])),
            h('tbody', null, swarms.map(function(s) {
                return clickableRow('swarm/' + s.swarm_id, [
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
    container.appendChild(h('h1', {className: 'page-title'}, 'Swarm Detail'));
    try {
        var data = await apiGet('swarm/' + swarmId);
        if (!data.swarm) { container.appendChild(h('div', {className: 'empty-state'}, 'Swarm not found')); return; }
        var s = data.swarm;

        // Delivery dropdown
        var deliverySelect = h('select', {
            id: 'delivery-select',
            style: 'padding:6px 12px;background:var(--surface);color:var(--text);border:1px solid var(--border);border-radius:4px;font-size:13px;min-width:180px',
        }, [h('option', {value: 'none'}, 'Loading...')]);

        // Populate delivery options asynchronously
        (async function() {
            try {
                var methods = await apiGet('delivery/available');
                var lastPref = await apiGet('delivery/last/' + s.swarm_id);
                while (deliverySelect.firstChild) deliverySelect.removeChild(deliverySelect.firstChild);
                methods.forEach(function(m) {
                    if (m.status !== 'connected') return;
                    var opt = h('option', {value: m.type, 'data-dest': m.destination}, m.label);
                    if (m.type === lastPref.type) opt.selected = true;
                    deliverySelect.appendChild(opt);
                });
            } catch(e) {
                while (deliverySelect.firstChild) deliverySelect.removeChild(deliverySelect.firstChild);
                deliverySelect.appendChild(h('option', {value: 'none'}, 'No delivery'));
            }
        })();

        // Run button
        var runBtn = h('button', {className: 'btn', style: 'padding:8px 20px',
            onClick: async function() {
                runBtn.disabled = true;
                runBtn.textContent = 'Running...';
                announce('Swarm execution started');
                var selOpt = deliverySelect.options[deliverySelect.selectedIndex];
                var delType = selOpt ? selOpt.value : 'none';
                var delDest = selOpt ? (selOpt.getAttribute('data-dest') || '') : '';
                try {
                    var result = await apiPost('swarm/run', {
                        swarm_id: s.swarm_id,
                        delivery_type: delType,
                        delivery_destination: delDest,
                    });
                    runBtn.textContent = 'Done: ' + (result.run_id || '').substring(0, 16);
                    announce('Swarm execution completed: ' + (result.run_id || ''));
                    setTimeout(function() { location.hash = '#run/' + result.run_id; }, 1200);
                } catch(e) {
                    runBtn.textContent = 'Failed: ' + e.message;
                    announce('Swarm execution failed: ' + e.message);
                    setTimeout(function() { runBtn.textContent = 'Run Now'; runBtn.disabled = false; }, 3000);
                }
            }
        }, 'Run Now');

        // Header panel
        var panel = h('div', {className: 'detail-panel'}, [
            detailRow('Name', s.swarm_name),
            detailRow('ID', s.swarm_id),
            detailRow('Status', null, statusBadge(s.lifecycle_status)),
            detailRow('Description', s.description || '-'),
            detailRow('Created', formatTime(s.created_at)),
            detailRow('Created By', s.created_by),
        ]);
        container.appendChild(panel);

        // Stats row
        var stats = h('div', {className: 'stat-grid'}, [
            statCard('Pipeline Stages', String((data.pipeline_steps || []).length)),
            statCard('Tools', String((data.tools || []).length)),
            statCard('Runs', String((data.runs || []).length)),
        ]);
        container.appendChild(stats);

        // Action bar with delivery dropdown
        var actionBar = h('div', {style: 'margin-bottom:24px;display:flex;align-items:center;gap:16px'}, [
            runBtn,
            h('span', {style: 'color:var(--text-dim);font-size:13px'}, 'Delivery Method'),
            deliverySelect,
        ]);
        container.appendChild(actionBar);

        // Pipeline Actions table with clickable engine badges
        var actions = data.actions || [];
        if (actions.length) {
            container.appendChild(h('h2', {className: 'page-title', style: 'margin-top:8px'}, 'Pipeline'));
            var actTbody = h('tbody');
            actions.forEach(function(act) {
                function makeEngineBadge(engine, model, field, actionId) {
                    var label = '-';
                    var cls = 'badge badge-dim';
                    if (engine === 'ollama') { label = 'Ollama'; cls = 'badge badge-blue'; if (model) label += '\\n' + model; }
                    else if (engine === 'apple_intelligence') { label = 'Apple\\nIntelligence'; cls = 'badge badge-green'; }
                    var badge = h('button', {
                        type: 'button',
                        className: cls,
                        'aria-label': 'Change ' + field.replace('_', ' ') + ': currently ' + (engine || 'none'),
                        style: 'cursor:pointer;white-space:pre-line;line-height:1.3;text-align:center;min-width:70px;display:inline-block;border:none;font-family:inherit;font-size:inherit;font-weight:inherit',
                        onClick: function(e) {
                            e.stopPropagation();
                            showEngineSelector(badge, actionId, field, engine);
                        },
                    }, label);
                    return badge;
                }
                var row = h('tr', null, [
                    h('td', {style: 'font-weight:500'}, act.action_name || '-'),
                    h('td', {style: 'font-size:11px;color:var(--text-dim);font-family:monospace'}, (act.action_id || '').substring(0, 16) + '...'),
                    h('td', null, act.operation_type || '-'),
                    h('td', null, makeEngineBadge(act.inference_engine, act.inference_model, 'inference_engine', act.action_id)),
                    h('td', null, makeEngineBadge(act.fallback_engine, null, 'fallback_engine', act.action_id)),
                ]);
                actTbody.appendChild(row);
            });
            var actTbl = h('table', null, [
                h('thead', null, h('tr', null, [
                    h('th', {scope: 'col'}, 'Action'), h('th', {scope: 'col'}, 'ID'), h('th', {scope: 'col'}, 'Type'),
                    h('th', {scope: 'col'}, 'Engine'), h('th', {scope: 'col'}, 'Fallback'),
                ])),
                actTbody,
            ]);
            container.appendChild(actTbl);
        } else if (data.pipeline_steps && data.pipeline_steps.length) {
            // Fallback: show pipeline steps if no actions yet
            container.appendChild(h('h2', {className: 'page-title', style: 'margin-top:8px'}, 'Pipeline'));
            var pipeTbl = h('table', null, [
                h('thead', null, h('tr', null, [
                    h('th', {scope: 'col'}, '#'), h('th', {scope: 'col'}, 'Step'), h('th', {scope: 'col'}, 'Tool'),
                    h('th', {scope: 'col'}, 'Engine'), h('th', {scope: 'col'}, 'Description'),
                ])),
                h('tbody', null, data.pipeline_steps.map(function(step, i) {
                    function engineBadge(eng) {
                        if (!eng) return h('span', {className: 'badge badge-dim'}, '-');
                        if (eng === 'ollama') return h('span', {className: 'badge badge-blue'}, 'Ollama');
                        if (eng === 'apple_intelligence') return h('span', {className: 'badge badge-green'}, 'Apple AI');
                        return h('span', {className: 'badge'}, eng);
                    }
                    return h('tr', null, [
                        h('td', null, String(i + 1)),
                        h('td', {style: 'font-weight:500'}, step.step_id || '-'),
                        h('td', null, step.tool_name || '-'),
                        h('td', null, engineBadge(step.engine)),
                        h('td', {style: 'font-size:12px;color:var(--text-dim)'}, step.description || '-'),
                    ]);
                })),
            ]);
            container.appendChild(pipeTbl);
        }

        // Tools table
        if (data.tools && data.tools.length) {
            container.appendChild(h('h2', {className: 'page-title', style: 'margin-top:24px'}, 'Tools'));
            var toolsTbl = h('table', null, [
                h('thead', null, h('tr', null, [
                    h('th', {scope: 'col'}, 'Name'), h('th', {scope: 'col'}, 'Family'), h('th', {scope: 'col'}, 'Execution Class'), h('th', {scope: 'col'}, 'Status'),
                ])),
                h('tbody', null, data.tools.map(function(t) {
                    return clickableRow('tool/' + t.tool_name, [
                        h('td', null, t.tool_name),
                        h('td', null, t.tool_family || '-'),
                        h('td', {style: 'font-family:monospace;font-size:12px'}, t.execution_class || '-'),
                        h('td', null, statusBadge(t.maturity_status)),
                    ]);
                })),
            ]);
            container.appendChild(toolsTbl);
        }

        // Recent Runs
        if (data.runs && data.runs.length) {
            container.appendChild(h('h2', {className: 'page-title', style: 'margin-top:24px'}, 'Runs'));
            container.appendChild(runsTable(data.runs.slice(0, 10)));
        }

        // Warnings
        if (data.warnings && data.warnings.length) {
            container.appendChild(h('h2', {className: 'page-title', style: 'margin-top:24px'}, 'Warnings'));
            data.warnings.forEach(function(w) {
                container.appendChild(h('div', {className: 'detail-panel'}, [
                    detailRow('Severity', w.severity),
                    detailRow('Message', w.message),
                    detailRow('Created', formatTime(w.created_at)),
                ]));
            });
        }

        // Events
        if (data.events && data.events.length) {
            container.appendChild(h('h2', {className: 'page-title', style: 'margin-top:24px'}, 'Events'));
            var evtTbl = h('table', null, [
                h('thead', null, h('tr', null, [h('th', {scope: 'col'}, 'Type'), h('th', {scope: 'col'}, 'Summary'), h('th', {scope: 'col'}, 'Time')])),
                h('tbody', null, data.events.slice(0, 20).map(function(ev) {
                    return h('tr', null, [
                        h('td', null, ev.event_type),
                        h('td', null, ev.summary || '-'),
                        h('td', null, formatTime(ev.event_time)),
                    ]);
                })),
            ]);
            container.appendChild(evtTbl);
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
    container.appendChild(h('h1', {className: 'page-title'}, 'Runs'));
    try {
        var runs = await apiGet('runs?limit=50');
        if (!runs.length) { container.appendChild(h('div', {className: 'empty-state'}, 'No runs found')); return; }
        container.appendChild(runsTable(runs));
    } catch(e) {
        container.appendChild(h('div', {className: 'empty-state'}, 'Error: ' + e.message));
    }
}

async function renderEvents(container) {
    container.appendChild(h('h1', {className: 'page-title'}, 'Events'));
    try {
        var [events, swarms] = await Promise.all([apiGet('events?limit=100'), apiGet('swarms')]);
        var swarmNames = {};
        swarms.forEach(function(s) { swarmNames[s.swarm_id] = s.swarm_name; });
        if (!events.length) { container.appendChild(h('div', {className: 'empty-state'}, 'No events recorded')); return; }
        var tbl = h('table', null, [
            h('thead', null, h('tr', null, [
                h('th', {scope: 'col'}, 'Event'), h('th', {scope: 'col'}, 'Swarm'), h('th', {scope: 'col'}, 'Summary'), h('th', {scope: 'col'}, 'Time'),
            ])),
            h('tbody', null, events.map(function(ev) {
                var swarmLabel = swarmNames[ev.swarm_id] || truncId(ev.swarm_id);
                return h('tr', null, [
                    h('td', null, ev.event_type),
                    h('td', null, ev.swarm_id ? h('a', {href: '#swarm/' + ev.swarm_id, style: 'color:var(--accent)'}, swarmLabel) : '-'),
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
    container.appendChild(h('h1', {className: 'page-title'}, 'Tools'));
    try {
        var tools = await apiGet('tools');
        if (!tools.length) { container.appendChild(h('div', {className: 'empty-state'}, 'No tools registered')); return; }
        var tbl = h('table', null, [
            h('thead', null, h('tr', null, [
                h('th', {scope: 'col'}, 'Name'), h('th', {scope: 'col'}, 'Family'), h('th', {scope: 'col'}, 'Status'), h('th', {scope: 'col'}, 'Dry Run'),
            ])),
            h('tbody', null, tools.map(function(t) {
                return clickableRow('tool/' + t.tool_name, [
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

async function renderToolDetail(container, toolName) {
    container.appendChild(h('h1', {className: 'page-title'}, 'Tool Detail'));
    try {
        var data = await apiGet('tool/' + encodeURIComponent(toolName));
        var tool = data.tool;

        // Tool info panel
        var panel = h('div', {className: 'detail-panel'}, [
            detailRow('Name', tool.tool_name),
            detailRow('ID', tool.tool_id),
            detailRow('Family', tool.tool_family || '-'),
            detailRow('Description', tool.description || '-'),
            detailRow('Execution Class', tool.execution_class || '-'),
            detailRow('Status', null, statusBadge(tool.maturity_status)),
            detailRow('Dry Run', tool.supports_dry_run ? 'Yes' : 'No'),
            detailRow('Created', formatTime(tool.created_at)),
        ]);
        container.appendChild(panel);

        // Swarms using this tool
        container.appendChild(h('h2', {className: 'page-title', style: 'margin-top:24px'}, 'Swarms Using This Tool'));
        if (!data.swarms.length) {
            container.appendChild(h('div', {className: 'empty-state'}, 'No swarms reference this tool'));
        } else {
            var tbl = h('table', null, [
                h('thead', null, h('tr', null, [
                    h('th', {scope: 'col'}, 'Swarm'), h('th', {scope: 'col'}, 'Status'),
                    h('th', {scope: 'col'}, 'Stage'), h('th', {scope: 'col'}, 'Engine'),
                ])),
                h('tbody', null, data.swarms.map(function(s) {
                    return clickableRow('swarm/' + s.swarm_id, [
                        h('td', null, h('a', {href: '#swarm/' + s.swarm_id, style: 'color:var(--accent)', onClick: function(e) { e.stopPropagation(); }}, s.swarm_name)),
                        h('td', null, statusBadge(s.lifecycle_status)),
                        h('td', null, s.step_id || '-'),
                        h('td', null, s.engine || '-'),
                    ]);
                })),
            ]);
            container.appendChild(tbl);
        }

        // Recent runs where this tool was invoked
        if (data.recent_runs && data.recent_runs.length) {
            container.appendChild(h('h2', {className: 'page-title', style: 'margin-top:24px'}, 'Recent Runs'));
            container.appendChild(runsTable(data.recent_runs));
        }

    } catch(e) {
        container.appendChild(h('div', {className: 'empty-state'}, 'Error: ' + e.message));
    }
}

async function renderSettings(container) {
    container.appendChild(h('h1', {className: 'page-title'}, 'Settings'));
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

// -- Context Report Page --
async function renderACDSAdmin(container) {
    container.appendChild(h('h1', {className: 'page-title'}, 'ACDS Admin'));

    // Health status bar
    var healthPanel = h('div', {className: 'detail-panel'}, [
        h('div', {className: 'detail-row'}, [
            h('div', {className: 'detail-label'}, 'ACDS API'),
            h('div', {className: 'detail-value', id: 'acds-status'}, 'Checking...'),
        ]),
        h('div', {className: 'detail-row'}, [
            h('div', {className: 'detail-label'}, 'Apple Intelligence'),
            h('div', {className: 'detail-value', id: 'apple-status'}, 'Checking...'),
        ]),
        h('div', {className: 'detail-row'}, [
            h('div', {className: 'detail-label'}, 'Admin Web'),
            h('div', {className: 'detail-value'}, [
                h('a', {href: 'http://localhost:4173', target: '_blank',
                    style: 'color:var(--accent);text-decoration:none'},
                    'http://localhost:4173 \u2197'),
            ]),
        ]),
    ]);
    container.appendChild(healthPanel);

    // Check health
    try {
        var health = await apiGet('context-report/health');
        var acdsEl = document.getElementById('acds-status');
        while (acdsEl.firstChild) acdsEl.removeChild(acdsEl.firstChild);
        acdsEl.appendChild(statusBadge(health.acds_healthy ? 'active' : 'error'));
        var appleEl = document.getElementById('apple-status');
        while (appleEl.firstChild) appleEl.removeChild(appleEl.firstChild);
        appleEl.appendChild(statusBadge(health.apple_bridge_healthy ? 'active' : 'error'));
    } catch(e) {
        var acdsEl2 = document.getElementById('acds-status');
        acdsEl2.textContent = 'Unreachable';
        var appleEl2 = document.getElementById('apple-status');
        appleEl2.textContent = 'Unknown';
    }

    // Embedded ACDS Admin Web
    var iframe = h('iframe', {
        src: 'http://localhost:4173',
        style: 'width:100%;height:calc(100vh - 220px);border:1px solid var(--border);border-radius:6px;background:var(--bg)',
        id: 'acds-admin-frame',
    });
    container.appendChild(iframe);
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
    else if (hash.indexOf('run/') === 0) renderRunDetail(content, hash.slice(4));
    else if (hash === 'runs') renderRuns(content);
    else if (hash === 'events') renderEvents(content);
    else if (hash.indexOf('tool/') === 0) renderToolDetail(content, decodeURIComponent(hash.slice(5)));
    else if (hash === 'tools') renderTools(content);
    else if (hash === 'settings') renderSettings(content);
    else if (hash === 'acds-admin') renderACDSAdmin(content);
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

    # Per-swarm last-used delivery preference (survives across requests)
    _delivery_prefs: dict[str, dict] = {}

    class ProofUIHandler(BaseHTTPRequestHandler):
        """HTTP request handler for the ProofUI console."""

        def log_message(self, fmt: str, *args: Any) -> None:
            logger.info(fmt, *args)

        # ── Response helpers ──

        def _allowed_origin(self) -> str:
            """Return the request Origin only if it's a localhost address."""
            origin = self.headers.get("Origin", "")
            if origin:
                from urllib.parse import urlparse
                parsed = urlparse(origin)
                if parsed.hostname in ("localhost", "127.0.0.1", "::1"):
                    return origin
            # No Origin header (same-origin request) — allow
            return f"http://localhost:{self.server.server_address[1]}"

        def _json_response(self, data: Any, status: int = 200) -> None:
            body = json.dumps(data, default=str).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Access-Control-Allow-Origin", self._allowed_origin())
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
            self.send_header("Access-Control-Allow-Origin", self._allowed_origin())
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
                # Auto-register all system swarms if not present
                try:
                    from swarm.definitions.niks_context_report import find_or_register
                    find_or_register(swarm_platform.repo)
                except Exception as exc:
                    logger.warning("Failed to register Nik's Context Report: %s", exc)
                try:
                    from swarm.definitions.grits_audit import find_or_register as grits_register
                    grits_register(swarm_platform.repo)
                except Exception as exc:
                    logger.warning("Failed to register GRITS Audit: %s", exc)
                try:
                    from swarm.definitions.oregon_ai_brief import find_or_register as oregon_register
                    from swarm.definitions.oregon_ai_brief import find_or_register_audio as oregon_audio_register
                    oregon_register(swarm_platform.repo)
                    oregon_audio_register(swarm_platform.repo)
                except Exception as exc:
                    logger.warning("Failed to register Oregon AI Brief: %s", exc)

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
                runs = swarm_platform.repo.list_runs(swarm_id)
                # Get behavior sequence with pipeline steps
                bs = swarm_platform.repo.get_behavior_sequence_by_swarm(swarm_id)
                pipeline_steps = []
                if bs:
                    steps_raw = bs.get("ordered_steps_json", "[]")
                    try:
                        pipeline_steps = json.loads(steps_raw) if isinstance(steps_raw, str) else steps_raw
                    except (json.JSONDecodeError, TypeError):
                        pass
                # Get tools used by this swarm
                tool_names = list({s.get("tool_name") for s in pipeline_steps if s.get("tool_name")})
                swarm_tools = []
                for tn in tool_names:
                    t = swarm_platform.repo.get_tool_by_name(tn)
                    if t:
                        swarm_tools.append(t)
                # Get swarm actions with inference assignments
                actions = swarm_platform.repo.list_actions(swarm_id)
                self._json_response({
                    "swarm": swarm,
                    "warnings": warnings,
                    "events": events,
                    "runs": runs,
                    "pipeline_steps": pipeline_steps,
                    "actions": actions,
                    "tools": swarm_tools,
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
                runs = swarm_platform.repo.list_all_runs(status=status_filter, limit=limit)
                # Enrich with swarm names
                swarm_cache = {}
                for r in runs:
                    sid = r.get("swarm_id", "")
                    if sid not in swarm_cache:
                        sw = swarm_platform.repo.get_swarm(sid)
                        swarm_cache[sid] = (sw.get("swarm_name") or sid) if sw else sid
                    r["swarm_name"] = swarm_cache[sid]
                self._json_response(runs)
                return

            m = _RUN_DETAIL_RE.match(path)
            if m:
                run_id = m.group(1)
                run = swarm_platform.repo.get_run(run_id)
                if not run:
                    self._error_response(404, "Run not found")
                    return
                # Enrich with action results, artifacts, events
                action_results = swarm_platform.repo.get_run_action_results(run_id)
                swarm = swarm_platform.repo.get_swarm(run.get("swarm_id", ""))
                swarm_name = ""
                if swarm:
                    swarm_name = swarm.get("swarm_name") or swarm.get("name", "")
                events = swarm_platform.repo.list_all_events(limit=200)
                run_events = [e for e in events if run_id in (e.get("summary") or "")]
                # Scan workspace for artifact files
                workspace_dir = swarm_platform.openclaw_root / "workspace" / run_id
                artifact_files = []
                if workspace_dir.exists():
                    for f in sorted(workspace_dir.rglob("*")):
                        if f.is_file():
                            rel = str(f.relative_to(workspace_dir))
                            artifact_files.append({
                                "path": rel,
                                "size": f.stat().st_size,
                            })
                artifact_refs = []
                refs_json = run.get("artifact_refs_json")
                if refs_json:
                    try:
                        artifact_refs = json.loads(refs_json)
                    except (json.JSONDecodeError, TypeError):
                        pass
                # Load inference trace if available
                inference_trace = []
                trace_path = workspace_dir / "inference_trace.json"
                if trace_path.exists():
                    try:
                        inference_trace = json.loads(trace_path.read_text())
                    except (json.JSONDecodeError, OSError):
                        pass
                self._json_response({
                    "run": run,
                    "swarm_name": swarm_name,
                    "action_results": action_results,
                    "artifact_refs": artifact_refs,
                    "artifact_files": artifact_files,
                    "inference_trace": inference_trace,
                    "events": run_events,
                })
                return

            if path == "/api/delivery/available":
                # Validate which delivery methods are actually reachable
                methods = []
                # Check Telegram
                import os as _os
                tg_token = _os.environ.get("TELEGRAM_BOT_TOKEN", "")
                if tg_token:
                    try:
                        import urllib.request as _ur
                        req = _ur.Request(
                            f"https://api.telegram.org/bot{tg_token}/getMe",
                            method="GET",
                        )
                        with _ur.urlopen(req, timeout=5) as resp:
                            import json as _j2
                            data = _j2.loads(resp.read())
                            if data.get("ok"):
                                bot_name = data.get("result", {}).get("username", "bot")
                                methods.append({
                                    "type": "telegram",
                                    "label": f"Telegram (@{bot_name})",
                                    "destination": "5218027396",
                                    "status": "connected",
                                })
                    except Exception:
                        pass
                # Check Email/SMTP
                try:
                    from swarm.delivery.validation import load_smtp_profile
                    profile = load_smtp_profile(swarm_platform.openclaw_root)
                    if profile and profile.get("host"):
                        import smtplib as _smtp
                        host = profile["host"]
                        port = profile.get("port", 587)
                        try:
                            s = _smtp.SMTP(host, port, timeout=5)
                            s.quit()
                            sender = profile.get("sender", {}).get("address", "")
                            methods.append({
                                "type": "email",
                                "label": f"Email ({sender})",
                                "destination": sender,
                                "status": "connected",
                            })
                        except OSError:
                            methods.append({
                                "type": "email",
                                "label": f"Email ({profile.get('sender', {}).get('address', '')})",
                                "destination": "",
                                "status": "unreachable",
                            })
                except Exception:
                    pass
                # Always include "none"
                methods.insert(0, {
                    "type": "none",
                    "label": "No delivery",
                    "destination": "",
                    "status": "connected",
                })
                self._json_response(methods)
                return

            if path.startswith("/api/delivery/last/"):
                sid = path.split("/api/delivery/last/")[1]
                pref = _delivery_prefs.get(sid, {"type": "none", "destination": ""})
                self._json_response(pref)
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

            # Tool detail with swarm cross-references
            if path.startswith("/api/tool/"):
                import urllib.parse as _up
                tool_name = _up.unquote(path[len("/api/tool/"):])
                tool = swarm_platform.repo.get_tool_by_name(tool_name)
                if not tool:
                    self._error_response(404, "Tool not found")
                    return
                # Find swarms that use this tool in their behavior sequence
                all_swarms = swarm_platform.repo.list_swarms()
                using_swarms = []
                for swarm in all_swarms:
                    sid = swarm.get("swarm_id", "")
                    bs = swarm_platform.repo.get_behavior_sequence_by_swarm(sid)
                    if not bs:
                        continue
                    raw = bs.get("ordered_steps_json", "[]")
                    try:
                        steps = json.loads(raw)
                    except (json.JSONDecodeError, TypeError):
                        continue
                    for step in steps:
                        if step.get("tool_name") == tool_name:
                            using_swarms.append({
                                "swarm_id": sid,
                                "swarm_name": swarm.get("swarm_name", ""),
                                "lifecycle_status": swarm.get("lifecycle_status", ""),
                                "step_id": step.get("step_id", ""),
                                "engine": step.get("engine") or "none",
                            })
                # Recent runs for swarms using this tool
                recent_runs = []
                seen_swarm_ids = set(s["swarm_id"] for s in using_swarms)
                if seen_swarm_ids:
                    all_runs = swarm_platform.repo.list_all_runs(limit=50)
                    recent_runs = [
                        r for r in all_runs
                        if r.get("swarm_id") in seen_swarm_ids
                    ][:10]
                self._json_response({
                    "tool": tool,
                    "swarms": using_swarms,
                    "recent_runs": recent_runs,
                })
                return

            # Serve artifact file content
            if path.startswith("/api/artifact/"):
                rest = path[len("/api/artifact/"):]
                slash_idx = rest.find("/")
                if slash_idx < 0:
                    self._error_response(400, "Missing file path")
                    return
                run_id = rest[:slash_idx]
                file_rel = rest[slash_idx + 1:]
                workspace_dir = swarm_platform.openclaw_root / "workspace" / run_id
                target = (workspace_dir / file_rel).resolve()
                if not str(target).startswith(str(workspace_dir.resolve())):
                    self._error_response(403, "Access denied")
                    return
                if not target.exists() or not target.is_file():
                    self._error_response(404, "File not found")
                    return
                content = target.read_bytes()
                content_type = "application/octet-stream"
                if target.suffix in (".json",):
                    content_type = "application/json"
                elif target.suffix in (".md", ".txt"):
                    content_type = "text/plain; charset=utf-8"
                self.send_response(200)
                self.send_header("Content-Type", content_type)
                self.send_header("Content-Length", str(len(content)))
                self.send_header("Access-Control-Allow-Origin", self._allowed_origin())
                self.end_headers()
                self.wfile.write(content)
                return

            # Context Report health
            if path == "/api/context-report/health":
                from proof_ui.context_report import check_health
                self._json_response(check_health())
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
                execute = body.get("execute", True)
                delivery_type = body.get("delivery_type", "none")
                delivery_destination = body.get("delivery_destination", "")
                if not swarm_id:
                    self._error_response(400, "swarm_id required")
                    return
                run_id = swarm_platform.repo.create_run(
                    swarm_id, trigger_source, created_by_trigger=created_by,
                )
                # Configure delivery for this run if requested
                if delivery_type and delivery_type != "none":
                    try:
                        # Check for existing delivery config
                        existing = swarm_platform.repo.get_delivery_by_swarm(swarm_id)
                        if existing:
                            # Update existing delivery
                            swarm_platform.repo.conn.execute(
                                "UPDATE swarm_deliveries SET delivery_type = ?, destination = ?, enabled = 1 WHERE delivery_id = ?",
                                (delivery_type, delivery_destination, existing["delivery_id"]),
                            )
                            swarm_platform.repo._commit()
                        else:
                            swarm_platform.repo.create_delivery(
                                swarm_id, delivery_type, delivery_destination,
                            )
                    except Exception:
                        pass  # Non-fatal — run proceeds without delivery
                    # Store as last-used preference
                    _delivery_prefs[swarm_id] = {
                        "type": delivery_type,
                        "destination": delivery_destination,
                    }
                if execute:
                    try:
                        exec_result = swarm_platform.execute_run(run_id)
                        exec_result["run_id"] = run_id
                        self._json_response(exec_result)
                    except Exception as exc:
                        logger.exception("Swarm execution failed for run %s", run_id)
                        self._json_response({
                            "run_id": run_id,
                            "execution_status": "failed",
                            "error": str(exc),
                        }, status=500)
                else:
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

            # Update inference engine for a swarm action
            if path == "/api/action/update-inference":
                action_id = body.get("action_id", "")
                if not action_id:
                    self._error_response(400, "action_id required")
                    return
                action = swarm_platform.repo.get_action(action_id)
                if not action:
                    self._error_response(404, "Action not found")
                    return
                updates = {}
                if "inference_engine" in body:
                    eng = body["inference_engine"]
                    updates["inference_engine"] = eng if eng else None
                if "inference_model" in body:
                    updates["inference_model"] = body["inference_model"] or None
                if "fallback_engine" in body:
                    updates["fallback_engine"] = body["fallback_engine"] or None
                if updates:
                    swarm_platform.repo.update_action(action_id, **updates)
                updated = swarm_platform.repo.get_action(action_id)
                self._json_response(updated)
                return

            # Nik's Context Report — register + run as swarm
            if path == "/api/context-report/run":
                from swarm.definitions.niks_context_report import find_or_register
                try:
                    swarm_id = find_or_register(swarm_platform.repo)
                    run_id = swarm_platform.repo.create_run(
                        swarm_id, "manual_proof_ui", created_by_trigger="proof_ui",
                    )
                    result = swarm_platform.execute_run(run_id)
                    result["swarm_id"] = swarm_id
                    result["run_id"] = run_id
                    self._json_response(result)
                except Exception as exc:
                    logger.exception("Context report swarm execution failed")
                    self._json_response({"error": str(exc)}, status=500)
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

    class ThreadedHTTPServer(ThreadingMixIn, HTTPServer):
        daemon_threads = True

    server = ThreadedHTTPServer(("0.0.0.0", port), handler_cls)
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
