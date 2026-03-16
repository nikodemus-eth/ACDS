"""Tests for Ed25519 key generation, storage, and loading."""

from __future__ import annotations

import os

import pytest
from nacl.signing import SigningKey, VerifyKey

from runtime.identity.key_manager import (
    SIGNER_ROLES,
    fingerprint,
    generate_keypair,
    load_signing_key,
    load_verify_key,
    load_verify_key_from_registry,
    save_keypair,
)


class TestGenerateKeypair:
    def test_returns_signing_and_verify_key(self):
        sk, vk = generate_keypair()
        assert isinstance(sk, SigningKey)
        assert isinstance(vk, VerifyKey)

    def test_keypairs_are_unique(self):
        sk1, _ = generate_keypair()
        sk2, _ = generate_keypair()
        assert sk1.encode() != sk2.encode()

    def test_verify_key_matches_signing_key(self):
        sk, vk = generate_keypair()
        assert sk.verify_key.encode() == vk.encode()


class TestFingerprint:
    def test_returns_32_hex_chars(self):
        _, vk = generate_keypair()
        fp = fingerprint(vk.encode())
        assert len(fp) == 32
        assert all(c in "0123456789abcdef" for c in fp)

    def test_deterministic(self):
        _, vk = generate_keypair()
        pub_bytes = vk.encode()
        assert fingerprint(pub_bytes) == fingerprint(pub_bytes)

    def test_different_keys_different_fingerprints(self):
        _, vk1 = generate_keypair()
        _, vk2 = generate_keypair()
        assert fingerprint(vk1.encode()) != fingerprint(vk2.encode())


class TestSaveAndLoadKeypair:
    def test_save_creates_files(self, tmp_path):
        sk, _ = generate_keypair()
        keys_dir = tmp_path / "keys"
        save_keypair("test_signer", sk, keys_dir)
        assert (keys_dir / "test_signer.key").exists()
        assert (keys_dir / "test_signer.pub").exists()

    def test_private_key_permissions(self, tmp_path):
        sk, _ = generate_keypair()
        keys_dir = tmp_path / "keys"
        save_keypair("test_signer", sk, keys_dir)
        mode = os.stat(keys_dir / "test_signer.key").st_mode & 0o777
        assert mode == 0o600

    def test_save_returns_metadata(self, tmp_path):
        sk, _ = generate_keypair()
        keys_dir = tmp_path / "keys"
        meta = save_keypair("validator_signer", sk, keys_dir)
        assert meta["role"] == "validator_signer"
        assert meta["key_id"] == "validator-signer-001"
        assert meta["algorithm"] == "ed25519"
        assert meta["status"] == "active"
        assert len(meta["fingerprint"]) == 32

    def test_roundtrip_signing_key(self, tmp_path):
        sk, _ = generate_keypair()
        keys_dir = tmp_path / "keys"
        save_keypair("test_signer", sk, keys_dir)
        loaded = load_signing_key("test_signer", keys_dir)
        assert loaded.encode() == sk.encode()

    def test_roundtrip_verify_key(self, tmp_path):
        sk, vk = generate_keypair()
        keys_dir = tmp_path / "keys"
        save_keypair("test_signer", sk, keys_dir)
        loaded = load_verify_key("test_signer", keys_dir)
        assert loaded.encode() == vk.encode()

    def test_load_missing_signing_key_raises(self, tmp_path):
        with pytest.raises(FileNotFoundError):
            load_signing_key("nonexistent", tmp_path)

    def test_load_missing_verify_key_raises(self, tmp_path):
        with pytest.raises(FileNotFoundError):
            load_verify_key("nonexistent", tmp_path)


class TestLoadFromRegistry:
    def test_loads_active_key(self, tmp_path):
        sk, vk = generate_keypair()
        keys_dir = tmp_path / "keys"
        meta = save_keypair("validator_signer", sk, keys_dir)
        registry = {"active_keys": [meta]}
        loaded = load_verify_key_from_registry("validator_signer", registry, keys_dir)
        assert loaded.encode() == vk.encode()

    def test_rejects_revoked_key(self, tmp_path):
        sk, _ = generate_keypair()
        keys_dir = tmp_path / "keys"
        meta = save_keypair("validator_signer", sk, keys_dir)
        meta["status"] = "revoked"
        registry = {"active_keys": [meta]}
        with pytest.raises(ValueError, match="No active key"):
            load_verify_key_from_registry("validator_signer", registry, keys_dir)

    def test_rejects_missing_role(self, tmp_path):
        registry = {"active_keys": []}
        with pytest.raises(ValueError, match="No active key"):
            load_verify_key_from_registry("validator_signer", registry, tmp_path)


class TestSignerRoles:
    def test_five_roles_defined(self):
        assert len(SIGNER_ROLES) == 5

    def test_expected_roles(self):
        expected = {
            "validator_signer",
            "compiler_signer",
            "approval_signer",
            "node_attestation_signer",
            "lease_issuer_signer",
        }
        assert set(SIGNER_ROLES) == expected
