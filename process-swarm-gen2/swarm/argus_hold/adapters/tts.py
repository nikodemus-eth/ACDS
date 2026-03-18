class TtsAdapter:
    """Stub TTS adapter — records intent without executing synthesis."""

    def execute_command(self, envelope, workspace_root, prior_results) -> dict:
        params = envelope.parameters
        return {
            "implemented": False,
            "text_length": len(params.get("text", "")),
            "voice_profile": params.get("voice_profile", "default"),
            "format": params.get("format", "mp3"),
            "output_path": params.get("output_path", ""),
            "message": "TTS synthesis not available in current environment",
        }
