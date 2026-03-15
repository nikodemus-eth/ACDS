# Model Profiles and Tactic Profiles

## Model Profiles
Model profiles represent abstract cognitive capabilities rather than specific models.

Example profiles:
- local_fast_advisory
- local_balanced_reasoning
- local_strict_classifier
- cloud_frontier_reasoning
- cloud_frontier_creative
- cloud_cost_optimized_analysis

Profiles map internally to specific providers and models. This abstraction prevents vendor lock-in.

## Tactic Profiles
Tactic profiles define how a cognitive task is executed, independent of model choice.

Examples:
- single_pass_fast
- draft_then_critique
- extract_then_reason
- reason_then_structure
- local_triage_then_cloud_finalize
- dual_model_crosscheck
- strict_json_with_repair

The adaptive system may change tactics even when using the same model profile.
