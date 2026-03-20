# Capability Test Console

The Capability Test Console provides operators with a testing surface for exercising every provider capability directly from the ACDS admin web interface.

## Access

Navigate to **Providers → [Provider Name] → Test Capabilities** or directly visit `/providers/:id/test`.

## Architecture

```
Admin Web (React)                      API (Fastify)
┌────────────────────┐     HTTP     ┌──────────────────────────────┐
│ CapabilityTestPage  │────────────▶│ CapabilityTestController     │
│ ├ CapabilityTabs    │             │ ├ getManifest()              │
│ ├ InputRenderer     │             │ └ testCapability()           │
│ ├ OutputRenderer    │             │      │                       │
│ ├ ExecutionMetadata │             │      ▼                       │
│ └ RawResponseViewer │             │ CapabilityTestService        │
└────────────────────┘             │ ├ ProviderCapabilityManifest │
                                    │ │   Builder                  │
                                    │ └ ProviderExecutionProxy     │
                                    └──────────────────────────────┘
```

## API Endpoints

### `GET /providers/:id/capabilities`

Returns the capability manifest for a provider.

**Response**: `CapabilityManifestEntry[]`

Each entry includes:
- `capabilityId` — Unique identifier (e.g., `text.generate`, `apple.tts.speak`)
- `label` — Human-readable name
- `description` — What the capability does
- `category` — Grouping: text, speech, image, sound, translation
- `inputMode` — UI input type: `text_prompt`, `image_prompt`, `tts_prompt`, `audio_input`, `long_text`, `structured_options`
- `outputMode` — UI output type: `text`, `image`, `audio`, `json`, `error`
- `available` — Whether the capability is currently available

### `POST /providers/:id/capabilities/:capabilityId/test`

Executes a capability test.

**Request body**: `{ input: Record<string, unknown>, settings?: Record<string, unknown> }`

**Response**: `CapabilityTestResponse` with `success`, `durationMs`, `output`, `rawResponse`, and optional `error`.

## Provider Capabilities

### Standard Providers (Ollama, OpenAI, LM Studio, Gemini)

Single capability: `text.generate` (text prompt → text output).

### Apple Intelligence

26 capabilities across 8 subsystems:

| Subsystem | Methods | Input Mode | Output Mode |
|-----------|---------|------------|-------------|
| foundation_models | generate, generate_with_context, summarize | text_prompt | text |
| image_creator | generate, edit, describe | image_prompt | image |
| tts | speak, render_audio, list_voices | tts_prompt | audio |
| speech | transcribe_audio, transcribe_live, detect_language | audio_input | text |
| sound | classify_sound, detect_environment | audio_input | json |
| vision | recognize_objects, detect_faces, analyze_scene, read_text | image_prompt | json |
| translation | translate_text, detect_language, translate_batch | text_prompt | text |
| writing_tools | proofread, rewrite, smart_reply, compose | text_prompt | text |

## Frontend Components

- **CapabilityTabs**: Tab navigation grouped by category
- **InputRenderer**: Mode-specific input (textarea, temperature slider, file upload)
- **OutputRenderer**: Mode-specific output (text, image preview, audio player, JSON, error panel)
- **ExecutionMetadata**: Timestamp, duration, provider ID, capability ID, success/failure badge
- **RawResponseViewer**: Collapsible JSON display of the raw provider response
