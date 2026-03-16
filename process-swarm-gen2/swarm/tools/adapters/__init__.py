from __future__ import annotations

from swarm.tools.adapters.bundle_builder import BundleBuilderAdapter
from swarm.tools.adapters.citation_validator import CitationValidatorAdapter
from swarm.tools.adapters.decision_engine import DecisionEngineAdapter
from swarm.tools.adapters.delivery_engine import DeliveryEngineAdapter
from swarm.tools.adapters.freshness_filter import FreshnessFilterAdapter
from swarm.tools.adapters.policy_loader import PolicyLoaderAdapter
from swarm.tools.adapters.probabilistic_synthesis import ProbabilisticSynthesisAdapter
from swarm.tools.adapters.report_formatter import ReportFormatterAdapter
from swarm.tools.adapters.rule_validator import RuleValidatorAdapter
from swarm.tools.adapters.run_manager import RunManagerAdapter
from swarm.tools.adapters.section_mapper import SectionMapperAdapter
from swarm.tools.adapters.source_collector import SourceCollectorAdapter
from swarm.tools.adapters.source_normalizer import SourceNormalizerAdapter
from swarm.tools.adapters.synthesis_brief_builder import SynthesisBriefBuilderAdapter
from swarm.tools.adapters.url_validator import UrlValidatorAdapter

ALL_ADAPTERS = [
    RunManagerAdapter,
    PolicyLoaderAdapter,
    SourceCollectorAdapter,
    UrlValidatorAdapter,
    FreshnessFilterAdapter,
    SourceNormalizerAdapter,
    SectionMapperAdapter,
    SynthesisBriefBuilderAdapter,
    ProbabilisticSynthesisAdapter,
    ReportFormatterAdapter,
    BundleBuilderAdapter,
    CitationValidatorAdapter,
    RuleValidatorAdapter,
    DecisionEngineAdapter,
    DeliveryEngineAdapter,
]
