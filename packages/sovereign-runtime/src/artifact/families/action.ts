import type { FamilyNormalizer } from '../pipeline/family-normalizer.js';
import type { ArtifactRegistryEntry } from '../artifact-registry.js';
import { CAPABILITY_IDS } from '../../domain/capability-taxonomy.js';

// ---------------------------------------------------------------------------
// Action Family — system actions (shortcuts, intents, plans)
// Highest risk: requires confirmation, audit logging, dry-run support
// ---------------------------------------------------------------------------

const FAMILY = 'Action';
const APPLE_PROVIDER = 'apple-intelligence-runtime';

export const ACTION_QUALITY_DIMENSIONS = [
  'intent_accuracy',
  'safety_compliance',
  'reversibility',
] as const;

// ---------------------------------------------------------------------------
// Normalizer
// ---------------------------------------------------------------------------

export const actionNormalizer: FamilyNormalizer = {
  family: FAMILY,
  qualityDimensions: [...ACTION_QUALITY_DIMENSIONS],

  normalizeInput(rawInput: unknown, entry: ArtifactRegistryEntry): unknown {
    const input = rawInput as Record<string, unknown>;

    if (entry.action === 'Execute' && entry.variant === 'Shortcut') {
      if (typeof input?.shortcut_name !== 'string' || input.shortcut_name.length === 0) {
        throw new Error('Action.Execute.Shortcut requires a non-empty shortcut_name field');
      }
      return {
        context: {
          action: 'execute_shortcut',
          shortcut_name: input.shortcut_name,
          parameters: input.parameters ?? {},
          dry_run: input.dry_run ?? true, // Default to dry-run for safety
          requires_confirmation: input.requires_confirmation ?? true,
        },
        options: ['execute', 'preview', 'cancel'],
      };
    }

    if (entry.action === 'Execute' && entry.variant === 'Intent') {
      if (typeof input?.intent !== 'string' || input.intent.length === 0) {
        throw new Error('Action.Execute.Intent requires a non-empty intent field');
      }
      return {
        context: {
          action: 'execute_intent',
          intent: input.intent,
          parameters: input.parameters ?? {},
          dry_run: input.dry_run ?? true,
          requires_confirmation: input.requires_confirmation ?? true,
        },
        options: ['execute', 'preview', 'cancel'],
      };
    }

    if (entry.action === 'Plan') {
      if (typeof input?.goal !== 'string' || input.goal.length === 0) {
        throw new Error('Action.Plan requires a non-empty goal field');
      }
      return {
        context: {
          action: 'plan',
          goal: input.goal,
          constraints: input.constraints ?? [],
          max_steps: typeof input.max_steps === 'number' ? input.max_steps : 5,
        },
        options: ['approve', 'modify', 'cancel'],
      };
    }

    return input;
  },

  normalizeOutput(
    rawOutput: unknown,
    entry: ArtifactRegistryEntry,
  ): { primary: unknown; secondary?: unknown } {
    const output = rawOutput as Record<string, unknown>;

    if (entry.action === 'Plan') {
      return {
        primary: {
          plan: output.decision ?? output.plan ?? '',
          steps: output.steps ?? [],
          reasoning: output.reasoning ?? '',
        },
        secondary: {
          confidence: output.confidence ?? 0,
          reversible: output.reversible ?? false,
        },
      };
    }

    // Execute variants
    return {
      primary: {
        result: output.decision ?? output.result ?? 'completed',
        reasoning: output.reasoning ?? '',
      },
      secondary: {
        confidence: output.confidence ?? 0,
        dry_run: output.dry_run ?? false,
        side_effects: output.side_effects ?? [],
      },
    };
  },

  summarizeInput(
    rawInput: unknown,
    entry: ArtifactRegistryEntry,
  ): { source_modality: string; input_class: string; input_size: number; summary: string } {
    const input = rawInput as Record<string, unknown>;
    const description = (input?.shortcut_name ?? input?.intent ?? input?.goal ?? '') as string;
    return {
      source_modality: 'structured',
      input_class: `action_${entry.action.toLowerCase()}`,
      input_size: JSON.stringify(input ?? {}).length,
      summary: description.length > 80 ? `${description.slice(0, 77)}...` : description,
    };
  },
};

// ---------------------------------------------------------------------------
// Registry Entries
// ---------------------------------------------------------------------------

export const ACTION_ENTRIES: ArtifactRegistryEntry[] = [
  {
    artifact_type: 'ACDS.Action.Execute.Shortcut',
    artifact_version: '1.0.0',
    description: 'Execute a system shortcut with confirmation and dry-run support',
    family: FAMILY,
    action: 'Execute',
    variant: 'Shortcut',
    supported_providers: [APPLE_PROVIDER],
    default_provider: APPLE_PROVIDER,
    provider_disposition: 'apple-only',
    capability_id: CAPABILITY_IDS.AGENT_CONTROL_DECIDE,
    output_modality: 'action_result',
    output_format: 'json',
    quality_tier: 'experimental',
    quality_metrics: [...ACTION_QUALITY_DIMENSIONS],
    policy_requirements: ['content_policy', 'action_confirmation', 'audit_required'],
    test_suites: ['action-execute-shortcut'],
  },
  {
    artifact_type: 'ACDS.Action.Execute.Intent',
    artifact_version: '1.0.0',
    description: 'Execute a system intent with confirmation and dry-run support',
    family: FAMILY,
    action: 'Execute',
    variant: 'Intent',
    supported_providers: [APPLE_PROVIDER],
    default_provider: APPLE_PROVIDER,
    provider_disposition: 'apple-only',
    capability_id: CAPABILITY_IDS.AGENT_CONTROL_DECIDE,
    output_modality: 'action_result',
    output_format: 'json',
    quality_tier: 'experimental',
    quality_metrics: [...ACTION_QUALITY_DIMENSIONS],
    policy_requirements: ['content_policy', 'action_confirmation', 'audit_required'],
    test_suites: ['action-execute-intent'],
  },
  {
    artifact_type: 'ACDS.Action.Plan',
    artifact_version: '1.0.0',
    description: 'Create a multi-step action plan for review before execution',
    family: FAMILY,
    action: 'Plan',
    supported_providers: [APPLE_PROVIDER, 'ollama-local'],
    default_provider: APPLE_PROVIDER,
    provider_disposition: 'apple-preferred',
    capability_id: CAPABILITY_IDS.AGENT_CONTROL_DECIDE,
    output_modality: 'action_result',
    output_format: 'json',
    quality_tier: 'experimental',
    quality_metrics: [...ACTION_QUALITY_DIMENSIONS],
    policy_requirements: ['content_policy', 'action_confirmation'],
    test_suites: ['action-plan'],
  },
];
