import { randomUUID } from 'node:crypto';
import { CognitiveGrade, type LoadTier, type ModelProfile, type ProviderVendor, type TacticProfile, type TaskType } from '@acds/core-types';

interface CreateModelProfileInput {
  name: string;
  description?: string;
  supportedTaskTypes?: TaskType[];
  supportedLoadTiers?: LoadTier[];
  minimumCognitiveGrade?: CognitiveGrade;
  localOnly?: boolean;
  cloudAllowed?: boolean;
  enabled?: boolean;
}

interface CreateTacticProfileInput {
  name: string;
  description?: string;
  executionMethod: string;
  supportedTaskTypes?: TaskType[];
  supportedLoadTiers?: LoadTier[];
  multiStage?: boolean;
  requiresStructuredOutput?: boolean;
  enabled?: boolean;
}

export class ProfileCatalogService {
  constructor(
    private readonly modelProfiles: ModelProfile[],
    private readonly tacticProfiles: TacticProfile[],
  ) {}

  async listModelProfiles(): Promise<ModelProfile[]> {
    return [...this.modelProfiles];
  }

  async getModelProfile(id: string): Promise<ModelProfile | null> {
    return this.modelProfiles.find((profile) => profile.id === id) ?? null;
  }

  async createModelProfile(input: CreateModelProfileInput): Promise<ModelProfile> {
    const now = new Date();
    const profile: ModelProfile = {
      id: randomUUID(),
      name: input.name,
      description: input.description?.trim() || `${input.name} profile`,
      vendor: (input.localOnly ? 'ollama' : 'openai') as ProviderVendor,
      modelId: input.name,
      supportedTaskTypes: input.supportedTaskTypes ?? [],
      supportedLoadTiers: input.supportedLoadTiers ?? [],
      minimumCognitiveGrade: input.minimumCognitiveGrade ?? CognitiveGrade.STANDARD,
      contextWindow: 8192,
      maxTokens: 2048,
      costPer1kInput: 0,
      costPer1kOutput: 0,
      localOnly: input.localOnly ?? false,
      cloudAllowed: input.cloudAllowed ?? true,
      enabled: input.enabled ?? true,
      createdAt: now,
      updatedAt: now,
    };
    this.modelProfiles.unshift(profile);
    return profile;
  }

  async updateModelProfile(
    id: string,
    updates: Partial<CreateModelProfileInput>,
  ): Promise<ModelProfile | null> {
    const profile = this.modelProfiles.find((entry) => entry.id === id);
    if (!profile) return null;

    Object.assign(profile, {
      name: updates.name ?? profile.name,
      description: updates.description ?? profile.description,
      supportedTaskTypes: updates.supportedTaskTypes ?? profile.supportedTaskTypes,
      supportedLoadTiers: updates.supportedLoadTiers ?? profile.supportedLoadTiers,
      minimumCognitiveGrade: updates.minimumCognitiveGrade ?? profile.minimumCognitiveGrade,
      localOnly: updates.localOnly ?? profile.localOnly,
      cloudAllowed: updates.cloudAllowed ?? profile.cloudAllowed,
      enabled: updates.enabled ?? profile.enabled,
      updatedAt: new Date(),
    });

    return profile;
  }

  async listTacticProfiles(): Promise<TacticProfile[]> {
    return [...this.tacticProfiles];
  }

  async getTacticProfile(id: string): Promise<TacticProfile | null> {
    return this.tacticProfiles.find((profile) => profile.id === id) ?? null;
  }

  async createTacticProfile(input: CreateTacticProfileInput): Promise<TacticProfile> {
    const now = new Date();
    const profile: TacticProfile = {
      id: randomUUID(),
      name: input.name,
      description: input.description?.trim() || `${input.name} tactic`,
      executionMethod: input.executionMethod,
      systemPromptTemplate: '',
      outputSchema: undefined,
      maxRetries: 0,
      temperature: 0,
      topP: 1,
      supportedTaskTypes: input.supportedTaskTypes ?? [],
      supportedLoadTiers: input.supportedLoadTiers ?? [],
      multiStage: input.multiStage ?? false,
      requiresStructuredOutput: input.requiresStructuredOutput ?? false,
      enabled: input.enabled ?? true,
      createdAt: now,
      updatedAt: now,
    };
    this.tacticProfiles.unshift(profile);
    return profile;
  }

  async updateTacticProfile(
    id: string,
    updates: Partial<CreateTacticProfileInput>,
  ): Promise<TacticProfile | null> {
    const profile = this.tacticProfiles.find((entry) => entry.id === id);
    if (!profile) return null;

    Object.assign(profile, {
      name: updates.name ?? profile.name,
      description: updates.description ?? profile.description,
      executionMethod: updates.executionMethod ?? profile.executionMethod,
      supportedTaskTypes: updates.supportedTaskTypes ?? profile.supportedTaskTypes,
      supportedLoadTiers: updates.supportedLoadTiers ?? profile.supportedLoadTiers,
      multiStage: updates.multiStage ?? profile.multiStage,
      requiresStructuredOutput: updates.requiresStructuredOutput ?? profile.requiresStructuredOutput,
      enabled: updates.enabled ?? profile.enabled,
      updatedAt: new Date(),
    });

    return profile;
  }
}
