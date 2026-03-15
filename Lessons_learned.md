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
