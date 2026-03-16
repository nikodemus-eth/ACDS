"""Tests for the bridge translator between Integration and M4 formats."""

from __future__ import annotations

import json

import pytest

from runtime.bridge.translator import (
    BridgePipeline,
    extract_bridge_metadata,
    integration_proposal_to_m4,
    m4_record_to_integration_result,
)


@pytest.fixture
def docs_edit_proposal():
    """Integration-format docs_edit proposal."""
    return {
        "artifact_type": "behavior_proposal",
        "version": "0.1",
        "proposal_id": "behavior.docs-clarify-001",
        "created_at": "2026-03-09T05:43:18.365Z",
        "author_agent": "behavior_author.main",
        "operation_class": "docs_edit",
        "namespace": {
            "workspace": "openclaw",
            "branch": "main",
            "run_id": "run-behavior-001",
            "target_object": "docs/architecture.md",
        },
        "target": {
            "kind": "docs",
            "path": "docs/architecture.md",
        },
        "change_spec": {
            "mode": "append_text",
            "text": "\nClarification: only compiled plans are eligible for execution.\n",
        },
        "intent_summary": "Propose a bounded clarification update to docs/architecture.md.",
        "scope": {
            "allowed_paths": ["docs/architecture.md"],
            "max_files_modified": 1,
            "allow_network": False,
            "allow_package_install": False,
            "allow_external_apis": False,
            "required_tools": ["read", "apply_patch", "test"],
        },
        "constraints": {
            "acceptance_tests": ["echo 'doc check passed'"],
            "side_effect_flags": ["filesystem_write"],
            "requires_human_review": False,
            "disallowed_paths": ["src/", "extensions/"],
        },
        "rationale": "The change is confined to a single documentation file.",
    }


@pytest.fixture
def code_edit_proposal():
    """Integration-format code_edit proposal."""
    return {
        "artifact_type": "behavior_proposal",
        "version": "0.1",
        "proposal_id": "behavior.code-fix-001",
        "created_at": "2026-03-09T06:00:00.000Z",
        "author_agent": "planner.main",
        "operation_class": "code_edit",
        "namespace": {
            "workspace": "openclaw",
            "run_id": "run-code-001",
            "target_object": "src/utils.ts",
        },
        "target": {
            "kind": "file",
            "path": "src/utils.ts",
        },
        "code_edit_spec": {
            "mode": "replace_text",
            "target_snippet": "const x = 1;",
            "replacement_text": "const x = 2;",
        },
        "intent_summary": "Fix incorrect constant value in utils.",
        "scope": {
            "allowed_paths": ["src/utils.ts"],
            "max_files_modified": 1,
            "allow_network": False,
            "allow_package_install": False,
            "allow_external_apis": False,
            "required_tools": ["read", "edit"],
        },
        "constraints": {
            "acceptance_tests": ["echo 'test passed'"],
            "side_effect_flags": ["filesystem_write"],
            "requires_human_review": True,
            "disallowed_paths": ["node_modules/"],
        },
        "rationale": "Simple constant fix with test verification.",
    }


@pytest.fixture
def test_run_proposal():
    """Integration-format test_run proposal."""
    return {
        "artifact_type": "behavior_proposal",
        "version": "0.1",
        "proposal_id": "behavior.test-run-001",
        "created_at": "2026-03-09T07:00:00.000Z",
        "author_agent": "planner.main",
        "operation_class": "test_run",
        "namespace": {
            "workspace": "openclaw",
            "run_id": "run-test-001",
            "target_object": "test/unit",
        },
        "target": {
            "kind": "workspace",
            "path": "test/unit",
        },
        "test_spec": {
            "mode": "command_vector",
            "cwd": ".",
            "argv": ["echo", "test", "passed"],
            "expected_exit_codes": [0],
        },
        "intent_summary": "Run unit tests to verify behavior.",
        "scope": {
            "allowed_paths": ["test/"],
            "max_files_modified": 0,
            "allow_network": False,
            "allow_package_install": False,
            "allow_external_apis": False,
            "required_tools": ["test"],
        },
        "constraints": {
            "acceptance_tests": [],
            "side_effect_flags": [],
            "requires_human_review": False,
            "disallowed_paths": ["src/"],
        },
        "rationale": "Standard test run, no side effects.",
    }


@pytest.fixture
def m4_execution_record():
    """Sample M4 execution record."""
    return {
        "record_id": "exec-001",
        "plan_id": "plan-001",
        "lease_id": "lease-001",
        "actions": [
            {
                "step_id": "step-001",
                "operation": "create",
                "path": "workspace/test.txt",
                "status": "completed",
            },
            {
                "step_id": "step-002",
                "operation": "modify",
                "path": "workspace/config.json",
                "status": "completed",
            },
        ],
        "artifacts_generated": ["workspace/test.txt"],
        "acceptance_results": [
            {"test_id": "test-001", "passed": True, "exit_code": 0},
        ],
        "execution_status": "completed",
        "executor_node_id": "m4-exec-001",
        "signature": {
            "algorithm": "ed25519",
            "signer_role": "node_attestation_signer",
            "signature_value": "abc123",
        },
        "executed_at": "2026-03-09T08:00:00Z",
    }


# --------------------------------------------------------------------------
# Integration -> M4 translation tests
# --------------------------------------------------------------------------


class TestIntegrationToM4:
    def test_docs_edit_proposal_translated(self, docs_edit_proposal):
        result = integration_proposal_to_m4(docs_edit_proposal)
        assert result["proposal_id"] == "behavior.docs-clarify-001"
        assert result["source"] == "m2"
        assert "clarification" in result["intent"].lower()
        assert result["target_paths"] == ["docs/architecture.md"]
        assert result["created_at"] == "2026-03-09T05:43:18.365Z"

    def test_docs_edit_modifications(self, docs_edit_proposal):
        result = integration_proposal_to_m4(docs_edit_proposal)
        assert len(result["modifications"]) == 1
        mod = result["modifications"][0]
        assert mod["path"] == "docs/architecture.md"
        assert mod["operation"] == "append"
        assert "compiled plans" in mod["content"]

    def test_code_edit_proposal_translated(self, code_edit_proposal):
        result = integration_proposal_to_m4(code_edit_proposal)
        assert result["proposal_id"] == "behavior.code-fix-001"
        assert result["source"] == "m2"
        mod = result["modifications"][0]
        assert mod["operation"] == "modify"
        assert mod["content"] == "const x = 2;"

    def test_test_run_proposal_translated(self, test_run_proposal):
        result = integration_proposal_to_m4(test_run_proposal)
        assert result["proposal_id"] == "behavior.test-run-001"
        mod = result["modifications"][0]
        assert mod["operation"] == "create"
        assert "echo test passed" in mod["content"]

    def test_acceptance_tests_converted(self, docs_edit_proposal):
        result = integration_proposal_to_m4(docs_edit_proposal)
        assert len(result["acceptance_tests"]) == 1
        test = result["acceptance_tests"][0]
        assert test["test_id"] == "bridge-test-000"
        assert test["command"] == "echo 'doc check passed'"
        assert test["expected_exit_code"] == 0

    def test_scope_boundary_mapped(self, docs_edit_proposal):
        result = integration_proposal_to_m4(docs_edit_proposal)
        scope = result["scope_boundary"]
        assert scope["allowed_paths"] == ["docs/architecture.md"]
        assert scope["denied_paths"] == ["src/", "extensions/"]

    def test_bridge_metadata_extracted(self, docs_edit_proposal):
        meta = extract_bridge_metadata(docs_edit_proposal)
        assert meta["origin"] == "openclaw-integration"
        assert meta["original_proposal_id"] == "behavior.docs-clarify-001"
        assert meta["operation_class"] == "docs_edit"
        assert meta["namespace"]["workspace"] == "openclaw"

    def test_m4_proposal_has_no_extra_fields(self, docs_edit_proposal):
        result = integration_proposal_to_m4(docs_edit_proposal)
        assert "_bridge_metadata" not in result

    def test_empty_acceptance_tests_get_default(self, test_run_proposal):
        result = integration_proposal_to_m4(test_run_proposal)
        assert len(result["acceptance_tests"]) >= 1
        assert any("bridge" in t["test_id"] for t in result["acceptance_tests"])

    def test_unknown_operation_class_rejected(self, docs_edit_proposal):
        docs_edit_proposal["operation_class"] = "unknown_op"
        with pytest.raises(ValueError, match="Unsupported operation_class"):
            integration_proposal_to_m4(docs_edit_proposal)

    def test_operator_source_for_non_planner(self):
        proposal = {
            "artifact_type": "behavior_proposal",
            "version": "0.1",
            "proposal_id": "manual-001",
            "author_agent": "human_operator",
            "operation_class": "docs_edit",
            "target": {"kind": "file", "path": "readme.md"},
            "intent_summary": "Manual update",
            "scope": {"allowed_paths": ["readme.md"]},
            "constraints": {"acceptance_tests": [], "side_effect_flags": []},
        }
        result = integration_proposal_to_m4(proposal)
        assert result["source"] == "operator"


# --------------------------------------------------------------------------
# M4 -> Integration translation tests
# --------------------------------------------------------------------------


class TestM4ToIntegration:
    def test_success_record_translated(self, m4_execution_record):
        result = m4_record_to_integration_result(m4_execution_record)
        assert result["artifact_type"] == "execution_result"
        assert result["version"] == "0.1"
        assert result["status"] == "success"
        assert result["plan_id"] == "plan-001"

    def test_steps_extracted(self, m4_execution_record):
        result = m4_record_to_integration_result(m4_execution_record)
        assert "step-001" in result["steps_executed"]
        assert "step-002" in result["steps_executed"]

    def test_tests_extracted(self, m4_execution_record):
        result = m4_record_to_integration_result(m4_execution_record)
        assert "test-001" in result["tests_executed"]

    def test_files_modified_extracted(self, m4_execution_record):
        result = m4_record_to_integration_result(m4_execution_record)
        assert "workspace/test.txt" in result["files_modified"]
        assert "workspace/config.json" in result["files_modified"]

    def test_failed_record_mapped(self, m4_execution_record):
        m4_execution_record["execution_status"] = "failed"
        result = m4_record_to_integration_result(m4_execution_record)
        assert result["status"] == "failed"

    def test_result_notes_include_runtime_info(self, m4_execution_record):
        result = m4_record_to_integration_result(m4_execution_record)
        notes = result["result_notes"]
        assert any("m4-exec-001" in n for n in notes)
        assert any("lease-001" in n.lower() for n in notes)

    def test_namespace_recovered_from_metadata(
        self, m4_execution_record, docs_edit_proposal
    ):
        meta = extract_bridge_metadata(docs_edit_proposal)
        result = m4_record_to_integration_result(m4_execution_record, meta)
        assert result["namespace"]["workspace"] == "openclaw"
        assert result["namespace"]["branch"] == "main"


# --------------------------------------------------------------------------
# Bridge Pipeline tests
# --------------------------------------------------------------------------


class TestBridgePipeline:
    def test_deposit_for_ingress(self, tmp_path, docs_edit_proposal):
        bridge = BridgePipeline(tmp_path)
        quarantine = tmp_path / "ingress" / "quarantine"
        dest = bridge.deposit_for_ingress(docs_edit_proposal, quarantine)

        assert dest.exists()
        assert "quarantine" in str(dest)

        with open(dest) as f:
            deposited = json.load(f)
        assert "proposal_id" in deposited
        assert "modifications" in deposited
        assert "scope_boundary" in deposited

    def test_deposit_creates_directory(self, tmp_path, docs_edit_proposal):
        bridge = BridgePipeline(tmp_path)
        quarantine = tmp_path / "new_dir" / "quarantine"
        assert not quarantine.exists()

        dest = bridge.deposit_for_ingress(docs_edit_proposal, quarantine)
        assert dest.exists()
        assert quarantine.exists()

    def test_deposit_blocks_authority_boundary_request(
        self, tmp_path, docs_edit_proposal
    ):
        bridge = BridgePipeline(tmp_path)
        docs_edit_proposal["scope"]["allow_network"] = True
        with pytest.raises(ValueError, match="Bridge warning policy blocked"):
            bridge.deposit_for_ingress(
                docs_edit_proposal, tmp_path / "ingress" / "quarantine"
            )
