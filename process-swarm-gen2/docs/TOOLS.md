# Tool Adapter Framework

The tool adapter framework provides a uniform interface for every discrete
operation in a swarm pipeline. Each adapter wraps a single capability --
collecting sources, validating URLs, formatting reports -- behind a common
abstract contract.

Source files:

- `swarm/tools/base.py` -- `ToolContext`, `ToolResult`, `ToolAdapter` ABC
- `swarm/tools/registry.py` -- `AdapterRegistry`
- `swarm/tools/adapters/` -- 15 built-in adapter implementations

---

## ToolAdapter ABC

Every adapter extends `ToolAdapter` and must implement two members:

```python
class ToolAdapter(ABC):

    @property
    @abstractmethod
    def tool_name(self) -> str:
        """Return the tool_name matching the tool_registry entry."""
        ...

    @abstractmethod
    def execute(self, ctx: ToolContext) -> ToolResult:
        """Execute the tool with the given context."""
        ...
```

### Optional Override

```python
def validate_inputs(self, ctx: ToolContext) -> list[str]:
```

Returns a list of error strings. An empty list means inputs are valid. The
default implementation always returns `[]`.

### Static Helper

```python
@staticmethod
def find_prior_output(ctx: ToolContext, key: str) -> Any:
```

Searches `ctx.prior_results` (a dict of step-name to output-dict) for the
first occurrence of `key` across all upstream steps. Returns the value if
found, `None` otherwise. This is the primary mechanism for step-to-step data
flow (see "The `find_prior_output` Pattern" below).

---

## ToolContext

`ToolContext` is a dataclass that carries everything an adapter needs to
execute:

| Field | Type | Description |
|-------|------|-------------|
| `run_id` | `str` | Unique identifier for this pipeline run |
| `swarm_id` | `str` | Identifier of the swarm executing the pipeline |
| `action` | `dict` | The step-specific action configuration from the process definition |
| `workspace_root` | `Path` | Root directory for all file I/O during this run |
| `repo` | `Any` | Repository handle (git repo or similar) |
| `prior_results` | `dict` | Map of upstream step names to their `output_data` dicts |
| `config` | `dict` | Adapter-specific configuration (thresholds, format options, etc.) |

---

## ToolResult

`ToolResult` is a dataclass that every `execute()` call must return:

| Field | Type | Description |
|-------|------|-------------|
| `success` | `bool` | Whether the operation completed without error |
| `output_data` | `dict` | Structured output consumed by downstream steps via `find_prior_output` |
| `artifacts` | `list[str]` | File paths of artifacts produced (manifests, reports, etc.) |
| `error` | `str \| None` | Error message on failure, `None` on success |
| `metadata` | `dict` | Operational metadata such as `duration_ms` |
| `warnings` | `list[str]` | Non-fatal warnings (default empty list) |

---

## AdapterRegistry

`AdapterRegistry` maps tool names (strings) to adapter instances.

| Method | Description |
|--------|-------------|
| `register(adapter)` | Register an adapter instance. Raises `ValueError` if the name is already taken. |
| `get_adapter(tool_name)` | Look up an adapter by name. Returns `None` if not found. |
| `has_adapter(tool_name)` | Check whether an adapter is registered. |
| `list_adapters()` | Return a sorted list of all registered tool names. |
| `create_default()` (classmethod) | Instantiate a registry pre-loaded with all 15 built-in adapters from `swarm.tools.adapters.ALL_ADAPTERS`. |

Usage:

```python
registry = AdapterRegistry.create_default()
adapter = registry.get_adapter("source_collector")
result = adapter.execute(ctx)
```

---

## OpenShell Governed Commands

Commands registered in the OpenShell layer (`swarm/openshell/`) bypass
the `ToolAdapter` pipeline and instead pass through the 8-stage governed
execution pipeline: normalize → validate → policy → scope → plan →
execute → emit → ledger.

OpenShell commands are **not** `ToolAdapter` subclasses. They use their
own adapter interface (`execute_command(envelope, workspace, prior)`)
and are dispatched by the `OpenShellDispatcher`.

The `SwarmRunner` checks `openshell.handles(tool_name)` before falling
through to the standard `AdapterRegistry`:

```python
if self.openshell and self.openshell.handles(tool_name):
    cmd_result = dispatcher.execute(...)
    result = OpenShellDispatcher.to_tool_result(cmd_result)
else:
    adapter = self.adapter_registry.get_adapter(tool_name)
    result = adapter.execute(ctx)
```

### Registered OpenShell Commands

| Command | Side Effect | Adapter |
|---------|-------------|---------|
| `filesystem.read_file` | read_only | `FilesystemAdapter` |
| `filesystem.write_file` | local_mutation | `FilesystemAdapter` |
| `filesystem.list_dir` | read_only | `FilesystemAdapter` |
| `report.render_markdown` | controlled_generation | `ReportAdapter` |
| `http.fetch_whitelisted` | external_action | `HttpAdapter` |
| `tts.generate` | controlled_generation | `TtsAdapter` (stub) |

Command specs live in `swarm/openshell/command_specs/*.json` with
versioned JSON Schema validation (`additionalProperties: false`).

---

## The 15 Built-in Adapters

The adapters are listed here in pipeline execution order, which matches the
`ALL_ADAPTERS` list in `swarm/tools/adapters/__init__.py`.

### 1. `run_manager` -- RunManagerAdapter

Creates the workspace directory structure (`sources/`, `output/`,
`artifacts/`) and writes a `run_manifest.json` containing run ID, swarm ID,
timestamp, and configuration.

### 2. `policy_loader` -- PolicyLoaderAdapter

Loads the swarm policy from the workspace's `policies/` directory. Looks for
`swarm_policy.json` first, then falls back to any `.json` file. Outputs the
parsed policy dict for downstream steps.

### 3. `source_collector` -- SourceCollectorAdapter

Collects source data from mock fixtures (`fixtures/mock_sources.json`) or
from URLs specified in the action config. Writes each source as a JSON file
and produces a `source_manifest.json`.

### 4. `url_validator` -- UrlValidatorAdapter

Validates collected source URLs. Enforces `http`/`https` schemes only and
blocks SSRF-prone hosts (`localhost`, `127.0.0.1`, `169.254.169.254`, `[::1]`,
`0.0.0.0`). Separates sources into `valid_sources` and `invalid_sources`.

### 5. `freshness_filter` -- FreshnessFilterAdapter

Filters sources by age. Compares `published_date` or `collected_at` timestamps
against a configurable `max_age_days` threshold (default 365). Separates
sources into `fresh_sources` and `stale_sources`.

### 6. `source_normalizer` -- SourceNormalizerAdapter

Cleans source content by stripping HTML tags and truncating to a configurable
`max_chars` limit (default 50,000). Emits warnings for truncated sources.

### 7. `section_mapper` -- SectionMapperAdapter

Maps normalized sources to report sections by their `category_id` or
`category` tag. Configurable section order defaults to `["summary",
"analysis", "recommendations"]`. Unmapped sources are distributed round-robin
across sections.

### 8. `synthesis_brief_builder` -- SynthesisBriefBuilderAdapter

Builds a synthesis brief for each report section. Each brief contains the
section name, source count, source names, content snippets (first 500 chars
each), and per-section instructions from the policy.

### 9. `probabilistic_synthesis` -- ProbabilisticSynthesisAdapter

Synthesizes section content from briefs. Combines source snippets into section
bodies and computes a content hash (SHA-256, first 12 hex chars) for each
section. In the current implementation this uses deterministic placeholder
logic.

### 10. `report_formatter` -- ReportFormatterAdapter

Formats synthesized sections into a final report document. Supports markdown
(default) and plain text formats. Writes the report to `output/report.md` (or
`.txt`) and exposes both the file path and content in `output_data`.

### 11. `bundle_builder` -- BundleBuilderAdapter

Bundles the report and any other artifacts into a delivery package. Reads the
`report_path` from prior results, collects files into `output/`, and writes a
`bundle_manifest.json`.

### 12. `citation_validator` -- CitationValidatorAdapter

Validates that numeric citations in the report (e.g., `[1]`, `[2]`) reference
real sources. Extracts citation IDs with a regex, checks them against the
source count, and reports any invalid references.

### 13. `rule_validator` -- RuleValidatorAdapter

Validates the report against configurable constraint rules: minimum character
count (`min_chars`), maximum character count (`max_chars`), and required
section headings (`required_sections`). Outputs `all_passed` and a list of
`issues`.

### 14. `decision_engine` -- DecisionEngineAdapter

Makes a go/no-go delivery decision based on upstream quality signals. Checks
`all_passed` from the rule validator, `violations`, and `invalid_ids` from
citation validation. Supports a `force_deliver` config override. Outputs
`"go"` or `"no_go"` with a reason.

### 15. `delivery_engine` -- DeliveryEngineAdapter

Triggers delivery of the bundle through a configured channel (default
`"local"`). Checks the decision engine's verdict first -- a `"no_go"` blocks
delivery entirely. On success, outputs a delivery receipt with run ID,
channel, and bundle path.

---

## Integration with ToolGate

The ToolGate (`runtime/gate/toolgate.py`) is a default-deny capability
mediator that sits between the pipeline executor and the adapters. Before an
adapter can perform filesystem I/O, generate artifacts, or modify a
repository, the executor must check ToolGate authorization.

ToolGate enforces five capabilities:

| Capability | Lease Key | Description |
|------------|-----------|-------------|
| `FILESYSTEM_READ` | `filesystem` | Read files within allowed paths |
| `FILESYSTEM_WRITE` | `filesystem` (requires `write: true`) | Write files within allowed paths |
| `TEST_EXECUTION` | `test_execution` | Run tests |
| `ARTIFACT_GENERATION` | `artifact_generation` | Produce output artifacts |
| `REPOSITORY_MODIFICATION` | `repository_modification` | Modify repository contents |

Authorization flow:

1. A capability lease (signed by `lease_issuer_signer`) is bound to the
   ToolGate via `bind_lease()`. The lease must have `revocation_status:
   "active"` and valid time bounds.
2. Before each adapter executes, the executor calls
   `toolgate.authorize(capability, target_path)`.
3. ToolGate checks: lease presence, time bounds, explicit denials, capability
   grants, and path scope constraints.
4. If authorized, the adapter proceeds. If denied, execution is blocked with a
   `CapabilityDecision` explaining the reason.

When a lease expires or is unbound, ToolGate reverts to default-deny -- no
adapter can perform any gated operation.

---

## The `find_prior_output` Pattern

Step-to-step data flow is the central design pattern of the adapter framework.
Rather than passing data through function arguments or shared mutable state,
each adapter publishes results in its `ToolResult.output_data` dict, and
downstream adapters retrieve what they need via `find_prior_output`.

Example chain:

```
source_collector  --> output_data["sources"] = [...]
     |
url_validator     --> find_prior_output(ctx, "sources")
     |                output_data["valid_sources"] = [...]
     |
freshness_filter  --> find_prior_output(ctx, "sources")
                      output_data["fresh_sources"] = [...]
```

The `decision_engine` adapter demonstrates a more complex lookup -- it
searches for `all_passed`, `issues`, `violations`, and `invalid_ids` across
all prior steps to assemble a composite quality signal.

Key characteristics:

- **Decoupled**: Adapters do not import or reference each other. They only
  agree on key names.
- **Order-independent lookup**: `find_prior_output` iterates all upstream
  results, so an adapter does not need to know which specific step produced a
  value.
- **Fallback chains**: Adapters commonly check `ctx.action` first (explicit
  override), then fall back to `find_prior_output` (automatic wiring).
