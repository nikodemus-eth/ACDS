"""Context Report Stage 1 — Source Collection via RSS feeds.

Engine: NONE (Non-LLM)
Task: Raw data collection, HTTP/API retrieval, feed normalization

Fetches RSS/Atom feeds, extracts entries, and writes them as
structured source documents to the workspace.
"""
from __future__ import annotations

import json
import re
import time
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone

from swarm.tools.base import ToolAdapter, ToolContext, ToolResult


# Default feeds — technology, governance, market intelligence
# Selected for reliability (tested reachability) and category diversity.
_DEFAULT_FEEDS = [
    # Technical
    ("https://feeds.feedburner.com/venturebeat/SZYF", "VentureBeat"),
    ("https://techcrunch.com/feed/", "TechCrunch"),
    ("https://www.wired.com/feed/rss", "Wired"),
    ("https://lwn.net/headlines/rss", "LWN"),
    # Governance & Policy
    ("https://www.eff.org/rss/updates.xml", "EFF"),
    # Market Intelligence
    ("https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=19854910", "CNBC Tech"),
    ("https://blog.google/technology/ai/rss/", "Google AI Blog"),
]

_FETCH_TIMEOUT = 30
_MAX_ENTRIES_PER_FEED = 10


class SourceCollectorAdapter(ToolAdapter):
    """Collects sources from RSS/Atom feeds or configured URLs."""

    @property
    def tool_name(self) -> str:
        return "source_collector"

    def execute(self, ctx: ToolContext) -> ToolResult:
        t0 = time.monotonic()
        sources_dir = ctx.workspace_root / "sources"
        sources_dir.mkdir(parents=True, exist_ok=True)

        collected: list[dict] = []
        warnings: list[str] = []

        # Check for mock fixtures (test mode)
        fixtures_dir = ctx.workspace_root / "fixtures"
        mock_sources_path = fixtures_dir / "mock_sources.json"
        if mock_sources_path.exists():
            data = json.loads(mock_sources_path.read_text())
            for src in data.get("sources", []):
                collected.append(src)

        # Fetch from configured feeds (or defaults)
        # Use None-check so empty list explicitly disables feeds
        feeds = ctx.config.get("feeds")
        if feeds is None:
            feeds = ctx.action.get("feeds")
        if feeds is None:
            feeds = _DEFAULT_FEEDS
        for feed_entry in feeds:
            if isinstance(feed_entry, (list, tuple)) and len(feed_entry) >= 2:
                url, label = feed_entry[0], feed_entry[1]
            elif isinstance(feed_entry, str):
                url, label = feed_entry, feed_entry
            else:
                continue

            try:
                entries = _fetch_feed(url, label)
                collected.extend(entries)
            except Exception as e:
                warnings.append(f"Feed '{label}' failed: {e}")

        # Also collect from explicit URLs in action config
        urls = ctx.action.get("urls", [])
        for url in urls:
            collected.append({
                "url": url, "title": url, "origin": "url", "content": "",
            })

        # Write individual source files
        for i, src in enumerate(collected):
            name = src.get("title", f"source_{i}").replace(" ", "_").lower()
            name = "".join(c if c.isalnum() or c in "_-" else "_" for c in name)[:60]
            dest = sources_dir / f"{name}.json"
            dest.write_text(json.dumps(src, indent=2))

        manifest = {
            "run_id": ctx.run_id,
            "source_count": len(collected),
            "feed_count": len(feeds),
            "collected_at": datetime.now(timezone.utc).isoformat(),
            "sources": collected,
        }
        manifest_path = sources_dir / "source_manifest.json"
        manifest_path.write_text(json.dumps(manifest, indent=2))

        return ToolResult(
            success=True,
            output_data={
                "source_count": len(collected),
                "sources": collected,
                "manifest_path": str(manifest_path),
            },
            artifacts=[str(manifest_path)],
            error=None,
            metadata={
                "duration_ms": int((time.monotonic() - t0) * 1000),
                "feed_count": len(feeds),
                "source_count": len(collected),
            },
            warnings=warnings,
        )


def _fetch_feed(url: str, label: str) -> list[dict]:
    """Fetch and parse an RSS/Atom feed, returning structured entries."""
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "ProcessSwarm/1.0 ContextReport"},
    )
    with urllib.request.urlopen(req, timeout=_FETCH_TIMEOUT) as resp:
        raw = resp.read().decode("utf-8", errors="replace")

    root = ET.fromstring(raw)
    entries: list[dict] = []

    # Handle Atom feeds
    atom_ns = "{http://www.w3.org/2005/Atom}"
    atom_entries = root.findall(f"{atom_ns}entry")
    if atom_entries:
        for entry in atom_entries[:_MAX_ENTRIES_PER_FEED]:
            title = _text(entry, f"{atom_ns}title") or ""
            summary = (
                _text(entry, f"{atom_ns}summary")
                or _text(entry, f"{atom_ns}content")
                or ""
            )
            link_el = entry.find(f"{atom_ns}link")
            link = link_el.get("href", "") if link_el is not None else ""
            published = (
                _text(entry, f"{atom_ns}published")
                or _text(entry, f"{atom_ns}updated")
                or ""
            )
            entries.append({
                "title": title,
                "content": _clean_html(summary),
                "url": link,
                "published": published,
                "origin": label,
            })
        return entries

    # Handle RSS 2.0 feeds
    channel = root.find("channel")
    if channel is None:
        channel = root
    for item in channel.findall("item")[:_MAX_ENTRIES_PER_FEED]:
        title = _text(item, "title") or ""
        desc = _text(item, "description") or ""
        link = _text(item, "link") or ""
        pub_date = _text(item, "pubDate") or ""
        entries.append({
            "title": title,
            "content": _clean_html(desc),
            "url": link,
            "published": pub_date,
            "origin": label,
        })

    return entries


def _text(el: ET.Element, tag: str) -> str | None:
    child = el.find(tag)
    if child is not None and child.text:
        return child.text.strip()
    return None


def _clean_html(text: str) -> str:
    clean = re.sub(r"<[^>]+>", " ", text)
    clean = re.sub(r"\s+", " ", clean)
    return clean.strip()
