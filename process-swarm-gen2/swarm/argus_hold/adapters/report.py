class ReportAdapter:
    """Renders markdown reports to the workspace."""

    def execute_command(self, envelope, workspace_root, prior_results) -> dict:
        params = envelope.parameters
        content = params["content"]
        output_path = (workspace_root / params["output_path"]).resolve()
        output_path.parent.mkdir(parents=True, exist_ok=True)

        # Prepend title if provided
        title = params.get("title")
        if title:
            content = f"# {title}\n\n{content}"

        output_path.write_text(content, encoding="utf-8")
        return {"path": str(output_path), "char_count": len(content)}
