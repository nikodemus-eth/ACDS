# Apple Intelligence Bridge

Local macOS service that bridges ACDS dispatch requests to Apple's Foundation Models framework for on-device AI inference.

## Architecture

The bridge runs as a lightweight HTTP server on `localhost:11435`, exposing three endpoints:

- **GET /health** — Returns bridge health status and platform info
- **GET /capabilities** — Lists available models and supported task types
- **POST /execute** — Accepts a prompt request and returns generated text

All traffic is strictly loopback — the server binds to `127.0.0.1` and never accepts external connections.

## Requirements

- macOS 15+ (for Swift 6.1 runtime)
- macOS 26+ (for Foundation Models framework — currently stubbed)
- Xcode 26+ or Swift 6.1+ toolchain

## Build & Run

```bash
cd apps/apple-intelligence-bridge
swift build
swift run
```

The bridge will start listening on `http://localhost:11435`.

## Testing Connectivity

```bash
# Health check
curl http://localhost:11435/health

# Query capabilities
curl http://localhost:11435/capabilities

# Execute a prompt
curl -X POST http://localhost:11435/execute \
  -H "Content-Type: application/json" \
  -d '{"model":"apple-fm-fast","prompt":"Hello, world!"}'
```

## Foundation Models Integration

The `FoundationModelsWrapper.swift` file contains TODO stubs that should be replaced with actual Foundation Models API calls when building on macOS 26+. The stub implementation returns mock responses for development and testing.

When Foundation Models becomes available:
1. Uncomment the `@available(macOS 26.0, *)` blocks in `FoundationModelsWrapper.swift`
2. Replace stub responses with actual `LanguageModelSession` calls
3. Update `queryCapabilities()` to reflect actual device capabilities

## Security Model

- **Loopback only**: Server binds to `127.0.0.1`, never `0.0.0.0`
- **No authentication**: On-device only, no external access
- **No data persistence**: Requests are processed and discarded
- **GRITS monitored**: Invariants AI-001 through AI-006 verify bridge constraints
