# Lessons Learned

Tracking lessons learned to prevent repeating pain points.

---

## 2026-03-15 — Project Setup

- Establish documentation structure before writing code to maintain architectural clarity
- Layer boundaries must be enforced from the start — retrofitting dependency discipline is costly

## 2026-03-15 — Monorepo TypeScript Configuration

- Workspace packages pointing `main`/`types` to `./dist/` won't resolve during development until built. Use a root `tsconfig.json` with `paths` mapping `@acds/*` to source `src/index.ts` files for typecheck-time resolution.
- Always add `@types/node` as a root devDependency for Node.js monorepos — every package needs it and it's easy to forget.
- A monorepo root tsconfig that includes everything must override `rootDir` to `"."` and disable `declaration`/`sourceMap` (use `noEmit` only) to avoid TS6059 errors about files outside rootDir.
- `lib: ["ES2022"]` alone isn't enough when code uses `fetch`, `AbortController`, or `DOMException` — need `"DOM"` and `"DOM.Iterable"` in lib.

## 2026-03-15 — Fastify Type Augmentation

- When using a dependency injection pattern with Fastify (e.g. `fastify.diContainer`), create a `types/fastify.d.ts` file that augments the `FastifyInstance` interface via `declare module 'fastify'`. Include an index signature `[key: string]: any` if routes access container properties dynamically.
- Same applies for `fastify.config` — must be declared in the augmentation module.

## 2026-03-15 — Compile-Fix Discipline

- Never skip compile-fix passes. Batching code generation without compiling accumulates errors that compound — what could be a 5-minute fix per prompt becomes hundreds of errors to untangle later.
- Install dependencies (`pnpm install`) before attempting any compilation. Seems obvious but was skipped.
- Run `tsc --noEmit` after every prompt batch, not at the end. Categorize errors systematically: `grep "error TS" | sed | sort | uniq -c` reveals the pattern fast.

## 2026-03-15 — Code Generation and Test Quality

- Generated test files often reference types that don't exist or use wrong field names (e.g. `runCount` on `FamilySelectionState` when the actual field is something else). Always compile tests against actual source types before committing.
- Mock classes in tests must fully implement their interfaces — partial mocks cause TS2420/TS2416 errors. Read the actual interface before writing the mock.
- `noUnusedLocals` and `noUnusedParameters` in strict mode catch a lot of import sloppiness in generated code. Fix immediately rather than accumulating.

## 2026-03-15 — Crypto and Security

- Node.js `createCipheriv`/`createDecipheriv` with `@types/node` >= 20 has overload ambiguity when the algorithm is a string literal. Cast the algorithm to the specific type (e.g. `'aes-256-gcm'`) to resolve.
- Envelope encryption pattern works well for provider secrets: abstract `KeyResolver` interface allows swapping file-based vs environment-based key storage without touching crypto logic.

## 2026-03-15 — Post-Build Code Review

- **AES-256-GCM IV must be 12 bytes per NIST**, not 16. The Node.js docs and many examples silently accept 16 but it weakens the cryptographic guarantee. Always verify IV length against the algorithm specification.
- **Never put API keys in URLs that appear in error messages.** Gemini adapter was constructing `?key=...` URLs and using the full URL in `AdapterError` messages. Fix: separate base endpoint from key-appended URL, redact key patterns in error messages.
- **Typed domain errors beat string matching.** `error.message.includes('not found')` is fragile — refactored to `error instanceof NotFoundError`. Create error classes in a shared types package so all layers can throw and catch them consistently.
- **`as any` casts in `.includes()` calls are a code smell for wrong parameter types.** `PolicyMergeResolver` was casting `cognitiveGrade` to `any` to satisfy `.includes()` on `CognitiveGrade[]` — the real fix is accepting the enum type in the method signature.
- **Stubs that pass type-check but fail at runtime are worse than compilation errors.** Worker handlers with `throw new Error('Not implemented')` satisfy the compiler but break the system silently. Every handler must have a working implementation or the function shouldn't exist.
- **Shared singleton repositories solve cross-handler data flow in workers.** When plateau detection feeds recommendations which feed auto-apply, a shared state repository singleton ensures they all read/write the same data. Export factory functions for each handler to access shared state.
- **Vitest needs explicit path aliases when packages use `main: ./dist/index.js`.** Without a `vitest.config.ts` that maps `@acds/*` to source paths, integration tests can't resolve workspace packages. The `tsconfig.json` paths work for `tsc` but not for vitest's Vite-based resolver.
- **Adapter error differentiation matters for retry decisions.** `DOMException` with `name === 'AbortError'` means timeout (not retryable). `TypeError` means network-level failure (DNS, connection refused — not retryable). Other errors may be server-side (retryable). All four adapters should use the same categorization logic.
- **Deterministic selectors must respect escalation policy.** `DeterministicProfileSelector` returned the first eligible profile regardless of `forceEscalation`. When escalation is forced, cloud-capable profiles should be preferred over local-only ones.

## 2026-03-15 — Design Alignment & Remediation

- **Grep for hardcoded enum string literals before renaming enums.** TypeScript's `tsc` cannot catch `'draft'` when the code expects `DecisionPosture.DRAFT` — both are just strings at the type level. Always run `grep -r "'old_value'" --include='*.ts'` before changing any enum member. Found a critical hardcoded `'draft'` in `LowRiskAutoApplyService.ts` that would have been silently wrong after the rename.
- **`Record<EnumType, T>` must be exhaustive.** When adding new enum members (e.g., `GENERATION`, `REASONING`, `CODING` to TaskType), any `Record<TaskType, DecisionPosture>` must include entries for all members. TSC enforces this, but only if the type annotation uses the full enum. Partial records need `Partial<Record<...>>`.
- **`classifyLoad` required a semantic redesign, not just a rename.** The old complexity-based model (simple/moderate/complex counting input characters) was conceptually wrong for the new throughput-based tiers (single_shot/batch/streaming/high_throughput). The new API uses `{ itemCount, streaming, concurrency }` — a fundamentally different classification model.
- **TypeScript index signatures on interfaces with string literal union properties.** Interfaces with properties like `status: 'success' | 'error'` don't satisfy `Record<string, string>` because they lack an index signature. Adding `[key: string]: string` resolves this — literal unions are subtypes of `string`.
- **Discriminated union narrowing doesn't work through test assertions.** `expect(result.success).toBe(false)` doesn't narrow `result` from `A | B` to `B` in TypeScript. Either change the function return type to be more specific, or use `if` guards before accessing discriminated properties.
- **Atomic enum changes are the only safe approach.** Changing an enum value in the definition but not in all consumers creates silent runtime bugs (string comparisons fail). Every consumer must update in the same logical change. Grep, fix all, verify with `tsc`, then commit.

## 2026-03-15 — ARGUS-9 Red Team Testing (Phase 1)

- **Regex-based redaction is inherently fragile.** `SecretRedactor` uses `/key/i` which matches "monkey" and `/auth/i` which matches "author". Pattern-based secret detection needs word-boundary anchors or exact key matching, not substring regex.
- **Array traversal is a common blind spot in recursive object walkers.** Both `SecretRedactor.redactRecord` and `redactObject` skip arrays with `!Array.isArray(value)`. Any secret nested in an array survives. Red team tests should always include array-wrapped payloads.
- **URL syntax validation is not SSRF protection.** `new URL()` happily parses `file:///etc/passwd` and `http://169.254.169.254/`. Provider URL validation needs a scheme allowlist (http/https only) and a host blocklist (loopback, link-local, RFC 1918).
- **Numeric bounds are not enforced at domain boundaries.** `calculateExecutionScore` documents "score between 0 and 1" but accepts 5.0 and -3.0. `CandidateRanker` uses `rollingScore` and `successRate` directly without clamping. Every numeric domain invariant should be enforced at the function boundary, not just documented.
- **NaN propagation through arithmetic is silent in JavaScript.** NaN weights in score calculation don't throw — they silently produce 0 via the `totalWeight > 0` guard (NaN > 0 is false). Infinity weights produce NaN through Infinity/Infinity division. Both should be rejected explicitly.
- **Red team test factories need the "valid default + adversarial override" pattern.** Building a `makeProfile()` that returns a fully valid object, then overriding one field per test, makes each test self-documenting: the override IS the attack vector.

## 2026-03-15 — ARGUS-9 Red Team Testing (Phase 2)

- **Case-insensitive normalization creates identity aliasing.** `RoutingRequestNormalizer` lowercases app/process/step, meaning "TestApp" and "testapp" share policies. If separate applications rely on case-distinct names, normalization merges them silently.
- **Config boundary validation is as important as input validation.** `ExplorationConfig.minimumRate: 1.0` forces permanent exploration. `maximumRate: 0.0` disables it completely — even during plateau. Configuration is a first-class attack surface.
- **Async methods must be awaited in tests.** `publisher.publish()` returns a Promise. Without `await`, handler side effects (like array pushes) may not have completed when assertions run. Always `await` async methods in vitest, even if the test appears synchronous.
- **Dead code in the type system signals incomplete implementation.** `superseded` status exists as an `AdaptationApprovalStatus` variant but is never set by any service method. `rollback_previewed` audit event type is defined but never emitted. These suggest planned-but-unfinished features that create false confidence in audit completeness.

## 2026-03-15 — ARGUS-9 Red Team Testing (Phase 3)

- **JavaScript truthiness bugs hide in plain sight.** `expireStale(maxAge)` uses `maxAge ? cutoff : expiresAt`. When `maxAge=0`, JavaScript treats 0 as falsy, so the function falls through to 24h expiry instead of "expire everything now." The fix is explicit: `maxAge !== undefined && maxAge !== null`. This is a general JavaScript hazard — any numeric parameter that can legitimately be 0 should use explicit null checks, not truthiness.
- **Decision-to-application gaps are systemic, not incidental.** Approval, rollback, and auto-apply services all create records but none actually mutate `FamilySelectionState`. The gap between "deciding to change" and "actually changing" exists in three independent subsystems, suggesting a missing orchestration layer rather than three individual bugs.
- **Authorization on governance actions cannot be deferred.** `approve()`, `reject()`, and `executeRollback()` all accept any string as actor. The assumption that "the API layer handles auth" means the domain services have zero defense against internal misuse, service-to-service calls, or compromised callers. Domain services should validate actor identity independently.
- **Mutable return values from ranking functions are a corruption vector.** `CandidateRanker.rankCandidates` returns objects that share references with the input. Mutating the output after ranking (e.g., changing a score) silently corrupts the ranking. Defensive copies or frozen objects prevent this class of bug.
- **Provider trust assumptions compound.** `LowRiskAutoApplyService` trusts three independent providers (risk, posture, failure counter) without cross-validation. If any single provider returns incorrect data, the entire auto-apply decision is wrong. Defense-in-depth means verifying provider outputs against observable family state.

## 2026-03-15 — ARGUS-9 Red Team Testing (Phase 4)

- **Composite IDs that use separators in values break round-trip parsing.** `buildCandidateId` joins with `:` but doesn't validate that component strings don't contain `:`. This means `parseCandidateId(buildCandidateId('a:b', 'c', 'd'))` throws. Any composite ID scheme needs either separator escaping or validated character sets.
- **Config validation is as critical as input validation — and easier to miss.** `PlateauDetectorConfig.mildThreshold: 0` means "always in plateau." `flatQualityVarianceThreshold: 1.0` means "almost everything is flat." These aren't bugs in the algorithm — they're bugs in the configuration boundary. Every configurable threshold needs bounds validation at construction time.
- **Negative numeric weights silently break scoring.** `calculateExecutionScore` with negative weights produces either zero (when totalWeight <= 0) or inverted contributions (when totalWeight > 0 but individual weights are negative). Neither behavior is documented or validated. Numeric domain invariants must be enforced at function boundaries.
- **Policy merge asymmetry creates blind spots.** Applications can block vendors and model profiles but cannot restrict tactics, override latency, or force escalation. This means application-level policies have holes that only process-level or instance-level policies can fill. Operators need to understand which policy layer controls which aspect.
- **No quality floor in adaptive selection is by design, not by accident.** The system selects a candidate with `rollingScore: 0` and `successRate: 0` when it's the only option. This is architecturally correct (something must be selected) but operationally dangerous. A configurable minimum quality threshold with fallback-to-deterministic would add a safety net.

## 2026-03-15 — ARGUS-9 Red Team Testing (Phase 5 — Extended Coverage)

- **`indexOf()` with unknown enum values returns -1, which compares less than all valid indices.** `ConfidenceEscalationResolver.shouldEscalate` uses `gradeOrder.indexOf(grade)`. An unknown grade returns -1, and since any valid index > -1, escalation is always recommended for unknown grades. Arrays should use `findIndex` with a validation guard.
- **Config threshold values assigned directly to output fields create out-of-range outputs.** `evaluateAndTune` sets `confidence = constraints.minConfidenceThreshold` when the computed confidence is below the threshold. If `minConfidenceThreshold > 1.0`, the output confidence exceeds 1.0. Domain invariants on outputs must be enforced independently of input validation.
- **IEEE 754 floating-point precision makes threshold boundaries unpredictable.** A mathematically exact slope of 0.02 can be represented as `0.020000000000000004` due to floating-point arithmetic in the linear regression. Using strict `>` comparison means the boundary behavior depends on float representation, not mathematical value. Consider epsilon-based comparison or `>=` for inclusive thresholds.
- **NaN is contagious in aggregate calculations.** A single `NaN` composite score in a sequence of execution scores corrupts the entire linear regression (sum becomes NaN, slope becomes NaN, trend becomes "stable" by fallthrough). Guard against NaN at input boundaries, not just at division points.

## 2026-03-15 — GRITS Implementation

- **Read-only verification systems must define their own repository interfaces.** GRITS defines `ExecutionRecordReadRepository`, `AuditEventReadRepository`, etc. rather than importing mutable repositories and hoping callers only use read methods. The type system enforces the read-only contract.
- **Multiple checkers sharing the same InvariantId creates Map collision in drift analysis.** The DriftAnalyzer uses `Map<InvariantId, InvariantCheckResult>`, so when ExecutionIntegrityChecker, BoundaryIntegrityChecker, and PolicyIntegrityChecker all produce INV-001 results, only the last one survives. Integration tests that compare drift direction must account for this.
- **Error isolation in checker execution is critical.** A checker that throws should produce `skip` status for its invariants, not crash the entire integrity run. The try/catch in IntegrityEngine ensures one bad checker doesn't prevent the other six from running.
- **Enum types from one package don't match string types from another.** `ProviderVendor` enum values from `@acds/core-types` don't satisfy `string` comparison when policy's `allowedVendors` is typed as `ProviderVendor[]`. Fix: use `String()` conversion or `Set<string>` for cross-package comparisons.
- **Module-level mutable counters (defect ID generation) persist across test runs in the same vitest process.** Defect IDs like `GRITS-EXEC-1` increment globally across tests. Tests should not assert on exact defect IDs — assert on defect existence, invariantId, and severity instead.
- **Secret pattern regex must be tested against realistic values.** The pattern `sk-[a-zA-Z0-9]{20,}` doesn't match `sk-proj-abc...` because the hyphen after `proj` breaks the alphanumeric run. Test data must use values that actually match the detection patterns.

## 2026-03-15 — GRITS Gap Closure

- **"Checking that something exists" is not "verifying correctness."** The original ExecutionIntegrityChecker validated that a routing decision existed for each execution. The spec required independently recomputing eligibility. Existence checks are auditing paperwork; independent recomputation is verification. These are categorically different depths of integrity checking.
- **Optional constructor parameters preserve backward compatibility during incremental deepening.** When closing gaps, new repository dependencies (PolicyRepository, AuditEventReadRepository, etc.) were added as optional parameters. This means existing code and tests continue to work without modification, and new capabilities activate only when dependencies are provided. This is especially valuable in a read-only verification system where adding a dependency should never break existing checks.
- **Proxy signals are better than no signals for architectural invariants.** The spec wanted boundary integrity to detect "layer collapse" (routing engine executing providers, optimizer mutating policy). True call-graph analysis isn't feasible at runtime. Audit event coherence — checking that action prefixes match expected resource types — is a proxy signal. It can detect symptom patterns without requiring full architectural introspection.
- **Secret scanning must follow data flow, not just audit infrastructure.** Secrets can appear in error messages (thrown by providers), in normalized output (returned by models), and in routing rationale summaries (computed by routing engine). Scanning only audit events misses the most common leak vectors. The scanning scope should match the data flow paths, not the audit infrastructure.
- **Actor attribution is a distinct concern from event existence.** An audit event that exists but has no actor is worse than no event at all — it creates a false sense of auditability. Separate checks for existence (does the event exist?) and attribution (who caused it?) catch different categories of audit trail deficiencies.
- **Terminal state verification catches asymmetric audit coverage.** A system might reliably produce "submission" audit events for approvals but miss "approved" or "rejected" events. Checking only for event existence (≥1 event per resource) misses this asymmetry. Terminal state checks ensure the most important transitions — the ones that change authorization state — are always audited.

## 2026-03-15 — Post-Review Hardening Pass

- **Fail-fast startup is better than a “healthy” process with dead routes.** If a service depends on a DI container, validate the container during boot rather than letting controllers crash lazily on first request.
- **Abstract IDs must not leak into provider calls.** A routing decision can safely expose `selectedModelProfileId`, but adapter execution must use the provider-native `modelId`. Control-plane identifiers and data-plane identifiers are different things.
- **If fallback is part of the contract, it has to live in the main path.** Testing a fallback service in isolation is not enough. The top-level execution flow must actually invoke it, or the documented resilience model is fiction.
- **Fixing a security bug in three places is a smell; extract the fourth place.** Shared redaction helpers are worth it once object redaction, record redaction, and error redaction start repeating the same credential patterns.
- **Red-team tests should flip from green to red after a fix.** A vulnerability-confirmation test passing after remediation usually means the implementation did not change enough. Re-running the adversarial specs is a useful sanity check even when the goal is for them to fail.

## 2026-03-15 — Standalone Startup Follow-Through

- **A fail-fast app still needs a default bootstrap path.** Tightening DI validation exposed a real gap: `buildApp()` was honest, but `main.ts` still had no way to satisfy it on its own. Hardening startup is only complete once the default entrypoint can actually wire the required services.
- **Workspace path aliases are helpful for repo-wide typechecking and dangerous for package-local emits.** Letting an app package inherit root alias resolution during `tsc` can silently turn a local build into a cross-package emit that sprays generated files into sibling `src` trees.
- **The right fix for package-local builds is dependency-first compilation, not bigger `rootDir`s.** Expanding the compiler boundary would have hidden the symptom while making the artifact shape worse. Building workspace dependencies first preserves package ownership and produces a cleaner standalone startup story.

## 2026-03-15 — Runtime Cleanliness Matters Too

- **A successful startup with warning spam is still an incomplete fix.** The standalone API was technically up, but Node was reparsing emitted files because package metadata did not match the compiled module format. That kind of noise makes real startup issues harder to spot.
- **If a monorepo compiles to ES modules, package metadata should say so everywhere that code is executed directly.** Fixing `"type": "module"` in only the top-level app would have left the same ambiguity in its runtime dependencies.
- **Retesting should include the real compiled entrypoint, not just `tsc` and unit coverage.** The ESM mismatch only showed up when running `node apps/api/dist/main.js`; it was invisible to typechecking alone.

## 2026-03-15 — Admin UI Operability Matters

- **A polished admin UI is still incomplete if it cannot open without an unavailable backend.** Adding mock mode turned the frontend into a dependable workspace for design, demos, and route-level QA even when the API or Postgres is offline.
- **Frontend mocks become genuinely valuable only when they mirror real API shapes.** The mock layer became much more useful once it covered approval, rollback, audit detail, execution detail, and provider mutation flows instead of only list screens.
- **Browser automation is an excellent accessibility reviewer.** The provider form looked correct visually, but Playwright exposed that labels were not actually bound to inputs. Fixing that improved automation reliability and keyboard/screen-reader usability at the same time.
- **Architecture docs should describe intentional exceptions, not idealized rules.** `admin-web` intentionally imports `@acds/core-types`; updating the boundary documentation was better than pretending the code still followed an older constraint.

## 2026-03-15 — Route-Level Coverage Catches a Different Class of Drift

- **Controller tests are not a substitute for real route tests.** The new admin APIs looked covered at the controller layer, but only Fastify injection verifies auth hooks, URL prefixes, alias routes, and presenter wiring together.
- **When framework overload types get in the way, cast at the boundary and keep assertions strict inside.** The Fastify inject helper was easier to keep maintainable once the overload friction was isolated to a tiny helper instead of spread across every test.

## 2026-03-15 — Red-Team Test Reconciliation After Hardening

- **Red-team tests that prove vulnerabilities must be flipped after fixes, not deleted.** When hardening closes a vulnerability, the red-team test that demonstrated it starts failing — it expects the vulnerable behavior that no longer exists. The correct response is to invert the assertions so the test now proves the fix works. Deleting the test loses the regression guard.
- **Failing red-team tests after a hardening pass is good news, not bad news.** 29 failures after fixing 29 vulnerabilities means exactly 29 fixes landed correctly. The failure count should match the fix count. If some tests still pass, the corresponding vulnerability was not actually fixed.
- **Test name and comment hygiene matters for future readers.** Renaming "accepts dangerous input" to "rejects dangerous input after hardening" and changing `// VULN:` to `// FIXED:` makes it immediately clear to future developers that these tests guard against regressions, not demonstrate active vulnerabilities. Without this, someone reading the test suite would reasonably believe the system is still vulnerable.
- **Assertion patterns differ by fix type.** Validation fixes (URL, actor, threshold) become `rejects.toThrow()` or `expect(errors.length).toBeGreaterThan(0)`. Behavioral fixes (state restoration, deduplication) become `expect(stateAfter).not.toEqual(stateBefore)` or `expect(count).toBe(expectedValue)`. Constructor-time validation becomes synchronous `expect(() => new Service(bad)).toThrow()`. Match the assertion style to the fix mechanism.

## 2026-03-15 — Post-Hardening Codebase Remediation

- **CRUD without DELETE is an incomplete contract.** Admin surfaces that support create/read/update but not delete cause permanent data accumulation. Every admin resource needs the full lifecycle or an explicit justification for why deletion is disallowed (like the global policy's 405 response).
- **Presenter data should be honest about what it knows.** `ExecutionRecordPresenter.toDetailView()` returning empty strings for `rationaleSummary` pretended to have data it didn't. Synthesizing a summary from available fields (family, provider, profiles, posture) is more useful than an empty string and more honest than fabricated data.
- **Redaction consolidation prevents pattern drift.** When `redactError.ts` and `sharedRedaction.ts` both had URL credential and `sk-` token patterns, they could evolve independently — one getting a fix while the other stays vulnerable. Single-source patterns eliminate this class of drift.
- **Form fields that derive values from user-visible labels cause silent mismatches.** Using `name` as `modelId` and deriving `vendor` from `localOnly` meant profile creation produced records that didn't match actual provider model identifiers. Explicit vendor/modelId fields make the mapping visible and controllable.

## 2026-03-15 — Apple Intelligence Provider Integration

- **The bridge pattern is the right abstraction for native-only APIs.** Apple's Foundation Models framework is Swift-native and macOS-only. Rather than trying FFI or WASM, a lightweight HTTP bridge on localhost follows the same pattern ACDS already uses for Ollama and LMStudio. The adapter code is identical in shape — only the endpoint paths and request/response shapes change. When adding a new local provider, check if the existing bridge pattern applies before inventing a new integration mechanism.
- **Local-only providers need defense in depth, not just validation.** The adapter validates loopback-only at config time, `LOCAL_VENDORS` enforces it at registration time, and GRITS invariants AI-001/AI-003 verify it continuously at runtime. Any one of these could have a bug. All three together make it very unlikely that an Apple provider accidentally points at a remote host.
- **GRITS invariant extension is additive and safe.** Adding `AI-001` through `AI-006` to the `InvariantId` union type required zero changes to existing checkers — TypeScript's union types are open for extension. The new checker slots into the existing engine by appearing in the handlers' checker arrays. Error isolation in `IntegrityEngine.ts` means a failing Apple checker cannot crash the other 7 checkers.
- **Stub implementations enable end-to-end development before the target platform is available.** Foundation Models requires macOS 26 which isn't GA yet, but the bridge scaffold with stub responses lets the adapter, GRITS checker, seed profiles, and admin UI all be developed and tested end-to-end. When the real API arrives, only `FoundationModelsWrapper.swift` changes — everything upstream is already proven.
- **Test config patterns need to grow with the app.** The vitest include pattern only covered `packages/*/src/**` and `tests/**`, missing `apps/*/src/**`. Adding a new test location means checking that the test runner actually finds it.

## 2026-03-16 — Apple Intelligence Bridge UI Dashboard

- **Direct bridge communication from the UI bypasses unnecessary abstraction layers.** The Apple Intelligence panels talk to `localhost:11435` directly rather than routing through the ACDS API. Since the bridge is always local and the admin UI is always local, adding an API proxy layer would add latency and failure modes without any security benefit. The mock API handlers provide a clean fallback when the bridge is not running.
- **Feature-specific panel decomposition scales better than monolithic pages.** Splitting the Apple Intelligence dashboard into BridgeHealthPanel, CapabilitiesPanel, and TestExecutionPanel keeps each concern isolated. Each panel can independently handle its own loading state, error state, and refresh cadence without coupling to the others.

## 2026-03-16 — Foundation Models Swift Bridge

- **Async-to-sync bridging in Swift requires deliberate choreography.** Foundation Models uses Swift concurrency (`async`/`await`) but Swift NIO's channel handlers are synchronous. The `DispatchSemaphore` + `Task` + `ResultBox` pattern solves this: launch an unstructured `Task` to call the async API, write the result to a thread-safe `ResultBox`, then signal the semaphore so the synchronous caller can proceed. This is not elegant but it is correct — blocking on a semaphore inside a NIO handler is acceptable because the bridge handles one request at a time on localhost.
- **CORS must be added proactively to any localhost service that a browser will contact.** The Swift NIO bridge initially rejected requests from the admin UI because browsers enforce same-origin policy even for `localhost` with different ports. Adding `Access-Control-Allow-Origin` and preflight `OPTIONS` handling is required for any HTTP service that a browser-hosted UI will call directly.
- **Real inference latency validates the integration more than any mock can.** Seeing 615ms for a classification task from the actual Apple Intelligence model confirmed the bridge works end-to-end in a way that mock responses never could. Always push for real integration testing when the target platform is available.

## 2026-03-16 — Stub Elimination Campaign

- **Properly typing the DI container pays compound dividends.** Adding a real `DiContainer` interface to `fastify.d.ts` eliminated ~30 `as any` casts across 10 route files in a single change. Each cast was a place where the compiler could not verify that the dependency actually existed. Typing the container once makes every route file safer and every future dependency addition checked at compile time.
- **Empty placeholder implementations are worse than missing implementations.** `EmptyAuditEventReader` and similar stubs compiled cleanly and returned empty arrays at runtime, creating a system that appeared functional but silently dropped data. A missing implementation would have caused a startup failure (caught immediately); an empty one caused silent data loss (caught much later, if ever).
- **Pipeline-internal state does not need persistence.** Worker pipeline handlers (scoring, aggregation, plateau detection, recommendations) process data within a single invocation. Making their state persistent would add latency and complexity without benefit — the data is derived from persistent sources and can be recomputed on every run. The distinction between "state that must survive restarts" and "state that flows through a single computation" should drive the persistence decision.
- **Nominal typing of private fields blocks structural compatibility in TypeScript.** `EnvAwareConnectionTester` wraps `ProviderConnectionTester` but TypeScript treats them as incompatible because the wrapped class has private fields that the wrapper does not replicate. This is one of the rare cases where an `as any` cast is the correct solution — the wrapper delegates all calls to the inner instance, but TypeScript's nominal treatment of private members prevents structural matching. Document these exceptions rather than hiding them.
- **Stub elimination is best done in dependency order.** Replacing stubs bottom-up (repositories first, then services that depend on them, then handlers that wire services) ensures each layer has real dependencies before its consumers are migrated. Replacing top-down risks connecting a real handler to a still-stubbed repository.
- **Replacing InMemory implementations used by tests requires dual exports, not wholesale replacement.** The grits-worker's `InMemoryExecutionRecordReadRepository` and siblings were replaced with Pg versions, but 14 integration tests imported the InMemory classes by name for deterministic testing. The correct pattern: keep the InMemory class exported for test use alongside the Pg class for production. Tests should never depend on database connectivity.
- **Interface drift between domain packages and persistence packages creates subtle incompatibilities.** `PgPolicyRepository` implemented its own `PolicyRepository` interface (with `findApplicationPolicy`) while the canonical interface in `@acds/policy-engine` used `getApplicationPolicy`. Both compiled independently, but when wired together through the grits-worker, structural typing revealed the mismatch. Persistence implementations should import and implement the canonical domain interface, or provide alias methods for compatibility.
