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

## ACDS Integration (Optional)

To enable LLM-backed inference through ACDS, set these environment variables:

```bash
# Enable ACDS inference (default is "rules" — pure keyword matching)
export INFERENCE_PROVIDER=acds

# ACDS dispatch API URL (default: http://localhost:3000)
export ACDS_BASE_URL=http://localhost:3000

# Optional: authentication token for ACDS
export ACDS_AUTH_TOKEN=your-token-here

# Optional: request timeout in seconds (default: 30)
export ACDS_TIMEOUT_SECONDS=30
```

When `INFERENCE_PROVIDER=rules` (the default), the system uses deterministic keyword-matching for archetype classification and constraint extraction. No ACDS server is required.

When `INFERENCE_PROVIDER=acds`, the definer pipeline sends classification and extraction prompts to ACDS, which routes them to the best available model. If ACDS is unreachable, the system falls back to rules automatically.

## Verify Installation

```bash
# Verify imports work
python -c "import runtime; import swarm; import process_swarm; print('Imports OK')"

# Run tests
pytest tests/ -v

# Run with coverage
pytest tests/ --cov=runtime --cov=swarm --cov=process_swarm --cov-report=term-missing

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
├── process_swarm/    # Job authoring + ACDS integration
│   ├── acds_client.py   # Python ACDS dispatch client
│   ├── inference.py     # InferenceProvider protocol
│   ├── config.py        # Environment-based configuration
│   ├── scripts/         # Job authoring pipeline scripts
│   ├── classes/         # Job class definitions
│   ├── extraction/      # Parameter extraction
│   └── planner/         # Execution planning
├── tests/            # Test suite (1706 tests, 100% coverage)
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
