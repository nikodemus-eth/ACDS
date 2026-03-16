"""Tests for artifact signing and verification."""

from __future__ import annotations

import copy

import pytest

from runtime.identity.key_manager import SIGNER_ROLES, generate_keypair, save_keypair
from runtime.identity.signer import (
    canonical_json,
    sign_and_attach,
    sign_artifact,
    verify_attached_signature,
    verify_signature,
)


@pytest.fixture
def keys_dir(tmp_path):
    """Create all 5 signer role keys."""
    kd = tmp_path / "keys"
    for role in SIGNER_ROLES:
        sk, _ = generate_keypair()
        save_keypair(role, sk, kd)
    return kd


@pytest.fixture
def sample_artifact():
    return {
        "proposal_id": "prop-001",
        "intent": "Create a test file",
        "target_paths": ["output/test.md"],
    }


class TestCanonicalJson:
    def test_sorted_keys(self):
        result = canonical_json({"b": 2, "a": 1})
        assert result == b'{"a":1,"b":2}'

    def test_no_whitespace(self):
        result = canonical_json({"key": "value"})
        assert b" " not in result

    def test_deterministic(self):
        obj = {"z": 1, "a": 2, "m": 3}
        assert canonical_json(obj) == canonical_json(obj)

    def test_nested_objects_sorted(self):
        obj = {"outer": {"b": 2, "a": 1}}
        result = canonical_json(obj)
        assert result == b'{"outer":{"a":1,"b":2}}'


class TestSignArtifact:
    def test_returns_base64_string(self, keys_dir, sample_artifact):
        sig = sign_artifact(sample_artifact, "validator_signer", keys_dir)
        assert isinstance(sig, str)
        # Valid base64
        import base64
        base64.b64decode(sig)

    def test_strips_existing_signature(self, keys_dir, sample_artifact):
        sample_artifact["signature"] = {"old": "data"}
        sig = sign_artifact(sample_artifact, "validator_signer", keys_dir)
        assert isinstance(sig, str)

    def test_missing_key_raises(self, tmp_path, sample_artifact):
        with pytest.raises(FileNotFoundError):
            sign_artifact(sample_artifact, "nonexistent", tmp_path)


class TestVerifySignature:
    def test_valid_signature(self, keys_dir, sample_artifact):
        sig = sign_artifact(sample_artifact, "validator_signer", keys_dir)
        assert verify_signature(sample_artifact, sig, "validator_signer", keys_dir)

    def test_tampered_artifact_rejected(self, keys_dir, sample_artifact):
        sig = sign_artifact(sample_artifact, "validator_signer", keys_dir)
        tampered = copy.deepcopy(sample_artifact)
        tampered["intent"] = "Malicious intent"
        assert not verify_signature(tampered, sig, "validator_signer", keys_dir)

    def test_wrong_role_rejected(self, keys_dir, sample_artifact):
        sig = sign_artifact(sample_artifact, "validator_signer", keys_dir)
        assert not verify_signature(
            sample_artifact, sig, "compiler_signer", keys_dir
        )

    def test_missing_key_raises(self, tmp_path, sample_artifact):
        with pytest.raises(FileNotFoundError):
            verify_signature(sample_artifact, "dummysig", "nonexistent", tmp_path)


class TestSignAndAttach:
    def test_attaches_signature_block(self, keys_dir, sample_artifact):
        signed = sign_and_attach(sample_artifact, "validator_signer", keys_dir)
        assert "signature" in signed
        sig = signed["signature"]
        assert sig["algorithm"] == "ed25519"
        assert sig["signer_role"] == "validator_signer"
        assert isinstance(sig["signature_value"], str)

    def test_does_not_mutate_original(self, keys_dir, sample_artifact):
        original = copy.deepcopy(sample_artifact)
        sign_and_attach(sample_artifact, "validator_signer", keys_dir)
        assert sample_artifact == original

    def test_preserves_all_fields(self, keys_dir, sample_artifact):
        signed = sign_and_attach(sample_artifact, "validator_signer", keys_dir)
        for key in sample_artifact:
            assert key in signed


class TestVerifyAttachedSignature:
    def test_valid_attached_signature(self, keys_dir, sample_artifact):
        signed = sign_and_attach(sample_artifact, "validator_signer", keys_dir)
        assert verify_attached_signature(signed, keys_dir)

    def test_tampered_attached_signature(self, keys_dir, sample_artifact):
        signed = sign_and_attach(sample_artifact, "validator_signer", keys_dir)
        signed["intent"] = "Tampered"
        assert not verify_attached_signature(signed, keys_dir)

    def test_missing_signature_block(self, keys_dir, sample_artifact):
        assert not verify_attached_signature(sample_artifact, keys_dir)

    def test_empty_signature_block(self, keys_dir, sample_artifact):
        sample_artifact["signature"] = {}
        assert not verify_attached_signature(sample_artifact, keys_dir)

    def test_missing_signer_role(self, keys_dir, sample_artifact):
        signed = sign_and_attach(sample_artifact, "validator_signer", keys_dir)
        del signed["signature"]["signer_role"]
        assert not verify_attached_signature(signed, keys_dir)

    def test_each_signer_role_works(self, keys_dir, sample_artifact):
        for role in SIGNER_ROLES:
            signed = sign_and_attach(sample_artifact, role, keys_dir)
            assert verify_attached_signature(signed, keys_dir)
