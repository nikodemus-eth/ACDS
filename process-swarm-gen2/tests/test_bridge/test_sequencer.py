"""Tests for the multi-step sequence orchestrator."""

from __future__ import annotations

import pytest

from runtime.bridge.sequencer import (
    SequenceResult,
    build_document_sequence,
)
from runtime.bridge.translator import integration_proposal_to_m4


# --------------------------------------------------------------------------
# build_document_sequence tests
# --------------------------------------------------------------------------


class TestBuildDocumentSequence:
    def test_generates_three_proposals(self):
        proposals = build_document_sequence(
            target_path="output/test.md",
            title="Test Title",
            byline="Test Author",
            body="Test body content.",
        )
        assert len(proposals) == 3

    def test_step_ordering_ids(self):
        proposals = build_document_sequence(
            target_path="output/test.md",
            title="T",
            byline="B",
            body="Body.",
            sequence_id="seq-test",
        )
        assert proposals[0]["proposal_id"] == "seq-test.step-1-title"
        assert proposals[1]["proposal_id"] == "seq-test.step-2-byline"
        assert proposals[2]["proposal_id"] == "seq-test.step-3-body"

    def test_step1_creates_file(self):
        proposals = build_document_sequence(
            target_path="output/test.md",
            title="My Title",
            byline="Author",
            body="Body.",
        )
        step1 = proposals[0]
        assert step1["change_spec"]["mode"] == "create_file"
        assert "# My Title" in step1["change_spec"]["text"]

    def test_step2_appends_byline(self):
        proposals = build_document_sequence(
            target_path="output/test.md",
            title="T",
            byline="Jane Doe",
            body="Body.",
        )
        step2 = proposals[1]
        assert step2["change_spec"]["mode"] == "append_text"
        assert "*By Jane Doe*" in step2["change_spec"]["text"]

    def test_step3_appends_body(self):
        proposals = build_document_sequence(
            target_path="output/test.md",
            title="T",
            byline="B",
            body="Lorem ipsum dolor sit amet.",
        )
        step3 = proposals[2]
        assert step3["change_spec"]["mode"] == "append_text"
        assert "Lorem ipsum dolor sit amet." in step3["change_spec"]["text"]

    def test_all_proposals_target_same_path(self):
        proposals = build_document_sequence(
            target_path="output/doc.md",
            title="T",
            byline="B",
            body="Body.",
        )
        for p in proposals:
            assert p["target"]["path"] == "output/doc.md"

    def test_all_proposals_are_valid_integration_format(self):
        proposals = build_document_sequence(
            target_path="output/test.md",
            title="T",
            byline="B",
            body="Body text here.",
        )
        for p in proposals:
            assert p["artifact_type"] == "behavior_proposal"
            assert p["version"] == "0.1"
            assert p["operation_class"] == "docs_edit"
            assert "author_agent" in p
            assert "namespace" in p
            assert "scope" in p
            assert "constraints" in p

    def test_all_proposals_translate_to_m4(self):
        """Every generated proposal must pass bridge translation."""
        proposals = build_document_sequence(
            target_path="output/test.md",
            title="Title",
            byline="Author",
            body="Body content for the document.",
        )
        for p in proposals:
            m4 = integration_proposal_to_m4(p)
            assert "proposal_id" in m4
            assert "modifications" in m4
            assert len(m4["modifications"]) >= 1
            assert "scope_boundary" in m4

    def test_step1_translates_to_create_operation(self):
        proposals = build_document_sequence(
            target_path="output/test.md",
            title="Title",
            byline="B",
            body="Body.",
        )
        m4 = integration_proposal_to_m4(proposals[0])
        mod = m4["modifications"][0]
        assert mod["operation"] == "create"
        assert "# Title" in mod["content"]

    def test_step2_translates_to_append_operation(self):
        proposals = build_document_sequence(
            target_path="output/test.md",
            title="T",
            byline="Author Name",
            body="Body.",
        )
        m4 = integration_proposal_to_m4(proposals[1])
        mod = m4["modifications"][0]
        assert mod["operation"] == "append"
        assert "*By Author Name*" in mod["content"]

    def test_step3_translates_to_append_operation(self):
        proposals = build_document_sequence(
            target_path="output/test.md",
            title="T",
            byline="B",
            body="The body text goes here.",
        )
        m4 = integration_proposal_to_m4(proposals[2])
        mod = m4["modifications"][0]
        assert mod["operation"] == "append"
        assert "The body text goes here." in mod["content"]

    def test_namespace_propagated(self):
        ns = {
            "workspace": "test-ws",
            "branch": "dev",
            "run_id": "run-123",
            "target_object": "output/test.md",
        }
        proposals = build_document_sequence(
            target_path="output/test.md",
            title="T",
            byline="B",
            body="Body.",
            namespace=ns,
        )
        for p in proposals:
            assert p["namespace"]["workspace"] == "test-ws"
            assert p["namespace"]["branch"] == "dev"

    def test_scope_denies_sensitive_paths(self):
        proposals = build_document_sequence(
            target_path="output/test.md",
            title="T",
            byline="B",
            body="Body.",
        )
        for p in proposals:
            denied = p["constraints"]["disallowed_paths"]
            assert "src/" in denied
            assert "runtime/" in denied

    def test_markdown_formatting(self):
        """The composed document should be valid markdown."""
        proposals = build_document_sequence(
            target_path="output/test.md",
            title="My Document",
            byline="John Smith",
            body="This is the body.",
        )
        content = ""
        for p in proposals:
            m4 = integration_proposal_to_m4(p)
            content += m4["modifications"][0]["content"]

        assert content.startswith("# My Document\n")
        assert "*By John Smith*" in content
        assert "This is the body." in content


# --------------------------------------------------------------------------
# SequenceResult tests
# --------------------------------------------------------------------------


class TestSequenceResult:
    def test_completed_sequence(self):
        result = SequenceResult(
            sequence_id="seq-001",
            steps=[
                {"step": 1, "status": "success"},
                {"step": 2, "status": "success"},
                {"step": 3, "status": "success"},
            ],
            status="completed",
            output_path="output/test.md",
        )
        assert result.succeeded
        assert len(result.completed_steps) == 3
        assert result.failed_step is None

    def test_partial_sequence(self):
        result = SequenceResult(
            sequence_id="seq-002",
            steps=[
                {"step": 1, "status": "success"},
                {"step": 2, "status": "failed"},
            ],
            status="partial",
        )
        assert not result.succeeded
        assert len(result.completed_steps) == 1
        assert result.failed_step["step"] == 2

    def test_to_dict(self):
        result = SequenceResult(
            sequence_id="seq-003",
            steps=[{"step": 1, "status": "success"}],
            status="completed",
            output_path="out.md",
        )
        d = result.to_dict()
        assert d["sequence_id"] == "seq-003"
        assert d["total_steps"] == 1
        assert d["completed_steps"] == 1
        assert d["output_path"] == "out.md"
