# Process Swarm Gen 2 -- Security Model

This document describes the security architecture, threat model, trust boundaries,
and defense-in-depth strategy of Process Swarm Gen 2. It is intended for operators,
auditors, and contributors who need to understand how the system enforces safety
guarantees.

---

## Table of Contents

1. [Threat Model](#threat-model)
2. [Trust Boundaries](#trust-boundaries)
3. [Security Invariants](#security-invariants)
4. [Defense-in-Depth Layers](#defense-in-depth-layers)
   - [Layer 1: Identity and Cryptographic Signing](#layer-1-identity-and-cryptographic-signing)
   - [Layer 2: Execution Gate (9-Check Trust Chain)](#layer-2-execution-gate-9-check-trust-chain)
   - [Layer 3: ToolGate (Default-Deny Capability Mediation)](#layer-3-toolgate-default-deny-capability-mediation)
   - [Layer 4: Scope Containment](#layer-4-scope-containment)
   - [Layer 5: DSL and Compiler Safety](#layer-5-dsl-and-compiler-safety)
   - [Layer 6: Governance Lifecycle](#layer-6-governance-lifecycle)
   - [Layer 7: Governance Warning Policy Engine](#layer-7-governance-warning-policy-engine)
   - [Layer 8: Delivery Security](#layer-8-delivery-security)
   - [Layer 9: ARGUS-Hold Governed Execution](#layer-9-argus_hold-governed-execution)
5. [ARGUS-9 Red Team Test Suite](#argus-9-red-team-test-suite)
6. [Key File Reference](#key-file-reference)

---

## Threat Model

Process Swarm Gen 2 operates under the assumption that **any artifact entering the
runtime pipeline may be adversarial**. The system is designed to prevent:

- **Unauthorized execution**: No behavior sequence executes without a fully verified
  trust chain (signed plan, signed validation, signed lease, capability coverage).
- **Scope escape**: Modifications must stay within declared path boundaries. Path
  traversal, absolute paths, and out-of-scope writes are rejected at multiple layers.
- **Capability escalation**: All capabilities are denied by default. Only a valid,
  time-bounded, cryptographically signed lease can enable capabilities.
- **Self-certification**: Proposals that contain language attempting to bypass
  validation or assert their own approval are detected and rejected.
- **Governance role collapse**: When a single operator occupies multiple governance
  roles (author, reviewer, publisher), the system raises reduced-assurance warnings
  that require explicit fingerprinted acknowledgment.
- **Execution authority leakage**: Non-runtime surfaces (scheduler, bridge, delivery)
  must not carry executable payloads. Authority boundary checks block fields like
  `execution_plan`, `signed_plan`, `runtime_call`, and `toolgate_call`.
- **Secondary truth claims**: The delivery layer cannot claim a final run outcome
  without authoritative runtime evidence (runtime_execution_id and artifact_refs).
- **Non-deterministic behavior**: Acceptance tests and DSL commands are screened for
  shell metacharacters, network tools, and dynamic evaluation patterns.

### Attacker Profiles

| Attacker               | Access Level                         | Goal                                             |
|------------------------|--------------------------------------|--------------------------------------------------|
| Malicious proposal     | Submits a behavior proposal          | Escape scope, execute arbitrary commands          |
| Compromised signer     | Holds one signing key                | Forge artifacts for a different role              |
| Rogue operator         | Holds a governance role              | Bypass multi-party governance separation          |
| Tampered artifact      | Modifies a signed artifact in transit| Break referential integrity or inject code        |
| Scheduler/bridge abuse | Controls scheduler or bridge input   | Inject execution authority outside the runtime    |

---

## Trust Boundaries

The system enforces four primary trust boundaries:

```
   +------------------+     +------------------+     +------------------+
   |  Definition      |     |  Runtime         |     |  Delivery        |
   |  Layer           | --> |  Pipeline        | --> |  Layer           |
   |                  |     |                  |     |                  |
   | DSL, Compiler,   |     | Validator,       |     | Engine,          |
   | Governance FSM,  |     | ExecutionGate,   |     | Adapters,        |
   | Scheduler,       |     | ToolGate,        |     | Recipient        |
   | Bridge           |     | Lease Manager,   |     | Resolution       |
   |                  |     | Signer/Identity  |     |                  |
   +------------------+     +------------------+     +------------------+
         |                        |                        |
         | Only proposals         | Only signed,           | Only runtime-
         | cross this             | validated,             | evidenced
         | boundary               | leased execution       | results cross
         |                        | crosses this           | this boundary
         |                        | boundary               |
```

1. **Definition-to-Runtime boundary**: Proposals enter the runtime pipeline and must
   pass schema validation, scope containment, side-effect declaration, determinism
   checks, and self-certification detection before receiving a signed validation
   result.

2. **Validation-to-Execution boundary**: The ExecutionGate stands between validated
   proposals and actual execution. All 9 checks must pass before execution proceeds.

3. **Runtime-to-Capability boundary**: ToolGate mediates every capability request
   at runtime. Without a bound lease, all capabilities are denied.

4. **Runtime-to-Delivery boundary**: Delivery cannot present final status without
   runtime execution evidence. Secondary truth warnings block unsupported claims.

---

## Security Invariants

The following properties are maintained at all times:

1. **No unsigned artifact crosses the execution boundary.** Plans, validation results,
   and leases must all carry valid Ed25519 signatures from their designated signer
   roles.

2. **Default-deny on all capabilities.** ToolGate denies every capability request
   unless a valid, non-expired, non-revoked lease is bound and the requested
   capability is explicitly granted.

3. **Referential integrity across the trust chain.** The proposal_id in the plan must
   match the proposal_id in the validation result. The validation_id must match. The
   lease must bind to the correct plan_id.

4. **Scope is the intersection, not the union.** Plan paths must be a subset of lease
   paths. ToolGate path checks verify that target paths fall within the lease's
   allowed scope.

5. **Expired leases auto-unbind.** When ToolGate detects an expired lease during an
   authorization check, it unbinds the lease immediately and returns to default-deny.

6. **Governance transitions are role-gated.** Each lifecycle transition requires a
   specific role (author, reviewer, publisher). The FSM rejects transitions from
   unauthorized roles.

7. **Revocation is terminal.** Once a swarm reaches the `revoked` state, no further
   transitions are possible.

8. **Dangerous patterns are blocked at multiple layers.** Shell metacharacters
   (`;`, `|`, `&`, `` ` ``, `$(`, `${`), network tools (`curl`, `wget`, `nc`), and
   dynamic evaluation (`eval`, `exec`, `python -c`, `bash -c`) are rejected by the
   DSL parser, the BSC compiler, and the proposal validator independently.

9. **Delivery is fail-closed.** Recipient profile resolution returns explicit error
   codes on any failure (not found, disabled, invalid address, limit exceeded) and
   records atomic delivery receipts.

---

## Defense-in-Depth Layers

### Layer 1: Identity and Cryptographic Signing

**Files**: `runtime/identity/key_manager.py`, `runtime/identity/signer.py`

All signing uses **Ed25519 via PyNaCl** (libsodium). Five signer roles partition
authority:

| Role                       | Purpose                                   |
|----------------------------|-------------------------------------------|
| `validator_signer`         | Signs validation results                  |
| `compiler_signer`          | Signs compiled proposals                  |
| `approval_signer`          | Signs governance approvals                |
| `node_attestation_signer`  | Signs node identity attestations          |
| `lease_issuer_signer`      | Signs capability leases and revocations   |

Key storage:

- Private keys are stored as hex-encoded 32-byte seeds with `0o600` permissions.
- Public keys are stored as hex-encoded 32-byte keys.
- Key identity is derived from SHA-256 fingerprints (first 32 hex characters).

Signing protocol:

- **Canonical JSON serialization**: Keys sorted alphabetically, no whitespace,
  ASCII-safe, UTF-8 output. This ensures signature stability across environments.
- **Signature stripping before signing**: The `signature` field is removed from
  the artifact before computing the signature, preventing signature-over-signature
  attacks.
- **Attached signature blocks**: Signatures are stored as `{"algorithm": "ed25519",
  "signer_role": "<role>", "signature_value": "<base64>"}` within the artifact.
- **Role-based verification**: `verify_attached_signature` reads the `signer_role`
  from the signature block and loads the corresponding public key for verification.

### Layer 2: Execution Gate (9-Check Trust Chain)

**File**: `runtime/gate/execution_gate.py`

The ExecutionGate is the primary safety boundary. It performs 10 sequential checks
(numbered 1-10 in the implementation; originally designed as 9 checks with the
validation status check added):

| #  | Check                    | Verifies                                                    |
|----|--------------------------|-------------------------------------------------------------|
| 1  | Plan signature           | Plan carries a valid Ed25519 signature                      |
| 2  | Validation signature     | Validation result carries a valid Ed25519 signature         |
| 3  | Referential integrity    | Plan's `proposal_id` matches validation's `proposal_id`     |
| 4  | Referential integrity    | Plan's `validation_id` matches validation's `validation_id` |
| 5  | Lease validity           | Lease is active (not expired, not revoked)                  |
| 6  | Lease-plan binding       | Lease's `execution_plan_id` matches plan's `plan_id`        |
| 7  | Capability coverage      | Every required capability is granted (not denied) by lease  |
| 8  | Scope alignment          | Plan scope paths are subsets of lease scope paths           |
| 9  | Lease signature          | Lease carries a valid Ed25519 signature                     |
| 10 | Validation status        | Validation result status is `"passed"`                      |

The gate returns a `GateDecision` with `allowed=True` only if **all checks pass**.
Any single failure produces `allowed=False` with an itemized list of reasons.

Capability coverage uses an explicit `CAP_MAP` dictionary that maps capability enum
names to lease key names. Unknown capabilities are rejected. Explicitly denied
capabilities are rejected even if also granted (deny wins).

### Layer 3: ToolGate (Default-Deny Capability Mediation)

**File**: `runtime/gate/toolgate.py`

ToolGate is a default-deny capability mediator. It governs five capabilities:

| Capability                | Lease Key              | Notes                              |
|---------------------------|------------------------|------------------------------------|
| `FILESYSTEM_READ`         | `filesystem`           | Requires target path in scope      |
| `FILESYSTEM_WRITE`        | `filesystem`            | Requires `write: true` + path      |
| `TEST_EXECUTION`          | `test_execution`       | Boolean grant                      |
| `ARTIFACT_GENERATION`     | `artifact_generation`  | Boolean grant                      |
| `REPOSITORY_MODIFICATION` | `repository_modification` | Requires target path in scope   |

Security properties:

- **No lease = no capabilities.** When `_lease` is `None`, every request returns
  `allowed=False` with reason `"No lease bound (default deny)"`.
- **Time-bounded leases.** Every authorization check validates `valid_from` and
  `expires_at`. An expired lease triggers automatic unbinding.
- **Deny overrides grant.** If a capability's lease key appears in both
  `granted_capabilities` and `denied_capabilities`, the deny takes precedence.
- **Path scope enforcement.** Filesystem and repository operations require a
  non-empty target path that must fall within the union of the lease's
  `scope_constraints.allowed_paths` and the filesystem config's `allowed_paths`.
- **Write requires explicit opt-in.** `FILESYSTEM_WRITE` requires
  `cap_config.get("write", False)` to be `True`.

### Layer 4: Scope Containment

**Files**: `runtime/validation/validator.py`, `swarm/compiler/compiler.py`

Scope containment is enforced at three independent points:

**Validator** (`runtime/validation/validator.py`):
- Rejects any modification path containing `..` (path traversal).
- Checks every modification path against `scope_boundary.allowed_paths`.
- Checks every modification path against `scope_boundary.denied_paths`.
- Verifies all modification paths appear in `target_paths` or `declared_side_effects`.

**BSC Compiler** (`swarm/compiler/compiler.py`):
- Stage 2 (`_enforce_scope`) rejects path traversal (`..`), absolute paths (`/`),
  and paths outside declared `target_paths`.
- Applies a hardcoded denied paths list: `src/`, `runtime/`, `swarm/`,
  `node_modules/`, `.git/`.

**ExecutionGate** (check #8):
- Plan scope paths must be subsets of lease scope paths (prefix matching).

### Layer 5: DSL and Compiler Safety

**Files**: `swarm/dsl/parser.py`, `swarm/compiler/compiler.py`

Both the DSL parser and the BSC compiler independently enforce dangerous pattern
detection using identical regex patterns:

```
Blocked patterns:
  curl, wget, nc, ncat, python, python3, ruby, perl, php, node,
  eval, exec, bash -c, sh -c, sudo, su, dd, mkfs, fdisk,
  mount, umount, chown, chmod 777
  Shell metacharacters: ; | & ` $
```

The **DSL parser** (`validate_dsl`) checks:
- File operations require paths; test operations require commands.
- Path traversal detection (`..` in paths).
- At least one acceptance test is required.
- Acceptance test commands are screened against dangerous patterns.
- Constraint enforcement (e.g., `max_files_modified`).

The **BSC compiler** (`_bind_acceptance_tests`) checks:
- At least one acceptance test is required.
- All test commands are screened against the same dangerous pattern regex.

The **proposal validator** (`_check_deterministic_tests`) checks an expanded set
of patterns including:
- `$RANDOM`, `date +%s`, `mktemp`, `uuidgen`
- Dynamic evaluation: `python -c`, `python3 -c`, `node -e`, `perl -e`, `ruby -e`
- Shell chaining: `;`, `&&`, `||`, `|`, `` ` ``, `$(`, `${`
- Network tools: `curl`, `wget`, `fetch`, `nc`, `telnet`, `ssh`

This triple-layer screening means a dangerous command must bypass three independent
checks to reach execution.

### Layer 6: Governance Lifecycle

**File**: `swarm/governance/lifecycle.py`

Swarm definitions progress through a 7-state finite state machine with
role-enforced transitions:

```
  drafting --> reviewing --> approved --> enabled --> paused
                         \-> rejected                  |       \
                                                       v        v
                                                    revoked   revoked
```

**States**: `drafting`, `reviewing`, `approved`, `rejected`, `enabled`, `paused`,
`revoked`

**Role enforcement**:

| Transition                   | Required Role |
|------------------------------|---------------|
| drafting -> reviewing        | author        |
| reviewing -> approved        | reviewer      |
| reviewing -> rejected        | reviewer      |
| reviewing -> drafting        | reviewer      |
| approved -> enabled          | publisher     |
| enabled -> paused            | publisher     |
| enabled -> revoked           | publisher     |
| paused -> enabled            | publisher     |
| paused -> revoked            | publisher     |
| rejected -> drafting         | author        |
| drafting -> revoked          | publisher     |
| approved -> revoked          | publisher     |

**Terminal state**: `revoked` has no outgoing transitions. Once revoked, a swarm
cannot be reactivated.

Every transition produces a governance event recorded in the `swarm_events` table
for full auditability.

### Layer 7: Governance Warning Policy Engine

**File**: `swarm/governance/warnings.py`

The warning engine evaluates six warning families:

| Warning Family                    | Detects                                                     |
|-----------------------------------|-------------------------------------------------------------|
| `semantic_ambiguity`              | Missing operations, paths, tests, or step dependencies      |
| `scope_expansion`                 | Root-like scopes, broader-than-needed allowed paths         |
| `reduced_assurance_governance`    | Same actor occupying multiple governance roles              |
| `secondary_truth`                 | Delivery claiming final status without runtime evidence     |
| `authority_boundary`              | Execution-shaped payloads on non-runtime surfaces           |
| `replay_determinism`              | Missing versions, timezone-less schedules, env sensitivity  |
| `extension_risk`                  | Experimental extensions or forbidden execution classes      |

**Severity levels**:

- **`block`**: Transition is halted. The system persists the warning and raises
  `ValueError`. No operator override is possible.
- **`warn`**: Transition can proceed only after the operator provides explicit
  acknowledgment via fingerprinted warning IDs. The acknowledgment, override
  reason category, and override reason are recorded.

**Decision fingerprinting**: Each warning is hashed (SHA-256) over its family,
severity, trigger stage, message, boundary at risk, assurance posture, and
affected artifacts. This fingerprint must match when the operator acknowledges
the warning, preventing acknowledgment of a different warning.

**Reduced-assurance governance events**: When role collapse is acknowledged, the
system records a structured `reduced_assurance_governance_event` artifact with
the reduction type (`author_reviewer_role_collapse`,
`reviewer_publisher_role_collapse`, or `single_operator_path`), the normal
expected governance path, and the actual governance path taken.

**Forbidden authority fields**: The authority boundary evaluator blocks any
subject carrying fields from `_FORBIDDEN_AUTHORITY_FIELDS`:
`execution_plan`, `signed_plan`, `runtime_call`, `toolgate_call`, `execute_now`,
`plan_payload`, `run_payload`, `steps`.

**Forbidden execution classes**: Extensions declaring execution classes in
`_FORBIDDEN_EXECUTION_CLASSES` are blocked: `runtime_execution`, `execution_gate`,
`toolgate`, `plan_signing`, `ledger_write`, `scheduler_execution`.

### Layer 8: Delivery Security

**Files**: `swarm/delivery/engine.py`, `swarm/delivery/validation.py`

The delivery engine is downstream from the runtime and enforces several security
properties:

**Fail-closed recipient resolution** (`_resolve_recipient_profile`):
- Profile not found: returns `RECIPIENT_PROFILE_NOT_FOUND` error.
- Profile disabled: returns `RECIPIENT_PROFILE_DISABLED` error.
- No `to_addresses`: returns `RECIPIENT_PROFILE_INVALID_ADDRESS` error.
- Invalid email format: returns `RECIPIENT_PROFILE_INVALID_ADDRESS` error.
- Recipient limit exceeded: returns `RECIPIENT_LIMIT_EXCEEDED` error.
- Any failure records an atomic delivery receipt with `status="failed"`.

**Secondary truth enforcement**: Before delivering results, the engine evaluates
`evaluate_secondary_truth` warnings. If a run claims `succeeded`/`failed`/`completed`
status but lacks a `runtime_execution_id` or `artifact_refs`, the delivery is blocked.

**Atomic receipt recording**: All delivery outcomes (success or failure) are recorded
within a `repo.atomic()` context manager, ensuring the receipt, run status update,
and event recording are committed together or not at all.

**Email policy validation** (`swarm/delivery/validation.py`):
- Default-deny on allowlists (senders, recipient domains).
- Recipient count limits (default: 10).
- Subject length limits (default: 200 characters).
- Body size limits (default: 100KB).
- Attachment policy (configurable allow/deny).
- SMTP credentials resolved from environment variables only (never stored in config).

### Layer 9: ARGUS-Hold Governed Execution

**Module:** `swarm/argus_hold/` (559 statements, 186 tests, 100% coverage)

The ARGUS-Hold Layer is the governed execution membrane between planner
output and tool execution. It implements a strict 8-stage pipeline:
normalize → validate → policy → scope → plan → execute → emit → ledger.

**Security properties:**

1. **Default-deny policy.** Nothing executes unless the command is in
   the registry, the policy allows its side-effect level, and the scope
   guard approves every path and host. `PRIVILEGED` commands (level 5)
   are unconditionally denied.

2. **Schema-enforced parameter validation.** Every command spec declares
   `additionalProperties: false` in its JSON Schema. Parameter smuggling
   is blocked before policy evaluation.

3. **Explicit scope boundaries.** Filesystem access is confined to
   declared read/write roots. HTTP access requires an explicit host
   allowlist. Loopback addresses (127.0.0.1, ::1, 0.0.0.0) and cloud
   metadata endpoints (169.254.169.254) are blocked by default.
   Denied filesystem patterns block `.git/`, `__pycache__/`, and
   `node_modules/` by default.

4. **Hash-chained audit ledger.** Every command attempt — including
   denials — is recorded in an append-only JSONL ledger with SHA-256
   hash chaining. `LedgerWriter.verify_chain()` detects tampering.

5. **Artifact-based proof.** Each pipeline stage emits a JSON artifact.
   Denied commands produce artifacts proving what was refused and why.

**Red team coverage:** 17 tests in `tests/redteam/test_rt_argus_hold.py`
covering path traversal (dotdot, null byte, absolute, URL-encoded),
parameter smuggling, SSRF blocklist bypass, privilege escalation, newline
injection, and ledger tampering detection.

---

## ARGUS-9 Red Team Test Suite

The ARGUS-9 red team suite contains **168 tests across 13 files** in
`tests/redteam/`. These tests systematically probe every security boundary:

| File                              | Tests | Category                                  |
|-----------------------------------|-------|-------------------------------------------|
| `test_rt01_scheduler_boundary.py` | 8     | Scheduler emits only triggers, never executable intent |
| `test_rt02_bridge_ambiguity.py`   | 11    | BSC compiler rejects ambiguity rather than resolving it |
| `test_rt03_skill_boundary.py`     | 11    | Skill ABI operates strictly in the definition layer |
| `test_rt04_artifact_trust.py`     | 19    | Artifact signature and trust chain integrity |
| `test_rt05_scope_smuggling.py`    | 14    | Path traversal, scope escape, and containment bypass attempts |
| `test_rt06_acceptance_gate.py`    | 9     | Acceptance test safety and gate enforcement |
| `test_rt07_delivery_truth.py`     | 9     | Delivery truth claims against runtime evidence |
| `test_rt08_dsl_determinism.py`    | 10    | DSL determinism enforcement and dangerous pattern detection |
| `test_rt09_policy_scope.py`       | 22    | Policy scope expansion, warning engine, and governance warnings |
| `test_rt10_revocation.py`         | 7     | Lease and swarm revocation enforcement |
| `test_rt_argus_hold.py`          | 17    | ARGUS-Hold governed execution layer (path traversal, parameter smuggling) |
| `test_rt11_uncovered_threats.py` | 30    | Spec items A/G/J + TTS injection, credential leakage, RSS injection, delivery honesty |
| `test_runtime_gate_invariants.py` | 5     | ExecutionGate structural invariants |

### What the Red Team Tests Verify

- **RT-01 (Scheduler)**: The scheduler can only emit trigger artifacts. It cannot
  carry execution plans, signed plans, runtime calls, or ToolGate calls.

- **RT-02 (Bridge)**: The BSC compiler rejects missing steps, missing operations,
  path traversal, absolute paths, out-of-scope paths, and dangerous test commands.
  It does not silently resolve ambiguity.

- **RT-03 (Skill ABI)**: Skills operate in the definition layer only. They cannot
  escalate to runtime authority or carry execution-class payloads.

- **RT-04 (Artifact Trust)**: Signatures are verified for plans, validation results,
  and leases. Tampered artifacts, missing signatures, wrong signer roles, and
  cross-artifact signature replay are all detected.

- **RT-05 (Scope Smuggling)**: Path traversal sequences (`../`), absolute paths,
  out-of-scope modifications, and denied-path violations are caught by the
  validator, compiler, and execution gate independently.

- **RT-06 (Acceptance Gate)**: The acceptance gate rejects proposals without tests,
  proposals with dangerous test commands, and proposals that fail validation checks.

- **RT-07 (Delivery Truth)**: The delivery engine blocks final-status delivery when
  runtime evidence is missing. Preview-only surfaces are flagged. Unresolvable
  recipients produce fail-closed errors.

- **RT-08 (DSL Determinism)**: Shell metacharacters, network tools, dynamic eval,
  and non-deterministic commands in DSL acceptance tests are all rejected.

- **RT-09 (Policy Scope)**: Root-like scopes are blocked. Broader-than-minimal
  allowed paths produce warnings. Scope expansion without exact targets is blocked.
  Reduced-assurance governance requires explicit acknowledgment.

- **RT-10 (Revocation)**: Revoked leases are rejected by the execution gate. Revoked
  swarms cannot transition to any other state. Lease revocation is signed and
  recorded.

- **Runtime Gate Invariants**: The ExecutionGate's structural properties are tested:
  unsigned artifacts fail, mismatched IDs fail, expired leases fail, and the
  `CAP_MAP` is consistent between ExecutionGate and ToolGate.

---

## Key File Reference

| File                                   | Security Role                              |
|----------------------------------------|--------------------------------------------|
| `runtime/gate/execution_gate.py`       | 9-check trust chain verification           |
| `runtime/gate/toolgate.py`             | Default-deny capability mediation          |
| `runtime/identity/key_manager.py`      | Ed25519 key generation, storage, loading   |
| `runtime/identity/signer.py`           | Canonical JSON signing and verification    |
| `runtime/validation/validator.py`      | Proposal validation (5 checks)             |
| `runtime/lease/lease_manager.py`       | Lease issuance, validity, revocation       |
| `swarm/dsl/parser.py`                  | DSL parsing and dangerous pattern detection|
| `swarm/compiler/compiler.py`           | BSC compilation with scope and safety gates|
| `swarm/governance/lifecycle.py`        | 7-state FSM with role enforcement          |
| `swarm/governance/warnings.py`         | Governance warning policy engine           |
| `swarm/delivery/engine.py`             | Fail-closed delivery dispatch              |
| `swarm/delivery/validation.py`         | Email policy validation (default-deny)     |
| `tests/redteam/`                       | ARGUS-9 red team suite (168 tests)         |
