"""Action table templates per swarm archetype.

Each archetype has a base action skeleton with specialization hints
that guide 1:1 or 1:N expansion during the pipeline.
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class TemplateAction:
    name: str
    action_type: str
    description: str
    specialization_hint: str = ""


@dataclass(frozen=True)
class ArchetypeTemplate:
    version: str
    description: str
    base_actions: tuple[TemplateAction, ...]
    default_dependencies: tuple[tuple[int, int], ...] = ()


ARCHETYPE_TEMPLATES: dict[str, ArchetypeTemplate] = {
    "scheduled_structured_report": ArchetypeTemplate(
        version="1.0",
        description="Recurring report with source collection, synthesis, and delivery",
        base_actions=(
            TemplateAction("collect_sources", "collect", "Gather source materials"),
            TemplateAction("normalize_sources", "transform", "Normalize source data"),
            TemplateAction("filter_freshness", "filter", "Filter by freshness window"),
            TemplateAction("map_sections", "transform", "Map content to report sections",
                           "expand based on constraint sections"),
            TemplateAction("validate_citations", "validate", "Validate source citations"),
            TemplateAction("synthesize_content", "generate", "Synthesize report content",
                           "expand based on constraint sections"),
            TemplateAction("build_synthesis_brief", "generate", "Build synthesis brief"),
            TemplateAction("decide_format", "decide", "Choose output format"),
            TemplateAction("format_report", "generate", "Format final report"),
            TemplateAction("validate_report", "validate", "Validate report structure"),
            TemplateAction("validate_rules", "validate", "Validate against policy rules"),
            TemplateAction("bundle_output", "package", "Bundle output artifacts"),
            TemplateAction("deliver_report", "deliver", "Deliver report to recipients"),
            TemplateAction("record_delivery", "record", "Record delivery receipt"),
            TemplateAction("update_run_status", "lifecycle", "Update run status"),
        ),
        default_dependencies=(
            (1, 0), (2, 1), (3, 2), (4, 3), (5, 4), (6, 5),
            (7, 6), (8, 7), (9, 8), (10, 9), (11, 10), (12, 11),
            (13, 12), (14, 13),
        ),
    ),
    "structured_report": ArchetypeTemplate(
        version="1.0",
        description="One-time report with source collection and synthesis",
        base_actions=(
            TemplateAction("collect_sources", "collect", "Gather source materials"),
            TemplateAction("normalize_sources", "transform", "Normalize source data"),
            TemplateAction("filter_freshness", "filter", "Filter by freshness window"),
            TemplateAction("map_sections", "transform", "Map content to report sections",
                           "expand based on constraint sections"),
            TemplateAction("validate_citations", "validate", "Validate source citations"),
            TemplateAction("synthesize_content", "generate", "Synthesize report content",
                           "expand based on constraint sections"),
            TemplateAction("build_synthesis_brief", "generate", "Build synthesis brief"),
            TemplateAction("format_report", "generate", "Format final report"),
            TemplateAction("validate_report", "validate", "Validate report structure"),
            TemplateAction("validate_rules", "validate", "Validate against policy rules"),
            TemplateAction("bundle_output", "package", "Bundle output artifacts"),
            TemplateAction("update_run_status", "lifecycle", "Update run status"),
        ),
        default_dependencies=(
            (1, 0), (2, 1), (3, 2), (4, 3), (5, 4), (6, 5),
            (7, 6), (8, 7), (9, 8), (10, 9), (11, 10),
        ),
    ),
    "software_build": ArchetypeTemplate(
        version="1.0",
        description="Software build and packaging",
        base_actions=(
            TemplateAction("collect_sources", "collect", "Gather source code"),
            TemplateAction("validate_sources", "validate", "Validate source integrity"),
            TemplateAction("compile_code", "build", "Compile source code"),
            TemplateAction("run_tests", "test", "Run test suite"),
            TemplateAction("package_artifacts", "package", "Package build artifacts"),
            TemplateAction("validate_package", "validate", "Validate package integrity"),
            TemplateAction("update_run_status", "lifecycle", "Update run status"),
        ),
        default_dependencies=(
            (1, 0), (2, 1), (3, 2), (4, 3), (5, 4), (6, 5),
        ),
    ),
    "communication_artifact": ArchetypeTemplate(
        version="1.0",
        description="Email or notification composition and delivery",
        base_actions=(
            TemplateAction("collect_context", "collect", "Gather context for message"),
            TemplateAction("compose_message", "generate", "Compose message content"),
            TemplateAction("validate_message", "validate", "Validate message content"),
            TemplateAction("resolve_recipients", "resolve", "Resolve recipient list"),
            TemplateAction("deliver_message", "deliver", "Deliver message"),
            TemplateAction("record_delivery", "record", "Record delivery receipt"),
            TemplateAction("update_run_status", "lifecycle", "Update run status"),
        ),
        default_dependencies=(
            (1, 0), (2, 1), (3, 2), (4, 3), (5, 4), (6, 5),
        ),
    ),
    "monitoring_workflow": ArchetypeTemplate(
        version="1.0",
        description="Health check or monitoring workflow",
        base_actions=(
            TemplateAction("collect_targets", "collect", "Identify monitoring targets"),
            TemplateAction("run_checks", "test", "Run health checks"),
            TemplateAction("evaluate_results", "decide", "Evaluate check results"),
            TemplateAction("format_status", "generate", "Format status report"),
            TemplateAction("deliver_alerts", "deliver", "Deliver alerts if needed"),
            TemplateAction("record_results", "record", "Record monitoring results"),
            TemplateAction("update_run_status", "lifecycle", "Update run status"),
        ),
        default_dependencies=(
            (1, 0), (2, 1), (3, 2), (4, 3), (5, 4), (6, 5),
        ),
    ),
    "delivery_workflow": ArchetypeTemplate(
        version="1.0",
        description="Artifact packaging and delivery",
        base_actions=(
            TemplateAction("collect_artifacts", "collect", "Collect artifacts for delivery"),
            TemplateAction("validate_artifacts", "validate", "Validate artifact integrity"),
            TemplateAction("bundle_delivery", "package", "Bundle for delivery"),
            TemplateAction("deliver_bundle", "deliver", "Deliver bundle"),
            TemplateAction("record_delivery", "record", "Record delivery receipt"),
            TemplateAction("update_run_status", "lifecycle", "Update run status"),
        ),
        default_dependencies=(
            (1, 0), (2, 1), (3, 2), (4, 3), (5, 4),
        ),
    ),
    "document_generation": ArchetypeTemplate(
        version="1.0",
        description="Document or specification generation",
        base_actions=(
            TemplateAction("generate_document", "generate", "Generate document content"),
            TemplateAction("validate_document", "validate", "Validate document"),
        ),
        default_dependencies=((1, 0),),
    ),
    "single_file_web_app": ArchetypeTemplate(
        version="1.0",
        description="Single-file web application",
        base_actions=(
            TemplateAction("generate_app", "generate", "Generate web application"),
            TemplateAction("validate_html", "validate", "Validate HTML structure"),
            TemplateAction("run_tests", "test", "Run acceptance tests"),
        ),
        default_dependencies=((1, 0), (2, 1)),
    ),
    "multi_file_web_app": ArchetypeTemplate(
        version="1.0",
        description="Multi-file web application",
        base_actions=(
            TemplateAction("plan_structure", "plan", "Plan application structure"),
            TemplateAction("generate_files", "generate", "Generate application files",
                           "expand based on planned files"),
            TemplateAction("validate_structure", "validate", "Validate project structure"),
            TemplateAction("run_tests", "test", "Run acceptance tests"),
        ),
        default_dependencies=((1, 0), (2, 1), (3, 2)),
    ),
    "code_generation": ArchetypeTemplate(
        version="1.0",
        description="Script or code module generation",
        base_actions=(
            TemplateAction("generate_code", "generate", "Generate code"),
            TemplateAction("validate_syntax", "validate", "Validate syntax"),
            TemplateAction("run_tests", "test", "Run tests"),
        ),
        default_dependencies=((1, 0), (2, 1)),
    ),
    "data_transformation": ArchetypeTemplate(
        version="1.0",
        description="Data transformation pipeline",
        base_actions=(
            TemplateAction("collect_data", "collect", "Collect input data"),
            TemplateAction("transform_data", "transform", "Apply transformations"),
            TemplateAction("validate_output", "validate", "Validate output"),
            TemplateAction("store_results", "store", "Store results"),
        ),
        default_dependencies=((1, 0), (2, 1), (3, 2)),
    ),
    "configuration": ArchetypeTemplate(
        version="1.0",
        description="Configuration or setup task",
        base_actions=(
            TemplateAction("apply_configuration", "configure", "Apply configuration"),
            TemplateAction("validate_configuration", "validate", "Validate configuration"),
        ),
        default_dependencies=((1, 0),),
    ),
}


def get_template(archetype_name: str) -> ArchetypeTemplate:
    if archetype_name not in ARCHETYPE_TEMPLATES:
        raise KeyError(f"No template for archetype: {archetype_name}")
    return ARCHETYPE_TEMPLATES[archetype_name]


def list_archetypes() -> list[str]:
    return sorted(ARCHETYPE_TEMPLATES.keys())


def get_base_actions(archetype_name: str) -> list[TemplateAction]:
    return list(get_template(archetype_name).base_actions)


def get_default_dependencies(archetype_name: str) -> list[tuple[int, int]]:
    return list(get_template(archetype_name).default_dependencies)
