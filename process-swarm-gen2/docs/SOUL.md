# The Soul of Process Swarm

This document describes the design principles and philosophical
commitments that govern Process Swarm. These are not aspirations or
best-effort guidelines. They are invariants. Code that violates them is
broken, regardless of whether it produces correct output.

---

## No signed plan, no execution

This is the central invariant. The execution gate
(`runtime/gate/execution_gate.py`) enforces a 10-check verification
chain before any plan is permitted to run:

1. Plan signature valid
2. Validation result signature valid
3. Referential integrity (proposal_id matches)
4. Referential integrity (validation_id matches)
5. Lease validity (not expired, not revoked)
6. Lease plan binding (lease references this specific plan)
7. Capability coverage (lease grants all required capabilities)
8. Scope alignment (plan paths within lease scope)
9. Lease signature valid
10. Validation status is "passed"

If any check fails, execution is denied. There is no "run anyway" flag,
no admin override, no emergency bypass. An unsigned or improperly signed
plan is indistinguishable from a malicious plan, and the system treats
it accordingly.

---

## Trust must be verified, not assumed

The database is a coordination store, not a trust anchor. SwarmRunner
recomputes all critical state from scratch before execution. The
execution gate verifies cryptographic signatures independently of the
registry. Baselines in GRITS are loaded from disk and compared against
live diagnostics, not cached results.

Trust flows from cryptographic proof, not from the fact that a value
exists in a database row. A swarm marked "enabled" in the registry is
necessary but not sufficient for execution -- the gate still verifies
the full chain.

---

## Ambiguity is rejected, not resolved

When the system encounters ambiguity, it stops. It does not guess, infer,
or choose a "reasonable default."

- The Skill ABI refuses to update a swarm whose `lifecycle_status` is
  anything other than `drafting` or `rejected`. It does not attempt to
  determine whether the update would be safe.
- The lifecycle state machine (`swarm/governance/lifecycle.py`) defines
  explicit allowed transitions. A transition not in the map is invalid,
  regardless of whether it "makes sense."
- The execution gate's capability check uses an explicit `CAP_MAP`
  dictionary. An unknown capability is a gate failure, not a warning.
- Governance warnings with severity `block` halt the transition. They
  cannot be acknowledged and overridden -- only `warn`-level warnings
  support acknowledgment.

---

## Governance friction is a feature, not a bug

The lifecycle state machine imposes deliberate friction at every stage:

```
drafting --> reviewing --> approved --> enabled --> paused --> revoked
                       \-> rejected
```

Each transition requires a specific governance role:

| Transition | Required role |
|---|---|
| drafting -> reviewing | author |
| reviewing -> approved | reviewer |
| reviewing -> rejected | reviewer |
| approved -> enabled | publisher |
| enabled -> paused | publisher |
| enabled -> revoked | publisher |

The same actor may hold multiple roles, but the system records a
**reduced-assurance governance event** when this happens. The event
captures the normal expected governance path, the actual path taken, and
requires explicit acknowledgment. The audit trail preserves the fact
that governance was weakened, even when it was legitimately weakened.

This friction exists because automation that modifies production systems
should be hard to authorize. If enabling a swarm feels effortless, the
governance model has failed.

---

## Append-only ledger for auditability

The `swarm_events` table and the execution ledger
(`ledger/execution_ledger.log`) function as append-only records.
Events are never updated or deleted. Every state transition, every run
start and completion, every delivery attempt, every governance warning
is recorded with timestamps, actor IDs, and structured details.

The `EventRecorder` (`swarm/events/recorder.py`) defines 23+ event
types spanning intent lifecycle, swarm lifecycle, run lifecycle,
delivery, governance warnings, pipeline stages, and capability
management. Each event is a permanent fact in the system's history.

This is not logging for debugging. This is the evidentiary record that
proves (or disproves) that the system operated within its governance
boundaries.

---

## Defense-in-depth: security enforced at multiple layers

No single layer is trusted to enforce security alone:

- **ABI layer** -- rejects lifecycle changes, blocks updates to
  non-draft swarms, validates input names.
- **Governance layer** -- state machine rejects invalid transitions,
  enforces role requirements, evaluates and persists warnings.
- **Execution gate** -- 10-check cryptographic verification chain.
- **Runtime pipeline** -- signed proposals, signed validation results,
  signed leases.
- **Database layer** -- foreign key constraints, CHECK constraints on
  status enums, WAL mode for crash safety.
- **GRITS** -- independent integrity evaluation against known-good
  baselines.

A vulnerability at one layer should not be exploitable if the other
layers are intact. The system is designed so that compromising it
requires simultaneous failures across multiple independent boundaries.

---

## Determinism over cleverness

Process Swarm favors explicit, predictable behavior over smart
heuristics:

- The cron parser in `swarm/scheduler/evaluator.py` implements standard
  5-field cron from scratch rather than depending on a third-party
  library with undocumented edge cases.
- The `CAP_MAP` in the execution gate is a flat dictionary, not a
  pattern matcher or wildcard system.
- The lifecycle state machine is a static dictionary of allowed
  transitions, not a rule engine.
- The Adaptive Orchestrator uses explicit stagnation thresholds and
  cycle limits, not learned convergence criteria.

When the system does something, it should be possible to explain exactly
why by pointing to a specific rule, threshold, or transition in the
code.

---

## Fail-closed, never fail-open

Every error condition in the system defaults to denial:

- SwarmRunner aborts on database integrity check failure.
- The execution gate returns `allowed=False` if any check fails.
- The delivery engine returns `None` (no delivery) if the secondary
  truth policy check produces block-level warnings.
- Recipient profile resolution fails closed: missing profiles, disabled
  profiles, invalid addresses, and exceeded limits all produce errors
  rather than fallback behavior.
- The lifecycle manager raises `ValueError` on any invalid transition
  rather than silently ignoring it.
- The Skill ABI version negotiation returns `False` for unknown
  versions rather than assuming compatibility.

The system assumes that if it cannot prove an operation is safe, the
operation is unsafe. Silence is denial.
