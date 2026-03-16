# Apple Intelligence Integration

## What Apple Intelligence Is

Apple Intelligence is Apple's on-device AI framework, introduced with macOS 26 and iOS 26 (WWDC 2025). It provides local inference through the Foundation Models framework — a Swift-native API that runs language models directly on Apple Silicon without sending data to external servers.

Key characteristics:
- **On-device only**: All inference runs locally on Apple Silicon (M-series chips)
- **No cloud dependency**: Models are bundled with the OS, no API keys or external endpoints
- **Privacy by design**: User data never leaves the device
- **System-level integration**: Available to all apps through Foundation Models framework

## Why It Matters to ACDS

ACDS routes cognitive work to the best available provider based on task requirements, cost, latency, and privacy constraints. Apple Intelligence adds a new category of provider:

1. **Zero-cost inference**: No API fees, no token billing
2. **Minimal latency**: No network round-trip, just local compute
3. **Maximum privacy**: For privacy-sensitive tasks (medical, financial, personal), on-device inference eliminates data exposure entirely
4. **Availability**: Present on every modern Mac — no setup, no Docker, no model downloads

This makes Apple Intelligence the ideal default for low-to-medium complexity tasks on macOS workstations, complementing Ollama/LMStudio for custom models and cloud providers for frontier capabilities.

## Bridge Architecture

Apple's Foundation Models framework is Swift-native and cannot be called directly from TypeScript/Node.js. The integration uses a **bridge pattern**:

```
ACDS (TypeScript)  →  HTTP (localhost:11435)  →  Apple Intelligence Bridge (Swift)  →  Foundation Models
```

The bridge is a lightweight Swift HTTP server that:
- Binds exclusively to `127.0.0.1:11435` (loopback only)
- Exposes three endpoints: `/health`, `/capabilities`, `/execute`
- Translates ACDS adapter requests into Foundation Models API calls
- Returns structured responses matching the ACDS `AdapterResponse` contract

This is the same pattern used by Ollama (`localhost:11434`) and LMStudio (`localhost:1234`) — ACDS already knows how to talk to local services over HTTP.

## Security Model

- **Loopback binding**: The bridge never binds to `0.0.0.0` — it's unreachable from the network
- **No authentication needed**: Local-only traffic on a single machine
- **No API keys**: Apple Intelligence has no key management — `AuthType.NONE`
- **LOCAL_VENDORS enforcement**: `ProviderValidationService` enforces that Apple providers can only use loopback/private-network hostnames
- **GRITS monitoring**: Six invariants (AI-001 through AI-006) continuously verify Apple-specific constraints

## GRITS Invariants

| ID | Description | Cadence |
|----|-------------|---------|
| AI-001 | Apple bridge must respond on localhost only | fast, daily, release |
| AI-002 | Apple capabilities must be re-validated after OS update | fast, daily, release |
| AI-003 | Apple adapter must reject non-loopback baseUrl | fast, daily, release |
| AI-004 | Apple execution must enforce macOS-only platform constraint | fast, daily, release |
| AI-005 | Apple model tokens must stay within Foundation Models limits | fast, daily, release |
| AI-006 | Apple bridge health must be checked before dispatch | fast, daily, release |

## Provider Adapter

The `AppleIntelligenceAdapter` in `packages/provider-adapters/src/apple/` follows the standard adapter pattern:

- **Config**: `baseUrl` (default `http://localhost:11435`), `timeout`
- **Validation**: Requires loopback address — rejects any non-loopback baseUrl
- **Connection test**: `GET /health` to verify bridge is running
- **Execution**: `POST /execute` with prompt, model, and parameters

## Model Profiles

Three seed profiles are provided:

| Profile | Model | Task Types | Grade | Use Case |
|---------|-------|-----------|-------|----------|
| `apple_local_fast` | apple-fm-fast | classification, extraction, summarization | BASIC | Quick classification and extraction |
| `apple_local_structured` | apple-fm-structured | extraction, decision_support, generation | STANDARD | Structured output tasks |
| `apple_local_reasoning_lite` | apple-fm-reasoning | decision_support, summarization, generation | ENHANCED | Lightweight reasoning |

All profiles are `localOnly: true, cloudAllowed: false` with zero cost.

## Admin UI Dashboard

The admin web includes a dedicated Apple Intelligence page at `/apple-intelligence` with three panels:

- **Bridge Health Panel** -- Shows bridge status, platform, and version via `GET /health`. Auto-refreshes every 30 seconds.
- **Capabilities Panel** -- Displays available models, supported task types, max tokens, and platform via `GET /capabilities`.
- **Test Execution Panel** -- Interactive form to send a prompt to the bridge and see the response, token counts, and duration.

The dashboard talks directly to `localhost:11435` (bypassing the ACDS API) since the bridge is always local. No mock routing is needed.

## Foundation Models Status

The bridge runs on macOS 26 (Tahoe) and uses the real Foundation Models framework. The `FoundationModelsWrapper.swift` calls `LanguageModelSession` for inference with `apple-fm-on-device` as the primary model. Responses include actual inference latency, token counts, and model capabilities reported by the OS.
