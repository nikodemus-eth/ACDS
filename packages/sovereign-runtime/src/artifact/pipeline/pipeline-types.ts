import type { ArtifactRegistryEntry } from '../artifact-registry.js';
import type { ArtifactEnvelope, ProviderDisposition, ProviderFamily, OutputModality, OutputFormat } from '../artifact-envelope.js';
import type { CapabilityRequest } from '../../runtime/capability-orchestrator.js';

// ---------------------------------------------------------------------------
// Pipeline Context — accumulates state across stages
// ---------------------------------------------------------------------------

export interface PipelineContext {
  // ── Input (set by caller) ──
  artifactType: string;
  rawInput: unknown;
  options: PipelineOptions;

  // ── Set by Intake stage ──
  registryEntry?: ArtifactRegistryEntry;
  capabilityId?: string;
  normalizedInput?: unknown;
  inputSummary?: {
    source_modality: string;
    input_class: string;
    input_size: number;
    summary: string;
  };

  // ── Set by Policy Gate stage ──
  policyDecision?: {
    allowed: boolean;
    blocked_reason?: string;
    tier: string;
    trace: string[];
    local_only: boolean;
  };

  // ── Set by Planning stage ──
  selectedProvider?: string;
  selectedMethod?: string;
  selectedProviderFamily?: ProviderFamily;
  fallbackProvider?: string;
  disposition?: ProviderDisposition;
  outputModality?: OutputModality;
  outputFormat?: OutputFormat;

  // ── Set by Execution stage ──
  rawOutput?: unknown;
  executionLatencyMs?: number;
  executionMode?: 'local' | 'controlled_remote' | 'session';
  fallbackUsed?: boolean;

  // ── Set by Post-Processing stage ──
  canonicalPayload?: { primary: unknown; secondary?: unknown };
  derivedMetrics?: Record<string, number>;

  // ── Set by Provenance stage ──
  provenance?: ArtifactEnvelope['provenance'];

  // ── Timing ──
  timings: Record<string, number>;
  startTime: number;

  // ── Error state ──
  error?: { stage: string; message: string; code?: string };
}

// ---------------------------------------------------------------------------
// Pipeline Options
// ---------------------------------------------------------------------------

export interface PipelineOptions {
  constraints?: CapabilityRequest['constraints'];
  requestedBy?: string;
  skipValidation?: boolean;
}

// ---------------------------------------------------------------------------
// Pipeline Stage Interface
// ---------------------------------------------------------------------------

export interface PipelineStage {
  readonly name: string;
  execute(ctx: PipelineContext): Promise<PipelineContext>;
}
