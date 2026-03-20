# Troubleshooting

This guide covers common operational issues and how to diagnose them.

## Provider Connection Failures

### Symptoms

- Provider shows status `offline` in the admin UI
- Connection test fails from the provider detail page
- Health check events in the audit log show connection errors

### Diagnosis

**Ollama:**

1. Verify the provider process is running: check that `ollama serve` is active, or that the Ollama desktop app is running.
2. Verify the port is accessible: `http://localhost:11434`
3. Check that at least one model is loaded in the provider.
4. If running in Docker, ensure the container can reach the host network (use `host.docker.internal` instead of `localhost`).

**Apple Intelligence:**

1. Verify the Apple Intelligence bridge is running at `http://localhost:11435`.
2. Verify you are running macOS 15.0 (Sequoia) or later -- Apple Intelligence requires macOS 15+.
3. Check that Apple Intelligence is enabled in System Settings > Apple Intelligence & Siri.
4. Verify the Mac has an Apple Silicon chip (M1 or later) or meets the minimum hardware requirements.

### Resolution

- Re-register the provider with correct settings.
- Trigger a manual connection test after making changes.

### Registration Validation Rules

Provider registration is now stricter than simple URL parsing:

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
- Whether local provider processes are running (Ollama, Apple Intelligence bridge).
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

---

## launchd Service Issues

### API Crash-Looping (Missing Environment Variables)

**Symptoms:**
- `launchctl list | grep acds-api` shows exit code 1 or rapidly changing PIDs
- Error log (`~/Library/Logs/acds-api.error.log`) shows `Missing required environment variable: DATABASE_URL`

**Diagnosis:**
1. Check that `apps/api/.env` exists and contains `DATABASE_URL`, `MASTER_KEY_PATH`, and `ADMIN_SESSION_SECRET`.
2. Check that PostgreSQL is running: `brew services list | grep postgresql`.
3. Check that the master key file exists: `ls -la /Users/m4/.acds/master.key` (should be 32 bytes, mode 600).
4. Check that the `infra` symlink exists: `ls -la apps/api/infra` (should point to `../../infra`).

**Resolution:**
- Create the `.env` file with required variables (see `Deployment_Topology.md` for values).
- If PostgreSQL is not running: `brew services start postgresql@16`.
- If the symlink is missing: `ln -s "../../infra" "apps/api/infra"`.
- After fixing, unload and reload the agent to reset throttle state:
  ```bash
  launchctl unload ~/Library/LaunchAgents/com.m4.acds-api.plist
  launchctl load ~/Library/LaunchAgents/com.m4.acds-api.plist
  ```

### launchd Restart Throttling

**Symptoms:**
- Service shows exit code `-15` (SIGTERM) or exit code `1` despite the root cause being fixed.
- `launchctl start` does not immediately restart the process.

**Cause:** launchd throttles restarts for services that crash repeatedly. After fixing the root cause, the throttle state persists until the agent is fully unloaded.

**Resolution:**
```bash
launchctl unload ~/Library/LaunchAgents/com.m4.<service>.plist
launchctl load ~/Library/LaunchAgents/com.m4.<service>.plist
```

### Config File Not Found (ENOENT for infra/config/...)

**Symptoms:**
- API crashes with `ENOENT: no such file or directory, open '.../apps/api/infra/config/profiles/modelProfiles.json'`

**Cause:** The DI container's `loadJson()` resolves paths relative to `process.cwd()`. When launched via launchd, `WorkingDirectory` is `apps/api/`, but config files live at the repo root's `infra/config/`.

**Resolution:** Create a symlink: `ln -s "../../infra" "apps/api/infra"`

### Checking All Services

```bash
# Quick status of all ACDS + Process Swarm services
launchctl list | grep -E "m4\.|homebrew"

# Expected: all PIDs present, exit codes 0 or -
# PID present + exit 0 = running
# No PID + exit 1 = crash-looping
# No PID + exit -15 = stopped/throttled
```
