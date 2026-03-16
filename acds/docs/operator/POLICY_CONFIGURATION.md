# Policy Configuration

ACDS uses a three-level policy cascade to control routing behavior. Policies at lower levels override policies at higher levels, allowing fine-grained control without losing sensible defaults.

## Cascade Order

```
Global Policy          (system-wide baseline)
    |
    v  overridden by
Application Policy     (per-application overrides)
    |
    v  overridden by
Process Policy         (per-process and per-step overrides)
```

The `PolicyMergeResolver` combines these layers into an `EffectivePolicy` for each routing request. The merge rule is: for any field, the most specific non-null value wins. If a process policy sets `privacyOverride` to `local_only`, that takes precedence over the application and global defaults.

## Global Policy

The global policy defines the system-wide baseline. There is exactly one active global policy.

### Fields

| Field                              | Description                                                              |
| ---------------------------------- | ------------------------------------------------------------------------ |
| `allowedVendors`                   | Vendors that may be used system-wide                                     |
| `blockedVendors`                   | Vendors that are prohibited system-wide                                  |
| `defaultPrivacy`                   | Default privacy mode: `local_only`, `cloud_allowed`, `cloud_preferred`   |
| `defaultCostSensitivity`           | Default cost sensitivity: `low`, `medium`, `high`                        |
| `structuredOutputRequiredForGrades` | Cognitive grades that require structured output                         |
| `traceabilityRequiredForGrades`    | Cognitive grades that require full traceability                          |
| `maxLatencyMsByLoadTier`           | Maximum acceptable latency per load tier (ms)                            |
| `localPreferredTaskTypes`          | Task types that should prefer local providers when available             |
| `cloudRequiredLoadTiers`           | Load tiers that require cloud providers (local cannot handle the load)   |
| `enabled`                          | Whether the global policy is active                                      |

### Example

A global policy that allows all vendors, prefers local execution, and requires structured output for high-grade tasks:

```json
{
  "allowedVendors": ["ollama", "lmstudio", "gemini", "openai"],
  "blockedVendors": [],
  "defaultPrivacy": "local_only",
  "defaultCostSensitivity": "medium",
  "structuredOutputRequiredForGrades": ["expert", "frontier"],
  "traceabilityRequiredForGrades": ["frontier"],
  "maxLatencyMsByLoadTier": {
    "low": 30000,
    "medium": 15000,
    "high": 5000,
    "critical": 2000
  },
  "localPreferredTaskTypes": ["generation", "classification", "summarization"],
  "cloudRequiredLoadTiers": ["critical"]
}
```

## Application Policy

Application policies provide per-application overrides. Each application (identified by name, e.g., `thingstead` or `process_swarm`) can have one active application policy.

### Fields

| Field                              | Description                                                        |
| ---------------------------------- | ------------------------------------------------------------------ |
| `application`                      | The application this policy applies to                             |
| `allowedVendors`                   | Override allowed vendors (null = inherit global)                   |
| `blockedVendors`                   | Override blocked vendors (null = inherit global)                   |
| `privacyOverride`                  | Override privacy mode (null = inherit global)                      |
| `costSensitivityOverride`          | Override cost sensitivity (null = inherit global)                  |
| `preferredModelProfileIds`         | Model profiles to prefer for this application                     |
| `blockedModelProfileIds`           | Model profiles to block for this application                      |
| `localPreferredTaskTypes`          | Override local-preferred task types (null = inherit global)        |
| `structuredOutputRequiredForGrades` | Override structured output requirements (null = inherit global)   |
| `enabled`                          | Whether this application policy is active                          |

### Example

An application policy for Thingstead that restricts to local-only execution and blocks OpenAI:

```json
{
  "application": "thingstead",
  "allowedVendors": ["ollama", "lmstudio"],
  "blockedVendors": ["openai"],
  "privacyOverride": "local_only",
  "costSensitivityOverride": null,
  "preferredModelProfileIds": ["local_fast_advisory"],
  "blockedModelProfileIds": null,
  "enabled": true
}
```

## Process Policy

Process policies provide the most granular control, applying to a specific process within an application and optionally to a specific step within that process.

### Fields

| Field                         | Description                                                          |
| ----------------------------- | -------------------------------------------------------------------- |
| `application`                 | The application this policy applies to                               |
| `process`                     | The process within the application                                   |
| `step`                        | The step within the process (null = applies to all steps)            |
| `defaultModelProfileId`       | Default model profile for this process/step                          |
| `defaultTacticProfileId`      | Default tactic profile for this process/step                         |
| `allowedModelProfileIds`      | Restrict to specific model profiles (null = no restriction)          |
| `blockedModelProfileIds`      | Block specific model profiles (null = no blocks)                     |
| `allowedTacticProfileIds`     | Restrict to specific tactic profiles (null = no restriction)         |
| `privacyOverride`             | Override privacy mode (null = inherit from application/global)       |
| `costSensitivityOverride`     | Override cost sensitivity (null = inherit from application/global)   |
| `forceEscalationForGrades`    | Cognitive grades that force escalation to a higher-capability model  |
| `enabled`                     | Whether this process policy is active                                |

### Example

A process policy that forces cloud providers for the `content_review` process in Process Swarm, and uses `draft_then_critique` tactic for the `final_review` step:

```json
{
  "application": "process_swarm",
  "process": "content_review",
  "step": null,
  "privacyOverride": "cloud_preferred",
  "defaultModelProfileId": "cloud_frontier_reasoning",
  "defaultTacticProfileId": null,
  "enabled": true
}
```

```json
{
  "application": "process_swarm",
  "process": "content_review",
  "step": "final_review",
  "defaultTacticProfileId": "draft_then_critique",
  "forceEscalationForGrades": ["expert", "frontier"],
  "enabled": true
}
```

## How the Cascade Works

When a routing request arrives for `process_swarm / content_review / final_review`:

1. The global policy provides the baseline (all vendors allowed, `local_only` default, medium cost sensitivity).
2. No application policy exists for `process_swarm` in this example, so global defaults carry through.
3. The process-level policy for `content_review` overrides privacy to `cloud_preferred` and sets the default model profile to `cloud_frontier_reasoning`.
4. The step-level policy for `final_review` adds the `draft_then_critique` tactic default and forces escalation for expert/frontier grades.

The `PolicyMergeResolver` merges these layers into a single `EffectivePolicy` that the routing engine uses for eligibility computation and selection.

## Conflict Detection

The `PolicyConflictDetector` identifies conflicts between policy layers, such as:

- A process policy allowing a vendor that the global policy blocks
- A process policy setting a default model profile that the application policy blocks
- Contradictory privacy settings across layers

Conflicts are reported as `PolicyConflict` objects and surfaced in the admin UI. The `PolicyValidator` also validates individual policies for internal consistency before they are saved.
