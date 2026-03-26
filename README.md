# ACDS + Process Swarm Integration

This repository contains two related systems:

- `acds/`: Adaptive Cognitive Dispatch System, the primary MVP product. It provides governed AI routing, execution orchestration, auditability, an admin UI, and worker services.
- `process-swarm-gen2/`: Process Swarm Gen 2, a companion automation platform that can integrate with ACDS for inference routing and execution tracking.

## MVP Scope

For an MVP release, the main product surface is `acds/`.

Use `process-swarm-gen2/` when you want an example or companion application that exercises ACDS integration in a larger workflow engine.

## Quick Start

### ACDS

```bash
cd acds
pnpm install
cp .env.example .env
pnpm test
pnpm typecheck
pnpm build
```

Primary entry points:

- `acds/apps/api`
- `acds/apps/admin-web`
- `acds/apps/worker`
- `acds/apps/grits-worker`

### Process Swarm Gen 2

```bash
cd process-swarm-gen2
python -m pip install -e .[dev]
pytest tests/test_process_swarm tests/test_integration/test_acds_client.py -q
```

## Repository Validation

GitHub Actions runs from the repository root and validates:

- `acds/` workspace install, test, typecheck, and build
- `process-swarm-gen2/` Python smoke tests

## Documentation

- ACDS overview: [acds/README.md](acds/README.md)
- Process Swarm architecture: [process-swarm-gen2/docs/ARCHITECTURE.md](process-swarm-gen2/docs/ARCHITECTURE.md)
- ACDS/Process Swarm integration notes: [process-swarm-gen2/docs/acds_process_swarm_integration.md](process-swarm-gen2/docs/acds_process_swarm_integration.md)
