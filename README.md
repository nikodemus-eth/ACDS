# Adaptive Cognitive Dispatch System

This repository is an ACDS-first workspace.

- `acds/` is the supported MVP product surface: API, admin UI, workers, policy/routing/runtime packages, and the GRITS release gate.
- `process-swarm-gen2/` is a secondary companion integration that demonstrates how ACDS can be used from a larger workflow engine.
- ACDS requires Node `>=20.0.0` and `pnpm >=9.0.0`. `npm install` is not a supported alternative because the workspace depends on `workspace:*` linking.

Start with [acds/README.md](acds/README.md). That is the canonical product README for setup, operations, and supported scope.

## Install Contract

From the repository root:

```bash
cd acds
corepack enable
corepack prepare pnpm@9.15.0 --activate
pnpm run bootstrap
```

Use `pnpm run verify:install` any time you want to confirm the workspace links and typechecks cleanly.

## Public MVP Boundary

- Product identity: ACDS-first
- License: [MIT](LICENSE)
- Canonical setup and usage: [acds/README.md](acds/README.md)
- MVP boundary: [acds/docs/MVP_BOUNDARY.md](acds/docs/MVP_BOUNDARY.md)
- Operator path: [acds/docs/operator/MVP_OPERATOR_GUIDE.md](acds/docs/operator/MVP_OPERATOR_GUIDE.md)
- Runtime traceability: [acds/docs/architecture/RUNTIME_TRACEABILITY.md](acds/docs/architecture/RUNTIME_TRACEABILITY.md)
- Release checklist: [docs/release/CHECKLIST.md](docs/release/CHECKLIST.md)

## Repository Layout

- `acds/` - Adaptive Cognitive Dispatch System
- `process-swarm-gen2/` - Example companion integration for Process Swarm

## Release Notes

- Initial MVP release notes: [docs/release/v0.1.0.md](docs/release/v0.1.0.md)
