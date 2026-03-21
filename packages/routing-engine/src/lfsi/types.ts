// LFSI MVP — Core Types
// Spec reference: Section 7 (Required Types)

export type LfsiTier = 'tier0' | 'tier1' | 'tier2';

export type LfsiPolicy =
  | 'lfsi.local_balanced'
  | 'lfsi.apple_only'
  | 'lfsi.private_strict';

export type LfsiSurface = 'macos' | 'ios' | 'server' | 'cli' | 'web';

export type LedgerOutcome = 'success' | 'failure' | 'denied';

export interface InferenceRequest {
  taskId: string;
  capability: string;
  sourceSystem: string;
  surface: LfsiSurface;
  input: Record<string, unknown>;
  context: {
    sensitivity: 'public' | 'internal' | 'private' | 'restricted';
    requiresNetwork: boolean;
    requiresCurrentWeb: boolean;
    sessionId?: string;
  };
  policyProfile: LfsiPolicy;
  validation?: {
    requireSchema?: boolean;
    schemaId?: string;
    minConfidence?: number;
    semanticChecks?: string[];
  };
  hints?: Record<string, unknown>;
  hasProviderOverride?: boolean;
}

export interface InferenceResult {
  providerId: string;
  tier: LfsiTier;
  output: Record<string, unknown>;
  rawText?: string;
  confidence?: number;
  latencyMs: number;
  usage?: { inputTokens?: number; outputTokens?: number };
  metadata?: Record<string, unknown>;
}

export interface ValidationResult {
  passed: boolean;
  confidence: number;
  failures: string[];
  nextAction: 'return' | 'escalate';
}

export interface LedgerEvent {
  eventId: string;
  timestamp: string;
  taskId: string;
  sourceSystem: string;
  capability: string;
  policyProfile: LfsiPolicy;
  selectedTier: LfsiTier;
  selectedProvider: string;
  validationPassed: boolean;
  escalated: boolean;
  escalatedTo?: string;
  finalProvider: string;
  latencyMs: number;
  resultStatus: LedgerOutcome;
  reasonCode?: string;
  attempts: number;
}

export interface InferenceProvider {
  readonly id: string;
  readonly tier: LfsiTier;
  readonly capabilities: readonly string[];
  readonly local: boolean;
  isAvailable(): Promise<boolean>;
  invoke(request: InferenceRequest): Promise<InferenceResult>;
}
