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
                                              │
                                    ┌─────────▼─────────┐
                                    │ Apple Intelligence  │
                                    │ Bridge (:11435)     │
                                    │ ├ /execute          │
                                    │ └ /translation/     │
                                    │   languages         │
                                    └─────────────────────┘
```

## API Endpoints

### `GET /providers/:id/capabilities`

Returns the capability manifest for a provider.

**Response**: `CapabilityManifestEntry[]`

Each entry includes:
- `capabilityId` — Unique identifier (e.g., `text.generate`, `apple.tts.speak`)
- `label` — Human-readable name
- `description` — What the capability does
- `category` — Grouping: text, speech, sound, translation
- `inputMode` — UI input type: `text_prompt`, `tts_prompt`, `audio_input`, `image_upload`, `long_text`, `translation_input`, `structured_options`
- `outputMode` — UI output type: `text`, `audio`, `json`, `error`
- `available` — Whether the capability is currently available

### `POST /providers/:id/capabilities/:capabilityId/test`

Executes a capability test.

**Request body**: `{ input: Record<string, unknown>, settings?: Record<string, unknown> }`

Input fields vary by mode:
- Text modes: `{ text, prompt, temperature }`
- Audio modes: `{ file }` (base64 data URI from file upload or MediaRecorder)
- Translation mode: `{ text, targetLanguage, sourceLanguage }`
- Image upload: `{ file }` (base64 data URI)

**Response**: `CapabilityTestResponse` with `success`, `durationMs`, `output`, `rawResponse`, and optional `error`.

### `GET /providers/translation/languages`

Proxies to the Apple Intelligence bridge's `/translation/languages` endpoint.

**Response**: `TranslationLanguage[]` — each entry has `code`, `name`, `installed` (boolean).

Languages are sorted: installed first, then alphabetical. The bridge queries the real `Translation` framework to determine installation status by probing `TranslationSession` for each supported language.

## Provider Capabilities

### Standard Providers (Ollama, OpenAI, LM Studio, Gemini)

Single capability: `text.generate` (text prompt → text output).

### Apple Intelligence

Capabilities across 7 active subsystems (image_creator disabled due to Apple's `backgroundCreationForbidden` restriction):

| Subsystem | Methods | Input Mode | Output Mode | Backend |
|-----------|---------|------------|-------------|---------|
| foundation_models | generate, generate_with_context, summarize | text_prompt | text | FoundationModels framework |
| writing_tools | proofread, rewrite, smart_reply, compose | long_text | text | FoundationModels framework |
| tts | speak, render_audio, list_voices | tts_prompt | audio | AVSpeechSynthesizer |
| speech | transcribe_file, transcribe_longform, transcribe_live, dictation_fallback | audio_input | text | SFSpeechRecognizer (file), FM fallback (live/dictation) |
| vision | recognize_objects, detect_faces, analyze_scene, read_text | image_upload | json | Vision framework |
| translation | translate_text, detect_language, translate_batch | translation_input | text | Translation framework → FM fallback |
| sound | classify_sound, detect_environment | audio_input | json | SoundAnalysis framework |
| ~~image_creator~~ | ~~generate, edit, describe~~ | — | — | **Disabled**: backgroundCreationForbidden |

### Translation Language Management

The translation subsystem integrates with Apple's `Translation` framework:

1. **Language detection**: `GET /providers/translation/languages` queries `LanguageAvailability` for all supported languages, then probes each with `TranslationSession(installedSource:target:)` to determine installation status
2. **Real translation**: When language packs are installed, uses `TranslationSession.translate()` for real on-device translation
3. **FM fallback**: When packs aren't installed, falls back to Foundation Models with a translation system prompt
4. **UI**: From/To dropdowns populated with installed languages, auto-detect source option, expandable list of downloadable packs with Apple Support link

## Frontend Components

- **CapabilityTabs**: Tab navigation grouped by category (text, speech, image, translation, sound). Only `available: true` capabilities show as active tabs.
- **InputRenderer**: Mode-specific input controls:
  - `text_prompt` / `long_text`: Textarea with temperature slider
  - `tts_prompt`: Textarea for speech text
  - `audio_input`: Record button (MediaRecorder) or file upload, no temperature slider
  - `image_upload`: File upload with image preview, no temperature slider
  - `translation_input`: From/To language dropdowns + textarea, installed language detection
  - `structured_options`: JSON editor
- **OutputRenderer**: Mode-specific output display (formatted text, audio player, JSON tree, error panel)
- **ExecutionMetadata**: Timestamp, duration, provider ID, capability ID, success/failure badge
- **RawResponseViewer**: Collapsible JSON display of the raw provider response
