"""Tests for execution plan compiler."""

from __future__ import annotations

import pytest

from runtime.compiler.compiler import OPERATION_CAPABILITIES, compile_plan
from runtime.identity.signer import verify_attached_signature
from runtime.validation.validator import validate_proposal


@pytest.fixture
def valid_validation(sample_proposal, keys_dir, schemas_dir):
    return validate_proposal(sample_proposal, keys_dir, schemas_dir)


class TestCompilePlan:
    def test_compiles_valid_proposal(
        self, sample_proposal, valid_validation, keys_dir, schemas_dir
    ):
        plan = compile_plan(sample_proposal, valid_validation, keys_dir, schemas_dir)
        assert "plan_id" in plan
        assert "steps" in plan
        assert "required_capabilities" in plan
        assert plan["proposal_id"] == sample_proposal["proposal_id"]

    def test_plan_is_signed(
        self, sample_proposal, valid_validation, keys_dir, schemas_dir
    ):
        plan = compile_plan(sample_proposal, valid_validation, keys_dir, schemas_dir)
        assert plan["signature"]["signer_role"] == "compiler_signer"
        assert verify_attached_signature(plan, keys_dir)

    def test_rejects_failed_validation(self, sample_proposal, keys_dir, schemas_dir):
        failed = {"status": "failed", "proposal_id": sample_proposal["proposal_id"]}
        with pytest.raises(ValueError, match="failed validation"):
            compile_plan(sample_proposal, failed, keys_dir, schemas_dir)

    def test_rejects_mismatched_proposal_id(
        self, sample_proposal, valid_validation, keys_dir, schemas_dir
    ):
        valid_validation["proposal_id"] = "wrong-id"
        # Re-sign after modification
        valid_validation.pop("signature", None)
        with pytest.raises(ValueError, match="does not match"):
            compile_plan(sample_proposal, valid_validation, keys_dir, schemas_dir)

    def test_extracts_capabilities(
        self, sample_proposal, valid_validation, keys_dir, schemas_dir
    ):
        plan = compile_plan(sample_proposal, valid_validation, keys_dir, schemas_dir)
        caps = plan["required_capabilities"]
        assert "FILESYSTEM_WRITE" in caps

    def test_includes_test_steps(
        self, sample_proposal, valid_validation, keys_dir, schemas_dir
    ):
        plan = compile_plan(sample_proposal, valid_validation, keys_dir, schemas_dir)
        test_steps = [s for s in plan["steps"] if s["operation"] == "run_test"]
        if sample_proposal.get("acceptance_tests"):
            assert len(test_steps) > 0
            assert "TEST_EXECUTION" in plan["required_capabilities"]

    def test_has_validation_id(
        self, sample_proposal, valid_validation, keys_dir, schemas_dir
    ):
        plan = compile_plan(sample_proposal, valid_validation, keys_dir, schemas_dir)
        assert plan["validation_id"] == valid_validation["validation_id"]

    def test_has_scope_constraints(
        self, sample_proposal, valid_validation, keys_dir, schemas_dir
    ):
        plan = compile_plan(sample_proposal, valid_validation, keys_dir, schemas_dir)
        assert "scope_constraints" in plan
        assert "allowed_paths" in plan["scope_constraints"]


class TestOperationCapabilities:
    def test_all_operations_mapped(self):
        assert "create" in OPERATION_CAPABILITIES
        assert "modify" in OPERATION_CAPABILITIES
        assert "delete" in OPERATION_CAPABILITIES
        assert "append" in OPERATION_CAPABILITIES
