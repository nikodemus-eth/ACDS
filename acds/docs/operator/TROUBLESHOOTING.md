# Troubleshooting

This guide covers common operational issues and how to diagnose them.

## Install and Workspace Linking Failures

### Symptoms

- `pnpm install` finishes with unresolved internal workspace packages
- package-local scripts fail to find `@acds/*` dependencies
- `pnpm run verify:install` fails before typecheck

### Requirements

- Node `>=20.0.0`
- `pnpm >=9.0.0`
- Recommended activation path:
  - `corepack enable`
  - `corepack prepare pnpm@9.15.0 --activate`

`npm install` is not a supported alternative for this repository.

### Resolution

From the `acds/` workspace root:

```bash
rm -rf node_modules apps/*/node_modules packages/*/node_modules tests/node_modules infra/db/node_modules
pnpm install
pnpm run verify:install
```

Expected success signals:

- `verify:install` resolves internal package manifests for the API, worker, GRITS worker, and tests workspace
- workspace `typecheck` completes without missing-module errors

If `verify:install` still fails, inspect the package called out in the output and confirm its `node_modules/@acds/*` links exist under the affected workspace package.

## Provider Connection Failures

### Symptoms

- Provider shows status `offline` in the admin UI
- Connection test fails from the provider detail page
- Health check events in the audit log show connection errors

### Diagnosis

**Local providers (Ollama, LM Studio):**

1. Verify the provider process is running:
   - Ollama: Check that `ollama serve` is active, or that the Ollama desktop app is running.
   - LM Studio: Check that the local server is started from the LM Studio server tab.
2. Verify the port is accessible:
   - Ollama default: `http://localhost:11434`
   - LM Studio default: `http://localhost:1234`
3. Check that at least one model is loaded in the provider.
4. If running in Docker, ensure the container can reach the host network (use `host.docker.internal` instead of `localhost`).

**Cloud providers (Gemini, OpenAI):**

1. Verify the API key is valid and has not been revoked.
2. Check for rate limiting or quota exhaustion on the provider's dashboard.
3. Verify network connectivity to the provider's API endpoint.
4. Check that the base URL is correct:
   - Gemini: `https://generativelanguage.googleapis.com`
   - OpenAI: `https://api.openai.com`

### Resolution

- Re-register the provider with correct settings.
- For API key issues, update the key via the provider form (the old key will be re-encrypted).
- Trigger a manual connection test after making changes.

### Registration Validation Rules

Provider registration is now stricter than simple URL parsing:

- Cloud providers must use `https://`
- Cloud providers cannot target loopback, link-local, or RFC1918/private-network hosts
- Embedded credentials in provider URLs are rejected
- Non-HTTP schemes such as `file://` and `ftp://` are rejected
- Excessively long provider URLs are rejected

---

## Fallback Behavior

### Symptoms

- Executions complete successfully but use a different provider than expected
- Execution detail page shows fallback attempts
- Audit events show `execution.fallback_triggered`

### Diagnosis

1. Check the execution detail page to see:
   - Which provider was originally selected
   - What error caused the fallback
   - Which fallback provider handled the request
2. Review the routing decision's fallback chain to understand the fallback order.
3. Check the health status of the primary provider -- it may have gone offline or degraded between the routing decision and execution.

### When Fallback Is Expected

Fallback is a normal and healthy mechanism. It occurs when:

- The primary provider is temporarily unavailable
- The primary provider returns a transient error
- The primary provider times out

The primary run path now performs fallback directly. A failed first attempt should no longer terminate execution immediately when valid fallback candidates exist.

### When Fallback Indicates a Problem

Investigate further if:

- The same provider consistently triggers fallback (check health history)
- All providers in the fallback chain fail (the execution will be marked `failed`)
- Fallback is occurring on every request (the primary provider may need re-configuration or the health check interval may be too long to catch outages quickly)

---

## Unexpected Routing Outcomes

### Symptoms

- Requests are routed to unexpected providers or model profiles
- Local requests go to cloud providers (or vice versa)
- A specific model profile is never selected despite being available

### Diagnosis

1. **Check the rationale.** Every routing decision includes a `rationaleSummary`. Find the execution in the admin UI and read why the routing engine chose what it chose.

2. **Check the effective policy.** The cascade of global, application, and process policies may produce unexpected results:
   - A global `blockedVendors` list may be preventing a vendor from being eligible.
   - An application policy `privacyOverride` may be forcing local-only when cloud is needed.
   - A process policy `blockedModelProfileIds` may be excluding the expected profile.

3. **Check profile eligibility.** The routing audit event shows which profiles were eligible. If the expected profile is missing from the eligible set, the policy is filtering it out.

4. **Check the conflict detector.** Navigate to the Policies page and look for detected conflicts. A process policy that contradicts a global policy will cause the conflict detector to flag it.

### Resolution

- Adjust the policy at the appropriate level (global, application, or process).
- If a profile should be eligible, verify it meets the constraints (cognitive grade, task type, vendor, privacy).
- Use the rationale to understand the exact decision path and which constraint eliminated the expected choice.

---

## Common Errors

### "Key length mismatch: expected 32 bytes"

The master encryption key does not match the expected length for AES-256-GCM. Ensure:
- `FileKeyResolver`: The key file contains exactly 32 bytes.
- `EnvironmentKeyResolver`: The `MASTER_KEY` environment variable contains exactly 64 hex characters (which decode to 32 bytes).

### "Environment variable MASTER_KEY is not set"

The `EnvironmentKeyResolver` cannot find the master key. Set the `MASTER_KEY` environment variable or switch to `FileKeyResolver` by setting `MASTER_KEY_PATH`.

### "Unknown key ID"

An encrypted envelope references a key ID that the key resolver does not recognize. This typically happens after key rotation if the old key was removed before all envelopes were re-encrypted. Restore the old key and complete the rotation.

### "No eligible profiles found"

The routing engine could not find any model profiles that satisfy the effective policy and routing constraints. Check:
- That at least one provider is registered and healthy.
- That the global policy `allowedVendors` list includes the vendor of at least one registered provider.
- That the privacy constraint does not exclude all available providers (e.g., `local_only` when only cloud providers are registered).

### "Fallback chain exhausted"

All providers in the fallback chain failed. The execution is marked `failed`. Check:
- The health status of all providers.
- Network connectivity to cloud providers.
- Whether local provider processes are running.
- The specific error for each fallback attempt in the execution detail.

### "ACDS API DI container is incomplete"

The API startup path now validates that all required services are wired before the server starts.

Check:
- Your `buildApp()` call supplies a populated `diContainer`
- The container includes dispatch, provider, execution, audit, adaptation, and rollback services
- Startup wiring was updated after any route/controller changes

### Database Connection Errors

If the API server or worker cannot connect to PostgreSQL:
- Verify `DATABASE_URL` is set correctly in `.env`.
- Check that PostgreSQL is running and accessible.
- Verify that database migrations have been run: `pnpm --filter ./infra/db run migrate`.

### Admin Session Expired

If you are redirected to login or receive 401 errors in the admin UI:
- Sessions expire after `ADMIN_SESSION_TTL_HOURS` (default: 8 hours).
- Log in again.
- If sessions are expiring too quickly, increase `ADMIN_SESSION_TTL_HOURS` in `.env`.
