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
