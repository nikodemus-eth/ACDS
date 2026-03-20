# Provider Setup

ACDS supports two provider vendors: Ollama (local open-source models) and Apple Intelligence (on-device Foundation Models). This guide covers the configuration requirements for each.

## Ollama (Local)

Ollama runs AI models locally on your machine. No API key is required.

### Prerequisites

- Install Ollama from [ollama.ai](https://ollama.ai)
- Pull at least one model: `ollama pull llama3`

### Configuration

| Setting   | Value                          |
| --------- | ------------------------------ |
| Vendor    | `ollama`                       |
| Base URL  | `http://localhost:11434`       |
| Auth Type | `none`                         |
| Timeout   | `30000` ms (default)           |

### Registration via Admin UI

1. Navigate to the Providers page.
2. Click add and select vendor **Ollama**.
3. Set the base URL to `http://localhost:11434` (the default Ollama port).
4. Leave auth type as **None**.
5. Save and run a connection test to verify.

### Environment Variables

If configuring via `.env` rather than the UI:

```
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_TIMEOUT_MS=30000
```

### Verification

After registering, the health check scheduler will periodically verify connectivity. You can also trigger a manual connection test from the provider detail page. A successful test confirms that the Ollama API is reachable and at least one model is available.

---

## Apple Intelligence (Local, On-Device)

Apple Intelligence uses Apple's Foundation Models framework to run language models directly on Apple Silicon. No API keys, no cloud, no downloads — the models ship with macOS 26+.

### Prerequisites

- macOS 26 (Tahoe) or later on Apple Silicon (M1/M2/M3/M4)
- Apple Intelligence Bridge running (Swift server at `http://localhost:11435`)

### Configuration

| Setting   | Value                          |
| --------- | ------------------------------ |
| Vendor    | `apple`                        |
| Base URL  | `http://localhost:11435`       |
| Auth Type | `none`                         |
| Timeout   | `30000` ms (default)           |

### Starting the Bridge

```bash
swift run --package-path apps/apple-intelligence-bridge
```

Or via the launch configuration:
```bash
# Uses .claude/launch.json "Apple Intelligence Bridge" config
```

### Registration via Admin UI

1. Navigate to the Providers page.
2. Click add and select vendor **Apple**.
3. Set the base URL to `http://localhost:11435` (the default bridge port).
4. Leave auth type as **None**.
5. Save and run a connection test.

### Capabilities

Apple Intelligence supports 7 capability categories through the bridge:
- **Text**: Summarization, extraction, classification
- **Translation**: Multi-language translation
- **Speech**: Speech-to-text transcription
- **Sound**: Audio event classification
- **Image**: Describe, tag, and segment images
- **Vision**: Visual reasoning and analysis
- **Writing Tools**: Rewrite, proofread, and transform text

### Notes

- All inference runs on-device — zero cost, zero data exposure
- Context window is limited to 4096 tokens (smaller than cloud models)
- Best suited for low-to-medium complexity tasks where privacy matters
- Falls back to Ollama automatically when Apple Intelligence is unavailable

---

## General Notes

### URL Validation Rules

Provider registration now enforces endpoint safety rules:

- Local providers may use loopback or private-network hosts
- Cloud providers must use `https://`
- Cloud providers cannot use loopback, link-local, metadata, or RFC1918/private-network hosts
- URLs with embedded credentials are rejected
- Only `http://` and `https://` are accepted schemes

### Health Checks

All providers are subject to periodic health checks via the `ProviderHealthScheduler` (interval configured by `HEALTH_CHECK_INTERVAL_MS`, default 60 seconds). Health status is tracked as `healthy`, `degraded`, or `offline`.

### Timeout Configuration

The default timeout for all providers is 30 seconds (`DEFAULT_PROVIDER_TIMEOUT_MS`). This can be overridden per provider at registration time. For local providers, lower timeouts (10-15 seconds) may be appropriate. For cloud providers with large models, higher timeouts (60-120 seconds) may be needed.

### Multiple Instances

You can register multiple instances of the same vendor (e.g., two Ollama instances on different machines). Each registration is a distinct provider with its own health tracking and usage audit.
