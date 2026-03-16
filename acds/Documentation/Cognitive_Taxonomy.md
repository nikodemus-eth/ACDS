# Cognitive Taxonomy

## Task Types
The system defines a controlled vocabulary describing the type of cognition required:
- creative
- analysis
- decision_support
- classification
- extraction
- summarization
- transformation
- critique
- planning
- retrieval_synthesis

These types guide model profile eligibility.

## Load Classification

### Simple
- Narrow scope, small context window, deterministic outcome, minimal reasoning depth
- Examples: classification, schema validation, short extraction

### Moderate
- Multiple constraints, moderate synthesis, medium context size
- Examples: summarization, structured transformation, moderate analysis

### Complex
- Long context windows, high ambiguity, multi-step reasoning, cross-document synthesis
- Examples: policy interpretation, strategic analysis, research synthesis

## Decision Posture
Describes the operational intent of the step:
- exploratory
- advisory
- draft
- review
- final
- strict
- evidentiary

Example: A Thingstead governance decision may run first as advisory and later as final.

## Cognitive Grade
Describes the quality threshold required for output:
- utility — quick internal answers
- working — functional output
- strong — reliable output
- final — formal decision support
- evidentiary — governance-critical reasoning
