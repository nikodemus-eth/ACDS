# Process Swarm Gen 2 — MacOS Installation

## Prerequisites

- macOS 13+ (Ventura or later recommended)
- Python 3.9+ (3.12+ recommended)
- Homebrew (for system dependencies)

## System Dependencies

```bash
# Install Python if needed
brew install python@3.12

# Install libsodium (required by pynacl for Ed25519 signing)
brew install libsodium
```

## Project Setup

```bash
# Clone or navigate to the project
cd "/Users/m4/Process Swarm Gen 2"

# Create virtual environment
python3 -m venv .venv

# Activate virtual environment
source .venv/bin/activate

# Install project dependencies
pip install -e ".[dev]"
```

## Verify Installation

```bash
# Verify imports work
python -c "import runtime; import swarm; print('Imports OK')"

# Run tests
pytest tests/ -v

# Run red-team tests only
pytest tests/ -m redteam -v
```

## Directory Structure

```
Process Swarm Gen 2/
├── runtime/          # Governed execution kernel
│   ├── identity/     # Ed25519 key management & signing
│   ├── schemas/      # JSON Schema validation
│   ├── validation/   # Behavior proposal validation
│   ├── compiler/     # Execution plan compilation
│   ├── lease/        # Capability leasing
│   ├── gate/         # ExecutionGate + ToolGate
│   ├── executor/     # File operations + test execution
│   ├── ledger/       # Append-only execution records
│   ├── exchange/     # M2 artifact ingress
│   ├── pipeline/     # PipelineRunner orchestrator
│   ├── proposal/     # Proposal loading
│   └── bridge/       # Runtime bridge translation
├── swarm/            # Process automation platform
├── tests/            # Test suite
├── schemas/          # JSON Schema definitions
└── docs/             # Documentation & logs
```

## Key Management

On first run, the identity system generates Ed25519 keypairs for 5 signer roles. Keys are stored in `runtime/identity/keys/` with 0o600 permissions. This directory is gitignored.

## Troubleshooting

### `ImportError: No module named 'nacl'`
Run `pip install pynacl>=1.6.0`. If build fails, ensure libsodium is installed: `brew install libsodium`.

### `ModuleNotFoundError: No module named 'runtime'`
Ensure you're running from the project root and `pythonpath=["."]` is set in pyproject.toml. Activate the venv: `source .venv/bin/activate`.
