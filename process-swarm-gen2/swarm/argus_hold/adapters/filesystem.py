from pathlib import Path
from swarm.argus_hold.models import CommandEnvelope
from swarm.argus_hold.errors import ExecutionError

class FilesystemAdapter:
    """Executes filesystem commands within workspace scope."""

    def execute_command(self, envelope: CommandEnvelope, workspace_root: Path,
                        prior_results: dict) -> dict:
        cmd = envelope.command_name
        params = envelope.parameters

        if cmd == "filesystem.read_file":
            path = (workspace_root / params["path"]).resolve()
            encoding = params.get("encoding", "utf-8")
            max_bytes = params.get("max_bytes")
            content = path.read_text(encoding=encoding)
            if max_bytes and len(content.encode(encoding)) > max_bytes:
                content = content[:max_bytes]  # approximate truncation
            return {"content": content, "path": str(path), "size_bytes": len(content.encode(encoding))}

        elif cmd == "filesystem.write_file":
            path = (workspace_root / params["path"]).resolve()
            path.parent.mkdir(parents=True, exist_ok=True)
            content = params["content"]
            overwrite = params.get("overwrite", False)
            if path.exists() and not overwrite:
                raise ExecutionError(f"File exists and overwrite=false: {path}")
            path.write_text(content, encoding=params.get("encoding", "utf-8"))
            return {"path": str(path), "bytes_written": len(content.encode(params.get("encoding", "utf-8")))}

        elif cmd == "filesystem.list_dir":
            path = (workspace_root / params.get("path", ".")).resolve()
            recursive = params.get("recursive", False)
            max_entries = params.get("max_entries", 1000)
            entries = []
            if recursive:
                for p in sorted(path.rglob("*")):
                    entries.append(str(p.relative_to(path)))
                    if len(entries) >= max_entries:
                        break
            else:
                for p in sorted(path.iterdir()):
                    entries.append(p.name)
                    if len(entries) >= max_entries:
                        break
            return {"path": str(path), "entries": entries, "count": len(entries), "truncated": len(entries) >= max_entries}

        raise ExecutionError(f"Unknown filesystem command: {cmd}")
