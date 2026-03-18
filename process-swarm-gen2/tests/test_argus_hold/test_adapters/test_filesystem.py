"""Tests for swarm.argus_hold.adapters.filesystem — FilesystemAdapter."""

from __future__ import annotations

from pathlib import Path

import pytest

from swarm.argus_hold.adapters.filesystem import FilesystemAdapter
from swarm.argus_hold.errors import ExecutionError
from swarm.argus_hold.models import (
    CommandEnvelope,
    SideEffectLevel,
    new_id,
    now_utc,
)


def _make_envelope(
    command_name: str,
    params: dict,
    level: SideEffectLevel = SideEffectLevel.READ_ONLY,
) -> CommandEnvelope:
    return CommandEnvelope(
        envelope_id=new_id("env"),
        command_name=command_name,
        version="v1",
        parameters=params,
        side_effect_level=level,
        run_id="run-1",
        swarm_id="swarm-1",
        created_at=now_utc(),
    )


class TestFilesystemReadFile:
    """Tests for filesystem.read_file."""

    def test_read_existing_file(self, workspace):
        (workspace / "hello.txt").write_text("Hello, world!")
        adapter = FilesystemAdapter()
        env = _make_envelope("filesystem.read_file", {"path": "hello.txt"})
        result = adapter.execute_command(env, workspace, {})
        assert result["content"] == "Hello, world!"
        assert result["size_bytes"] == len("Hello, world!".encode())

    def test_read_file_path_in_result(self, workspace):
        (workspace / "a.txt").write_text("abc")
        adapter = FilesystemAdapter()
        env = _make_envelope("filesystem.read_file", {"path": "a.txt"})
        result = adapter.execute_command(env, workspace, {})
        assert "a.txt" in result["path"]

    def test_read_file_with_encoding(self, workspace):
        (workspace / "latin.txt").write_bytes("caf\xe9".encode("latin-1"))
        adapter = FilesystemAdapter()
        env = _make_envelope("filesystem.read_file", {"path": "latin.txt", "encoding": "latin-1"})
        result = adapter.execute_command(env, workspace, {})
        assert result["content"] == "caf\xe9"

    def test_read_file_with_max_bytes(self, workspace):
        (workspace / "big.txt").write_text("A" * 1000)
        adapter = FilesystemAdapter()
        env = _make_envelope("filesystem.read_file", {"path": "big.txt", "max_bytes": 100})
        result = adapter.execute_command(env, workspace, {})
        assert len(result["content"]) <= 100

    def test_read_nonexistent_raises(self, workspace):
        adapter = FilesystemAdapter()
        env = _make_envelope("filesystem.read_file", {"path": "missing.txt"})
        with pytest.raises(Exception):
            adapter.execute_command(env, workspace, {})


class TestFilesystemWriteFile:
    """Tests for filesystem.write_file."""

    def test_write_new_file(self, workspace):
        adapter = FilesystemAdapter()
        env = _make_envelope(
            "filesystem.write_file",
            {"path": "out.txt", "content": "Hello!"},
            level=SideEffectLevel.LOCAL_MUTATION,
        )
        result = adapter.execute_command(env, workspace, {})
        assert (workspace / "out.txt").read_text() == "Hello!"
        assert result["bytes_written"] == len("Hello!".encode())

    def test_write_creates_parent_dirs(self, workspace):
        adapter = FilesystemAdapter()
        env = _make_envelope(
            "filesystem.write_file",
            {"path": "sub/dir/file.txt", "content": "nested"},
            level=SideEffectLevel.LOCAL_MUTATION,
        )
        result = adapter.execute_command(env, workspace, {})
        assert (workspace / "sub" / "dir" / "file.txt").read_text() == "nested"

    def test_write_existing_without_overwrite_raises(self, workspace):
        (workspace / "exists.txt").write_text("old")
        adapter = FilesystemAdapter()
        env = _make_envelope(
            "filesystem.write_file",
            {"path": "exists.txt", "content": "new"},
            level=SideEffectLevel.LOCAL_MUTATION,
        )
        with pytest.raises(ExecutionError, match="overwrite"):
            adapter.execute_command(env, workspace, {})

    def test_write_existing_with_overwrite(self, workspace):
        (workspace / "exists.txt").write_text("old")
        adapter = FilesystemAdapter()
        env = _make_envelope(
            "filesystem.write_file",
            {"path": "exists.txt", "content": "new", "overwrite": True},
            level=SideEffectLevel.LOCAL_MUTATION,
        )
        result = adapter.execute_command(env, workspace, {})
        assert (workspace / "exists.txt").read_text() == "new"


class TestFilesystemListDir:
    """Tests for filesystem.list_dir."""

    def test_list_dir_entries(self, workspace):
        (workspace / "a.txt").write_text("a")
        (workspace / "b.txt").write_text("b")
        adapter = FilesystemAdapter()
        env = _make_envelope("filesystem.list_dir", {"path": "."})
        result = adapter.execute_command(env, workspace, {})
        assert "a.txt" in result["entries"]
        assert "b.txt" in result["entries"]
        assert result["count"] == 2

    def test_list_dir_recursive(self, workspace):
        (workspace / "sub").mkdir()
        (workspace / "sub" / "nested.txt").write_text("x")
        (workspace / "top.txt").write_text("y")
        adapter = FilesystemAdapter()
        env = _make_envelope("filesystem.list_dir", {"path": ".", "recursive": True})
        result = adapter.execute_command(env, workspace, {})
        assert result["count"] >= 2

    def test_list_dir_max_entries(self, workspace):
        for i in range(10):
            (workspace / f"file_{i:02d}.txt").write_text(str(i))
        adapter = FilesystemAdapter()
        env = _make_envelope("filesystem.list_dir", {"path": ".", "max_entries": 3})
        result = adapter.execute_command(env, workspace, {})
        assert result["count"] == 3
        assert result["truncated"] is True

    def test_list_dir_recursive_truncation(self, workspace):
        (workspace / "d1").mkdir()
        (workspace / "d1" / "a.txt").write_text("a")
        (workspace / "d1" / "b.txt").write_text("b")
        (workspace / "d2").mkdir()
        (workspace / "d2" / "c.txt").write_text("c")
        (workspace / "d2" / "d.txt").write_text("d")
        adapter = FilesystemAdapter()
        env = _make_envelope(
            "filesystem.list_dir",
            {"path": ".", "recursive": True, "max_entries": 2},
        )
        result = adapter.execute_command(env, workspace, {})
        assert result["truncated"] is True
        assert result["count"] == 2

    def test_list_empty_dir(self, workspace):
        empty_dir = workspace / "empty"
        empty_dir.mkdir()
        adapter = FilesystemAdapter()
        env = _make_envelope("filesystem.list_dir", {"path": "empty"})
        result = adapter.execute_command(env, workspace, {})
        assert result["count"] == 0
        assert result["entries"] == []


class TestFilesystemUnknownCommand:
    """Tests for unknown filesystem subcommand."""

    def test_unknown_command_raises(self, workspace):
        adapter = FilesystemAdapter()
        env = _make_envelope("filesystem.delete_file", {"path": "x"})
        with pytest.raises(ExecutionError, match="Unknown filesystem command"):
            adapter.execute_command(env, workspace, {})
