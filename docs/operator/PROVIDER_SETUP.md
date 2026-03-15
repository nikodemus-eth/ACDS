# Provider Setup

ACDS supports four provider vendors. This guide covers the configuration requirements for each.

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

## LM Studio (Local)

LM Studio provides a local OpenAI-compatible API for running models on your machine.

### Prerequisites

- Install LM Studio from [lmstudio.ai](https://lmstudio.ai)
- Download and load a model within LM Studio
- Start the local server from LM Studio's server tab

### Configuration

| Setting   | Value                          |
| --------- | ------------------------------ |
| Vendor    | `lmstudio`                     |
| Base URL  | `http://localhost:1234`        |
| Auth Type | `none`                         |
| Timeout   | `30000` ms (default)           |

### Registration via Admin UI

1. Navigate to the Providers page.
2. Click add and select vendor **LM Studio**.
3. Set the base URL to `http://localhost:1234` (the default LM Studio server port).
4. Leave auth type as **None**.
5. Save and run a connection test.

### Environment Variables

```
LMSTUDIO_BASE_URL=http://localhost:1234
LMSTUDIO_TIMEOUT_MS=30000
```

### Notes

LM Studio exposes an OpenAI-compatible API, so the LM Studio adapter uses the OpenAI chat completions format. Make sure the LM Studio local server is running before testing connectivity.

---

## Gemini (Cloud)

Google Gemini requires an API key for authentication.

### Prerequisites

- A Google Cloud account or Google AI Studio account
- A Gemini API key (generate at [aistudio.google.com](https://aistudio.google.com))

### Configuration

| Setting   | Value                                              |
| --------- | -------------------------------------------------- |
| Vendor    | `gemini`                                           |
| Base URL  | `https://generativelanguage.googleapis.com`        |
| Auth Type | `api_key`                                          |
| API Key   | Your Gemini API key (encrypted at rest)            |
| Timeout   | `30000` ms (default)                               |

### Registration via Admin UI

1. Navigate to the Providers page.
2. Click add and select vendor **Gemini**.
3. The base URL defaults to `https://generativelanguage.googleapis.com`.
4. Set auth type to **API Key** and enter your Gemini API key.
5. Save and run a connection test.

The API key is encrypted using AES-256-GCM envelope encryption before being stored. It is never exposed in API responses or logs.

### Environment Variables

```
GEMINI_BASE_URL=https://generativelanguage.googleapis.com
GEMINI_API_KEY=your-api-key-here
GEMINI_TIMEOUT_MS=30000
```

---

## OpenAI (Cloud)

OpenAI requires an API key and optionally accepts an organization ID.

### Prerequisites

- An OpenAI account with API access
- An API key (generate at [platform.openai.com](https://platform.openai.com))

### Configuration

| Setting      | Value                              |
| ------------ | ---------------------------------- |
| Vendor       | `openai`                           |
| Base URL     | `https://api.openai.com`           |
| Auth Type    | `api_key`                          |
| API Key      | Your OpenAI API key (encrypted)    |
| Organization | Optional organization ID           |
| Timeout      | `30000` ms (default)               |

### Registration via Admin UI

1. Navigate to the Providers page.
2. Click add and select vendor **OpenAI**.
3. The base URL defaults to `https://api.openai.com`.
4. Set auth type to **API Key** and enter your OpenAI API key.
5. Optionally enter your organization ID if you belong to multiple organizations.
6. Save and run a connection test.

### Environment Variables

```
OPENAI_BASE_URL=https://api.openai.com
OPENAI_API_KEY=your-api-key-here
OPENAI_ORGANIZATION=your-org-id
OPENAI_TIMEOUT_MS=30000
```

---

## General Notes

### Health Checks

All providers are subject to periodic health checks via the `ProviderHealthScheduler` (interval configured by `HEALTH_CHECK_INTERVAL_MS`, default 60 seconds). Health status is tracked as `healthy`, `degraded`, or `offline`.

### Timeout Configuration

The default timeout for all providers is 30 seconds (`DEFAULT_PROVIDER_TIMEOUT_MS`). This can be overridden per provider at registration time. For local providers, lower timeouts (10-15 seconds) may be appropriate. For cloud providers with large models, higher timeouts (60-120 seconds) may be needed.

### Multiple Instances

You can register multiple instances of the same vendor (e.g., two Ollama instances on different machines, or separate OpenAI registrations for different API keys). Each registration is a distinct provider with its own health tracking and usage audit.
