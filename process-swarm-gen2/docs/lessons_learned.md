# Process Swarm Gen 2 — Lessons Learned

Things discovered during the rebuild that would have improved the process, gotchas encountered, and knowledge for future reference.

---

## Inherited from Gen 1

These lessons were documented in the original Process Swarm and are being applied from the start:

1. **Always use `from __future__ import annotations`** — Python 3.9 breaks on `tuple[X, Y]` type hints without it
2. **Never name a package `platform`** — Collides with Python stdlib module
3. **Capability enum-to-lease key mapping** — Use explicit `cap_map` dict, never string manipulation
4. **Schema signature field consistency** — Always use `signer_role`, never `key_id`
5. **FK constraints are the enforcement surface** — Tests should assert `sqlite3.IntegrityError`, not `ValueError`
6. **Path containment checks** — Must resolve paths before comparing (prevents `..` traversal)
7. **Mock fidelity** — Mock objects must match the real interface exactly
8. **LLM result validation** — Validate semantic quality, not just structural validity
9. **SSRF prevention** — Validate URLs post-redirect, not just pre-request

## Discovered During Gen 2 Rebuild

10. **setuptools flat-layout multi-package discovery** — When you have multiple top-level packages (`runtime/`, `swarm/`) in a flat layout, setuptools raises `Multiple top-level packages discovered`. Fix: add `[tool.setuptools.packages.find]` with explicit `include = ["runtime*", "swarm*", ...]` in pyproject.toml.

11. **Simplify cross-layer dependencies for incremental builds** — The PipelineRunner originally depended on `swarm.governance.warnings` and `swarm.registry`. When building the runtime kernel first, these don't exist yet. Solution: make cross-layer imports optional and wire them in when the dependent layer is built. Don't over-couple the foundation.

12. **Test fixture realism matters** — The `openclaw_root` fixture creates a complete directory structure (identity/keys, schemas, artifacts subdirs, ledger) in `tmp_path`. This caught real integration issues that simpler fixtures would have missed. Worth the extra setup cost.

13. **137 tests in 0.31s is achievable** — Ed25519 key generation per test is fast enough (~1ms) that there's no need to share keys across tests. Each test gets its own `keys_dir` fixture for full isolation.

14. **Plan estimates will be wrong — that's fine** — Plan said 21 tables, actual was 30. The plan is a map, not the territory. Match the original's actual schema, not the plan's estimate.

15. **In-memory SQLite for tests is fast and isolated** — Each test gets `RegistryDatabase(":memory:")`. No disk I/O, no cleanup, no race conditions. 114 tests in 0.35s.

16. **`_ensure_column` is the right migration strategy for SQLite** — SQLite doesn't support `ALTER TABLE ADD COLUMN IF NOT EXISTS`. Checking `PRAGMA table_info` first is the cleanest workaround. Makes `migrate()` fully idempotent.

17. **Classification dataclass fields should match their serialized form** — `SwarmArchetypeClassification.swarm_archetype` is a `str` (e.g., `"structured_report"`), not a `SwarmArchetype` enum member. Calling `.value` on a string crashes. This pattern repeated 6+ times across pipeline.py. Lesson: when a dataclass field stores a string representation, don't treat it as an enum.

18. **FK constraint chains require full artifact lineage in tests** — `action_tables.intent_ref` references `intent_acceptances.acceptance_id`, not `intent_drafts.draft_id`. Test fixtures must build the full chain: create_swarm → create_intent_draft → create_restatement → accept_intent → create_action_table. Shortcutting the lineage triggers `sqlite3.IntegrityError`.

19. **Optional cross-phase imports enable incremental development** — Use `try/except ImportError` for modules from later phases (e.g., `swarm.events.recorder` in Phase 3). The feature gracefully degrades — events just don't get recorded until the module exists. This avoids artificial coupling between build phases.

20. **Keyword-based classification needs careful test inputs** — "Generate a weekly intelligence report" classifies as `scheduled_structured_report` because "weekly" triggers schedule keywords. Test inputs for `structured_report` must avoid schedule words. Similarly, delivery and monitoring tests need inputs that don't accidentally match other archetypes.

21. **Kahn's algorithm appears twice for different purposes** — `action_table.py` uses it for dependency cycle detection in action tables; `pipeline.py` uses it for dependency validation in the planning pipeline. Same algorithm, different contexts. Worth keeping both rather than abstracting, since they operate on different data structures.

22. **Idempotent tool seeding is essential** — `seed_default_tools()` checks `get_tool_by_name()` before each insert. Without this, repeated test runs or application restarts would fail with unique constraint violations on tool names.

23. **Synthetic swarm_ids collide with FK constraints** — `EventRecorder.tool_registered()` uses `swarm_id="__platform__"` for platform-global events, but `swarm_events.swarm_id` has an FK to `swarms.swarm_id`. Solution: either create a sentinel `__platform__` swarm during init, or route platform events through a different mechanism.

24. **Warning fingerprinting enables idempotent governance workflows** — Each governance warning gets a `decision_fingerprint` (SHA-256 of semantic fields). This allows the lifecycle manager to match acknowledgments to warnings across separate transactions. Without fingerprints, the warning-acknowledge-retry flow would break.

25. **Governance friction is a feature, not a bug** — The reduced-assurance governance flow intentionally makes single-operator paths harder. An actor who is both author and reviewer must: (1) attempt the transition, (2) receive and read the warning, (3) collect warning IDs, (4) re-attempt with acknowledgment. This 4-step dance is by design — it forces conscious acceptance of reduced assurance.

26. **Share dangerous-pattern regexes across security layers** — The `_DANGEROUS_PATTERNS` regex for detecting curl, wget, shell metacharacters etc. appears in both the DSL validator and the BSC compiler. Same regex, two enforcement points = defense-in-depth. Don't abstract it into a shared module — the duplication is intentional and each layer should be independently auditable.

27. **BSC `_parse_json_field` handles both strings and lists** — Registry stores behavior sequence fields as JSON strings (`json.dumps([...])`), but direct API callers pass raw lists. The BSC's `_parse_json_field()` accepts both transparently. Without this, tests pass (raw lists) but production fails (JSON strings) or vice versa.

28. **Bridge translator must reject unknown operation_class** — When the bridge encounters an unrecognized `operation_class`, it raises `ValueError` rather than guessing. Silent fallbacks at protocol boundaries cause semantic drift — a docs_edit treated as a generic modify could bypass scope constraints designed for document operations.

29. **Gateway artifact chains must match PipelineRunner's format exactly** — The GatewayRecorder produces proposal → validation → plan → execution → ledger entries with the same field structure as PipelineRunner output. ProofUI renders both identically. If the formats diverge, ProofUI silently drops gateway runs from the dashboard.

## Discovered in Phase 5

30. **Subagent-created adapters need integration testing against real tests** — When a subagent writes implementations and a separate process writes tests, systemic mismatches accumulate: wrong field names, wrong data access patterns, wrong directory structures. All 10 of 15 adapters had bugs. Write one adapter manually, verify against tests, then let the subagent follow the proven pattern.

31. **`find_prior_output` enables loose coupling but requires key discipline** — The static method searches all prior step results for a key. This means adapters don't need to know upstream step names, but the key namespace must be consistent. If UrlValidator outputs `valid_sources` and FreshnessFilter looks for `sources`, the chain breaks. Establish a data contract: each step reads common keys, not step-specific ones.

32. **Delivery engine recipient profile resolution must be fail-closed** — When resolving email recipients from a profile, every error path (profile not found, disabled, no addresses, invalid addresses, limit exceeded) must return a failure rather than falling through to a default. Open-fail delivery could send sensitive reports to unintended recipients.

33. **Atomic receipt recording prevents orphaned delivery state** — The delivery engine wraps receipt creation + run status update + event emission in a single `repo.atomic()` transaction. Without this, a crash between receipt creation and run update would leave the system thinking a run has no delivery while a receipt exists claiming it was sent.

## Discovered in Phase 6

34. **Always read the actual function signature before calling** — When building across sessions, API signatures drift from mental models. `EventRecorder.record()` requires `actor_id` and `summary` positional args, not a `metadata` kwarg. `save_keypair()` puts `role` first, not `signing_key`. Always `grep` for `def method_name` and read the signature before wiring modules together.

35. **Database field names must match exactly across layers** — The behavior sequence table stores steps as `ordered_steps_json` (a JSON string), not `steps`. When the runner reads `bs.get("steps", [])` it gets None because the key doesn't exist. Read the CREATE TABLE or the INSERT statement to verify field names.

36. **Lazy imports prevent circular dependency between layers** — SwarmRunner (swarm layer) needs PipelineRunner (runtime layer), but the runtime layer shouldn't depend on swarm. Using a lazy-loading property (`@property` with `_pipeline_runner is None` guard) defers the import to first access, breaking the cycle.

37. **Wrap, don't modify** — The AdaptiveOrchestrator wraps SwarmRunner by calling `_execute_via_adapters()` in a cycle loop, rather than modifying SwarmRunner to support adaptive scheduling directly. This keeps the runner simple and makes the adaptive behavior optional and testable in isolation.

## Discovered in Phase 7

38. **Subagent-written tests require full-suite integration testing** — Each subagent reported passing tests individually, but they were testing against their own assumptions about the API, not the actual codebase. Running all 130 tests against the real modules exposed 3 systemic mismatches (field names, method signatures, return types). Always run the combined suite before considering subagent output complete.

39. **Security tests should confirm invariants, not discover bugs** — All 130 ARGUS-9 red-team tests passed after fixing only test-side API mismatches — zero production code changes were needed. This validates that security boundaries were correctly implemented during the build phases. If red-team tests require production code changes, it means the boundary wasn't enforced in the first place.

40. **Test-side API alignment is the dominant failure mode for parallel test authoring** — The 3 fixes were all in the same category: the test assumed a different interface than what exists. The fix pattern is always the same: grep for `def method_name` in the production code and match the test to the actual signature. This suggests that parallel test authoring would benefit from a shared "API reference" artifact that subagents can consult.

## Discovered in Phase 8

41. **Pipeline architecture scales well for observability** — GRITS uses a 10-step pipeline where each step is a separate module. This makes adding new diagnostic suites trivial (just add a new file in `diagnostics/` and register it in the suite resolver) without touching the pipeline orchestration. The same pattern applies to ProofUI's endpoint routing.

42. **HTTP integration tests dominate test runtime** — ProofUI's 39 tests with a real HTTP server added ~9 seconds to the suite (10.41s vs 1.37s). For fast CI feedback, consider marking HTTP tests with `@pytest.mark.slow` and running them separately. Unit tests covering handler logic without a live server would keep the fast path fast.

## Discovered in Phase 9

43. **Deterministic pipelines beat LLM-first for job authoring** — The intent-to-job pipeline uses keyword scoring, regex extraction, and schema validation — no LLM calls. This makes the pipeline reproducible, testable, and fast. LLM-first approaches would require mocking in tests and introduce nondeterminism. Reserve LLM calls for genuinely ambiguous classification tasks.

44. **Schema-driven validation catches more bugs than hand-written checks** — Using JSON Schema 2020-12 for job validation (`process_swarm_job.schema.json`) catches structural issues (missing fields, wrong types, invalid enums) that would otherwise require dozens of manual `if` checks. The schema is the single source of truth for what constitutes a valid job.

45. **Bounded repair is safer than unbounded retry** — `repair_job.py` applies defaults from the job class library to fill missing fields, but never invents values or retries classification. A job that can't be repaired from defaults fails cleanly. This prevents the system from generating plausible-but-wrong configurations through cascading guesses.

46. **End-to-end pipeline scripts should compose, not inherit** — Each script in the job authoring pipeline (`classify_intent.py` → `extract_job_parameters.py` → ... → `plan_job_execution.py`) is a standalone function. The orchestrator (`compile_intent.py`) composes them sequentially. No class hierarchy, no shared mutable state. This makes individual scripts independently testable and replaceable.

## Discovered in Phase 10

47. **Documentation is parallelizable when modules are independent** — All 12 documentation files were written by 5 parallel subagents with zero conflicts. The key is that each doc covers a distinct concern (architecture, security, identity, tools, agents, etc.) with clear boundaries. This mirrors the codebase's own modularity — well-separated modules produce well-separated documentation.

48. **Config reference files should be templates, not live configs** — `node_identity.json`, `key_registry.json`, `tool_policy.json`, and `baseline.manifest.json` are documentation artifacts (templates with placeholders), not runtime configuration. Storing them in `docs/` rather than the project root prevents accidental loading by application code that might expect real values.

## Discovered During 100% Coverage Campaign

49. **SQLite corruption testing requires three distinct techniques** — (1) `PRAGMA writable_schema` with ghost tables breaks `connect()` entirely. (2) Data page zeroing (skip page 1) lets connect succeed but `PRAGMA integrity_check` raises `DatabaseError`. (3) Index byte-flipping produces non-ok rows from `integrity_check` without raising. Each technique covers a different code path in the integrity verification logic.

50. **`PRAGMA integrity_check` can raise, not just return rows** — On severe corruption, the pragma itself throws `sqlite3.DatabaseError` rather than returning error rows. Production code that calls it must wrap in try/except if it wants to report errors rather than crash. This is an underdocumented SQLite behavior.

51. **Defense-in-depth code should be extracted into testable methods** — Gate denial and delivery failure catch-all paths were embedded in monolithic orchestrator methods (`run()`, `execute_run()`). They were architecturally correct but unreachable through normal API flows. Extracting them into focused methods (`_enforce_gate()`, `_try_deliver()`) improves both testability and code clarity — no mocks needed.

52. **100% coverage with zero mocks is achievable but requires production code quality** — Every unreachable code path represented either dead code (remove it) or defense-in-depth code (extract it into a testable method). The discipline of "no mocks" forced three genuine production code improvements that made the codebase better, not just better-tested.

53. **In-memory schema cache defeats integrity testing** — SQLite caches the schema in the connection object. If you corrupt the database file while a connection is open, `integrity_check` may still return "ok" because it reads from the cache. You must close the connection and open a fresh one to test file-level corruption.

54. **Behavior proposal schema uses `modifications`/`operation`, not `operations`/`operation_type`** — The canonical schema field for proposal file changes is `modifications` with keys `path`, `operation`, and `content`. Earlier code and tests sometimes used `operations` with `operation_type`. Always check the actual schema file, not code assumptions.

## Discovered During ACDS Integration

55. **Protocol is better than ABC for cross-package interfaces** — The `InferenceProvider` protocol uses structural typing (duck typing) rather than inheritance. This means any object with an `infer()` method works, without needing to import or inherit from a base class. This is cleaner for cross-package boundaries where you don't want tight coupling.

56. **Graceful degradation by returning None** — When an ACDS call fails, the provider returns `None` rather than raising. Callers check `if result is not None` and fall back to rules. This is simpler and more robust than try/except at every call site, and it means the system works identically whether ACDS is configured, unreachable, or not configured at all.

57. **Mirror TypeScript contracts exactly in Python dataclasses** — The ACDS core-types package defines contracts in TypeScript. The Python client mirrors these as dataclasses with identical field names and enum values. This makes cross-language debugging trivial — a `RoutingRequest` in Python has the same shape as one in TypeScript, so you can compare JSON payloads directly.

58. **Environment variables with sensible defaults enable zero-config operation** — `INFERENCE_PROVIDER` defaults to "rules", so the system works without any ACDS configuration. Setting `INFERENCE_PROVIDER=acds` and `ACDS_BASE_URL` is the only change needed to enable LLM-backed inference. No code changes, no config files, no feature flags.

## Discovered During ACDS Evaluation Harness

59. **Coverage ratio beats Jaccard for relevance scoring** — Jaccard similarity (`|A∩B| / |A∪B|`) penalizes long correct answers because output tokens dilute the union. Coverage ratio (`|task_tokens ∩ output_tokens| / |task_tokens|`) correctly identifies relevant answers regardless of output length. Use Jaccard for symmetric similarity, coverage for asymmetric "does X contain Y" checks.

60. **Filler detection thresholds need empirical tuning** — Circular content like "The analysis analyzes the analysis" has higher trigram uniqueness than expected (~75%). A uniqueness threshold of 0.4 was too lenient. Raised to 0.85 based on testing with known-filler and known-substantive examples. Always test thresholds against concrete adversarial inputs, not just intuitive values.

61. **Append-only event ledgers simplify replay and audit** — The `ProviderEventLedger` records every provider interaction as an immutable event dict. This makes replay trivial (replay the event sequence), audit complete (every decision is recorded), and debugging straightforward (filter by task_id or event_type). The "append-only" constraint is enforced by API design (only `record_*` methods, no update/delete).

62. **Policy-as-data makes routing auditable** — `ProviderPolicy` encodes routing rules as sets of qualified task types and grade ranges. This is inspectable, versionable, and diffable — unlike routing logic embedded in code. When the policy changes, the diff shows exactly what changed.

63. **Red-team tests should exercise exact adversarial inputs** — Generic tests miss edge cases. The filler detection test uses "This section contains the summary of the summary" — a real adversarial pattern. The citation test uses `[Source 7]` against known sources `["Source 1", "Source 2", "Source 3"]`. Specific, realistic adversarial inputs catch threshold bugs that synthetic tests miss.

64. **100% coverage gap tests reveal no dead code when the architecture is clean** — All 19 uncovered lines in the evaluation module were real code paths: ValueError branches, empty-input guards, scoring threshold boundaries, loop-skip conditions. None were dead code requiring removal. This validates the architecture — every line serves a purpose.

### ARGUS-Hold Layer

65. **Default-deny is an architecture, not a feature flag** — The ARGUS-Hold policy engine doesn't have an "enable default-deny" toggle. The structure itself is default-deny: nothing executes unless the registry has the command, the policy allows the side-effect level, and the scope guard approves every path and host. Three independent gates, all must pass. This makes accidental permission expansion structurally impossible.

66. **Hash-chained ledgers make denial auditable** — Denied commands get the same ledger treatment as executed ones: full entry with stage summary, outcome, content hash, and chain hash. An invisible denial is an invisible security hole. The `_build_denied` path in the dispatcher still calls `emitter.emit()` and `ledger.append()` before returning failure.

67. **Dead code that requires monkeypatching to test should be removed** — The `scope_guard.py` Python <3.9 fallback for `Path.is_relative_to()` was 5 lines of unreachable code on Python 3.14. Testing it would require monkeypatching `hasattr` — violating the "no mocks" constraint. Removing it dropped statement count from 565 to 559 and made 100% coverage achievable cleanly. Dead compatibility shims are technical debt, not safety nets.

68. **Real HTTP servers beat mocked ones for adapter tests** — A `http.server.HTTPServer` on port 0 in a daemon thread adds ~0.6s but provides real TCP confidence. The `/echo-ua` endpoint pattern — server echoes request metadata as response body — verifies request construction without mocking. Port 0 eliminates conflicts. Module-scoped fixtures amortize startup across all tests.

69. **Canonical command envelopes prevent freeform execution** — The `Normalizer` converts upstream action dicts to typed `CommandEnvelope` objects. No executor consumes freeform natural language. The envelope carries `command_name`, `version`, `parameters`, `side_effect_level`, `run_id`, `swarm_id`, and `dry_run` — all typed, all validated. This is the "Intentional Interface made operational."

70. **Artifact emission proves what the system refused, not just what it did** — The spec requirement "prove not only what it did, but also what it refused to do" means denied commands must produce artifacts. A validation failure emits `validation-report.json`. A policy denial emits `policy-decision.json`. A scope violation emits `scope-check.json`. The artifacts are the proof.

71. **TTS honesty over convenience** — When a capability isn't available, return `{implemented: false}` with the full request metadata. Don't stub success. Don't skip the ledger entry. The system records what it was asked to do, acknowledges it can't, and ledgers the gap as `stub_not_implemented`. This makes capability gaps discoverable, not hidden.

72. **Pipeline stages as near-pure functions simplify testing** — Each ARGUS-Hold stage (normalize, validate, policy, scope, plan) is a function from typed input to typed output with no hidden state. The dispatcher is the only stateful component, and its state is just the wiring. This means each stage can be tested in isolation with real objects — no mocking needed.

73. **Bogus command specs test adapter routing gaps** — To test the "no adapter for namespace" branch, copy real specs to a temp dir and add a `bogus.do_thing.v1.json`. The command passes normalize, validate, policy, and scope — but the dispatcher has no adapter for the `"bogus"` namespace. This tests the exact failure path without any mocking.

74. **Never tell the user something doesn't exist without checking every database on the machine** — When the user said GRITS and Oregon AI Brief swarms existed, the swarm definitions weren't in the current `platform.db`. But the original data lived in `/Users/m4/openclaw/platform.db` and copies. Always search broadly before contradicting the user. `find / -name "platform.db"` is cheaper than losing trust.

75. **Stubs that return success are lies** — `EmailAdapter._send_stub` returned `{"success": True}` when no SMTP was configured. This made the system appear to deliver when it didn't. The fix: `_send_unconfigured` returns `{"success": False}` with an honest message. If it can't do the thing, it must say it can't do the thing.

76. **TTS as a pipeline of adapters, not a monolith** — The Oregon AI Brief + Audio swarm has 8 TTS steps, each as its own `ToolAdapter`. This matches the swarm architecture: each step reads from `prior_results`, does one thing, writes artifacts. The renderer calls `say -f tempfile` (no shell injection). The assembler uses ffmpeg concat demuxer. Each step is independently testable.

77. **Validate delivery methods at selection time, not execution time** — The ProofUI `/api/delivery/available` endpoint probes Telegram (getMe) and Email (SMTP connect) before populating the dropdown. Users only see methods that are actually reachable. No "select email" → run for 10 minutes → "SMTP connection refused" surprise.

78. **Environment variables for secrets, profiles for config** — SMTP credentials use env vars (`SMTP_USERNAME`, `SMTP_PASSWORD`) referenced by name in `smtp_relay_profile.json`. Telegram uses `TELEGRAM_BOT_TOKEN`. The profile file is safe to commit; the secrets never touch disk.

79. **Fresh SwarmRunner per execution solves DB connection isolation** — `SwarmPlatform.execute_run()` creates a new `SwarmRunner` each time with its own DB connection. This avoids WAL locking issues and ensures each run picks up current env vars (like `TELEGRAM_BOT_TOKEN`).

80. **Red team tests must cover the spec exhaustively, not just what's convenient** — The ARGUS-Hold spec listed 10 red team scenarios (A-J). Only 7 were covered. The missing 3 — unregistered commands, dry-run drift, timeout boundaries — were the hardest to test without mocks. The solution: test the execution plan determinism (dry-run drift), test the spec's timeout propagation (timeout boundary), and test at multiple layers (registry, normalizer, dispatcher) for unregistered commands.

81. **TTS shell injection defense is architectural, not code** — The `say -f tempfile` pattern prevents shell injection by design. Text never passes through a shell — it's written to a file, and `subprocess.run` with a list argument bypasses shell interpretation entirely. The red team tests confirm this with `$(rm -rf /)`, semicolons, backticks, and pipes — all produce valid audio.

82. **Credential leakage tests must check error paths, not just success paths** — A Telegram adapter that fails with `"Telegram API 401: unauthorized"` is safe. One that fails with `"Telegram API 401: token 8565259183:AAG... unauthorized"` leaks the token. The red team tests verify the token never appears in any response field — success or failure.

83. **CORS `*` is a deployment hazard for local-first tools** — ProofUI runs on localhost and only serves the local user. A wildcard `Access-Control-Allow-Origin: *` header allows any website to POST to the API and trigger swarm execution (CSRF). The fix: validate the `Origin` header and only reflect localhost/127.0.0.1 origins. Same-origin requests (no Origin header) get the default localhost value.

84. **Accessibility is a compliance requirement, not a feature** — US Federal Section 508 and Oregon ORS 276A.400 mandate WCAG 2.1 AA. The most common failures in developer tools: no focus indicators, dim text below 4.5:1 contrast, clickable elements not keyboard-accessible, and headings using `<div>` instead of `<h1>`/`<h2>`. The `clickableRow()` helper pattern centralizes keyboard accessibility for all navigable table rows.

85. **Schema drift accumulates silently** — When columns are added via `_ensure_column()` migrations but not added to the CREATE TABLE definition, fresh databases work but the schema definition is split across two locations. The fix: always add migrated columns to the CREATE TABLE definition first, keep `_ensure_column()` as a no-op safety net for existing databases.

86. **The integration boundary is a capability request, not a function call** — Process Swarm never calls providers directly. It calls `ACDSClient.request(capability, input, constraints)`. This keeps orchestration and cognition decoupled: Process Swarm defines *what* work happens, ACDS decides *how* it gets executed. The contract enforces this — `CapabilityRequest` has no provider_id field (that's ACDS's job to resolve).

87. **Lineage tracking must chain, not just log** — Individual execution logs are insufficient for audit. Each `LineageEntry` has a `parent_entry_id` linking it to the previous node in the pipeline. This creates a verifiable chain: given any artifact, you can trace backwards through every decision that produced it. The integration lineage complements (doesn't replace) the ARGUS-Hold command ledger — they operate at different layers.

88. **Failure classification determines propagation** — Not all failures are equal. `PolicyDeniedError` and `ContractViolationError` are terminal — retrying won't help because the request is fundamentally invalid. `ProviderFailedError` is retryable because a different provider might succeed. `CapabilityUnavailableError` is not retryable because no provider supports the capability. The `FailurePropagator` makes this classification explicit rather than leaving it to individual error handlers.

89. **Lineage parent chains must be keyed by process, not global** — A single `_last_entry_id` field on the pipeline means that if two processes run through the same pipeline instance, process B's first node gets process A's last node as its parent. The fix: `_last_entry_by_process: dict[str, str]` keys parent tracking per `process_id`. This is the kind of bug that only appears under concurrency and produces silently wrong audit trails.

90. **Port-open checks lie; health checks tell the truth** — `socket.connect_ex(port)` returns 0 if a port is listening, but says nothing about whether the service behind it is functional. Ollama could be listening on 11434 while still loading a model. The `.health()` endpoint verifies the service can actually respond. Test skip guards should use health checks, not port checks.

91. **Advisory policy mode is a fail-open path — document it** — When `PolicyNodeConfig(block_on_deny=False)`, both "deny" verdicts and ACDS errors return True (allow). This is correct for advisory-only policy evaluation, but it must be documented explicitly because it's a conscious fail-open decision. Undocumented fail-open paths become security incidents.
