/**
 * Shared repository singletons for GRITS worker.
 *
 * These provide in-memory implementations of the external repository
 * interfaces that GRITS reads from. In production, these would be
 * replaced with database-backed implementations.
 */

import type {
  OptimizerStateRepository,
  FamilySelectionState,
  CandidatePerformanceState,
  AdaptationApprovalRepository,
  AdaptationApprovalStatus,
  AdaptationApproval,
  AdaptationLedgerWriter,
  AdaptationEvent,
  AdaptationEventFilters,
} from '@acds/adaptive-optimizer';
import type { ProviderRepository } from '@acds/provider-broker';
import type { PolicyRepository } from '@acds/policy-engine';
import type { Provider } from '@acds/core-types';
import type { GlobalPolicy, ApplicationPolicy, ProcessPolicy } from '@acds/policy-engine';

// ── InMemoryOptimizerStateRepository ────────────────────────────────────

class InMemoryOptimizerStateRepository implements OptimizerStateRepository {
  private readonly familyStates = new Map<string, FamilySelectionState>();
  private readonly candidateStates = new Map<string, CandidatePerformanceState[]>();

  async getFamilyState(familyKey: string): Promise<FamilySelectionState | undefined> {
    return this.familyStates.get(familyKey);
  }
  async saveFamilyState(state: FamilySelectionState): Promise<void> {
    this.familyStates.set(state.familyKey, state);
  }
  async getCandidateStates(familyKey: string): Promise<CandidatePerformanceState[]> {
    return this.candidateStates.get(familyKey) ?? [];
  }
  async saveCandidateState(state: CandidatePerformanceState): Promise<void> {
    const existing = this.candidateStates.get(state.familyKey) ?? [];
    const idx = existing.findIndex((c) => c.candidateId === state.candidateId);
    if (idx >= 0) existing[idx] = state;
    else existing.push(state);
    this.candidateStates.set(state.familyKey, existing);
  }
  async listFamilies(): Promise<string[]> {
    return [...this.familyStates.keys()];
  }
}

// ── InMemoryApprovalRepository ──────────────────────────────────────────

class InMemoryApprovalRepository implements AdaptationApprovalRepository {
  private readonly approvals: AdaptationApproval[] = [];

  async save(approval: AdaptationApproval): Promise<void> {
    const idx = this.approvals.findIndex((a) => a.id === approval.id);
    if (idx >= 0) this.approvals[idx] = approval;
    else this.approvals.push(approval);
  }
  async findById(id: string): Promise<AdaptationApproval | undefined> {
    return this.approvals.find((a) => a.id === id);
  }
  async findPending(): Promise<AdaptationApproval[]> {
    return this.approvals.filter((a) => a.status === 'pending');
  }
  async findByFamily(familyKey: string): Promise<AdaptationApproval[]> {
    return this.approvals.filter((a) => a.familyKey === familyKey);
  }
  async updateStatus(
    id: string,
    status: AdaptationApprovalStatus,
    fields?: { decidedAt?: string; decidedBy?: string; reason?: string },
  ): Promise<void> {
    const approval = this.approvals.find((a) => a.id === id);
    if (approval) {
      approval.status = status;
      if (fields?.decidedAt) approval.decidedAt = fields.decidedAt;
      if (fields?.decidedBy) approval.decidedBy = fields.decidedBy;
      if (fields?.reason) approval.reason = fields.reason;
    }
  }
}

// ── InMemoryLedger ──────────────────────────────────────────────────────

class InMemoryLedger implements AdaptationLedgerWriter {
  private readonly events: AdaptationEvent[] = [];

  async writeEvent(event: AdaptationEvent): Promise<void> {
    this.events.push(event);
  }
  async listEvents(familyKey: string, filters?: AdaptationEventFilters): Promise<AdaptationEvent[]> {
    let results = this.events.filter((e) => e.familyKey === familyKey);
    if (filters?.trigger) results = results.filter((e) => e.trigger === filters.trigger);
    if (filters?.since) results = results.filter((e) => e.createdAt >= filters.since!);
    if (filters?.until) results = results.filter((e) => e.createdAt <= filters.until!);
    if (filters?.limit) results = results.slice(0, filters.limit);
    return results;
  }
  async getEvent(id: string): Promise<AdaptationEvent | undefined> {
    return this.events.find((e) => e.id === id);
  }
}

// ── InMemoryProviderRepository ──────────────────────────────────────────

class InMemoryProviderRepository implements ProviderRepository {
  private readonly providers: Provider[] = [];

  async create(input: Omit<Provider, 'id' | 'createdAt' | 'updatedAt'>): Promise<Provider> {
    const provider: Provider = {
      ...input,
      id: `prov-${this.providers.length + 1}`,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as Provider;
    this.providers.push(provider);
    return provider;
  }
  async findById(id: string): Promise<Provider | null> {
    return this.providers.find((p) => p.id === id) ?? null;
  }
  async findAll(): Promise<Provider[]> {
    return [...this.providers];
  }
  async findByVendor(vendor: string): Promise<Provider[]> {
    return this.providers.filter((p) => p.vendor === vendor);
  }
  async findEnabled(): Promise<Provider[]> {
    return this.providers.filter((p) => p.enabled);
  }
  async update(id: string, input: Partial<Provider>): Promise<Provider> {
    const provider = this.providers.find((p) => p.id === id);
    if (!provider) throw new Error(`Provider ${id} not found`);
    Object.assign(provider, input, { updatedAt: new Date() });
    return provider;
  }
  async disable(id: string): Promise<Provider> {
    const provider = this.providers.find((p) => p.id === id);
    if (!provider) throw new Error(`Provider ${id} not found`);
    provider.enabled = false;
    provider.updatedAt = new Date();
    return provider;
  }
  async delete(id: string): Promise<void> {
    const idx = this.providers.findIndex((p) => p.id === id);
    if (idx >= 0) this.providers.splice(idx, 1);
  }
}

// ── InMemoryPolicyRepository ────────────────────────────────────────────

class InMemoryPolicyRepository implements PolicyRepository {
  private globalPolicy: GlobalPolicy | null = null;
  private readonly appPolicies: ApplicationPolicy[] = [];
  private readonly processPolicies: ProcessPolicy[] = [];

  async getGlobalPolicy(): Promise<GlobalPolicy | null> {
    return this.globalPolicy;
  }
  async saveGlobalPolicy(policy: GlobalPolicy): Promise<GlobalPolicy> {
    this.globalPolicy = policy;
    return policy;
  }
  async getApplicationPolicy(application: string): Promise<ApplicationPolicy | null> {
    return this.appPolicies.find((p) => p.application === application) ?? null;
  }
  async listApplicationPolicies(): Promise<ApplicationPolicy[]> {
    return [...this.appPolicies];
  }
  async saveApplicationPolicy(policy: ApplicationPolicy): Promise<ApplicationPolicy> {
    const idx = this.appPolicies.findIndex((p) => p.id === policy.id);
    if (idx >= 0) this.appPolicies[idx] = policy;
    else this.appPolicies.push(policy);
    return policy;
  }
  async deleteApplicationPolicy(application: string): Promise<boolean> {
    const idx = this.appPolicies.findIndex((p) => p.application === application);
    if (idx >= 0) { this.appPolicies.splice(idx, 1); return true; }
    return false;
  }
  async getProcessPolicy(application: string, process: string, step: string | null): Promise<ProcessPolicy | null> {
    return this.processPolicies.find(
      (p) => p.application === application && p.process === process && p.step === step,
    ) ?? null;
  }
  async listProcessPolicies(application: string): Promise<ProcessPolicy[]> {
    return this.processPolicies.filter((p) => p.application === application);
  }
  async saveProcessPolicy(policy: ProcessPolicy): Promise<ProcessPolicy> {
    const idx = this.processPolicies.findIndex((p) => p.id === policy.id);
    if (idx >= 0) this.processPolicies[idx] = policy;
    else this.processPolicies.push(policy);
    return policy;
  }
  async deleteProcessPolicy(id: string): Promise<boolean> {
    const idx = this.processPolicies.findIndex((p) => p.id === id);
    if (idx >= 0) { this.processPolicies.splice(idx, 1); return true; }
    return false;
  }
}

// ── Singletons ──────────────────────────────────────────────────────────

const optimizerRepo = new InMemoryOptimizerStateRepository();
const approvalRepo = new InMemoryApprovalRepository();
const ledger = new InMemoryLedger();
const providerRepo = new InMemoryProviderRepository();
const policyRepo = new InMemoryPolicyRepository();

export function getSharedOptimizerStateRepository(): OptimizerStateRepository { return optimizerRepo; }
export function getSharedApprovalRepository(): AdaptationApprovalRepository { return approvalRepo; }
export function getSharedLedger(): AdaptationLedgerWriter { return ledger; }
export function getSharedProviderRepository(): ProviderRepository { return providerRepo; }
export function getSharedPolicyRepository(): PolicyRepository { return policyRepo; }
