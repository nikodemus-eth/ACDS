# ACDS MVP Boundary

## Supported Now

- PostgreSQL-backed API, admin UI, worker services, and persistence packages
- Policy resolution, routing, execution orchestration, audit persistence, and provider registration
- Local-first providers: Ollama and LM Studio
- GRITS as a DB-backed integrity and release validation tool
- Process Swarm as a documented integration example

## Experimental

- Cloud-provider execution through OpenAI and Gemini
- Apple Intelligence bridge integration
- Automatic adaptation behaviors beyond operator-reviewed or tightly controlled policies

## Observe-Only

- Adaptive optimization should be treated as observe-first for MVP rollouts
- GRITS can inspect approvals, rollbacks, and optimizer state even where operators choose not to enable active adaptation

## Out of Scope for v0.1.0

- Multi-region or hosted SaaS deployment posture
- Compatibility guarantees across arbitrary schema forks
- Fully managed cloud-provider operations
- Process Swarm as a separately supported product surface

## Provider Boundary

- Supported: Ollama, LM Studio
- Experimental: OpenAI, Gemini, Apple Intelligence
- Unsupported unless implemented locally: any other provider or custom adapter
