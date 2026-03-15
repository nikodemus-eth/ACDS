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
