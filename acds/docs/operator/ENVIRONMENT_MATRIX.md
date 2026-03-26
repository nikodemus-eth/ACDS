# ACDS Environment Matrix

## Required for API

- `DATABASE_URL`
- `MASTER_KEY_PATH`
- `ADMIN_SESSION_SECRET`
- `PORT`

## Required for Worker

- `DATABASE_URL`
- `MASTER_KEY_PATH`

## Required for Admin

- No server-only secrets required for the static build
- API base URL/proxy configuration must point to the running API

## Required for GRITS

- `DATABASE_URL`
- `GRITS_FAST_INTERVAL_MS` or `GRITS_DAILY_INTERVAL_MS` only when running scheduled worker mode
- `GRITS_OUTPUT_PATH` optional for custom artifact location

## Optional

- `OPENAI_API_KEY`
- `GEMINI_API_KEY`
- `HEALTH_CHECK_INTERVAL_MS`
- `DEFAULT_PROVIDER_TIMEOUT_MS`
- `LOG_LEVEL`
- `LOG_FORMAT`
- `AUDIT_LOG_ENABLED`
- `WORKER_CONCURRENCY`

## Local-Only Defaults

- `NODE_ENV=development`
- `HOST=0.0.0.0`
- `PORT=3000`
- local provider URLs for Ollama and LM Studio

## Cloud-Only Values

- `OPENAI_API_KEY`
- `GEMINI_API_KEY`
- any HTTPS cloud provider base URL and organization-specific credentials
