import type { Pool } from 'pg';
import type { GlobalPolicy } from '@acds/policy-engine';
import type { ApplicationPolicy } from '@acds/policy-engine';
import type { ProcessPolicy } from '@acds/policy-engine';

/**
 * PolicyRepository - Persistence interface for CRUD operations on
 * GlobalPolicy, ApplicationPolicy, and ProcessPolicy entities.
 */
export interface PolicyRepository {
  // --- GlobalPolicy ---
  getGlobalPolicy(): Promise<GlobalPolicy | null>;
  saveGlobalPolicy(policy: GlobalPolicy): Promise<void>;

  // --- ApplicationPolicy ---
  findApplicationPolicy(application: string): Promise<ApplicationPolicy | null>;
  findApplicationPolicyById(id: string): Promise<ApplicationPolicy | null>;
  listApplicationPolicies(): Promise<ApplicationPolicy[]>;
  saveApplicationPolicy(policy: ApplicationPolicy): Promise<void>;
  deleteApplicationPolicy(id: string): Promise<void>;

  // --- ProcessPolicy ---
  findProcessPolicy(
    application: string,
    process: string,
    step?: string,
  ): Promise<ProcessPolicy | null>;
  findProcessPolicyById(id: string): Promise<ProcessPolicy | null>;
  listProcessPolicies(application?: string): Promise<ProcessPolicy[]>;
  saveProcessPolicy(policy: ProcessPolicy): Promise<void>;
  deleteProcessPolicy(id: string): Promise<void>;
}

export class PgPolicyRepository implements PolicyRepository {
  constructor(private readonly pool: Pool) {}

  // ─── GlobalPolicy ─────────────────────────────────────────────────────

  async getGlobalPolicy(): Promise<GlobalPolicy | null> {
    const result = await this.pool.query(
      'SELECT * FROM global_policies ORDER BY updated_at DESC LIMIT 1',
    );
    return result.rows.length > 0 ? this.mapGlobalRow(result.rows[0]) : null;
  }

  async saveGlobalPolicy(policy: GlobalPolicy): Promise<void> {
    await this.pool.query(
      `INSERT INTO global_policies (
         id, allowed_vendors, blocked_vendors, default_privacy,
         default_cost_sensitivity, structured_output_required_for_grades,
         traceability_required_for_grades, max_latency_ms_by_load_tier,
         local_preferred_task_types, cloud_required_load_tiers,
         enabled, updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (id) DO UPDATE SET
         allowed_vendors = EXCLUDED.allowed_vendors,
         blocked_vendors = EXCLUDED.blocked_vendors,
         default_privacy = EXCLUDED.default_privacy,
         default_cost_sensitivity = EXCLUDED.default_cost_sensitivity,
         structured_output_required_for_grades = EXCLUDED.structured_output_required_for_grades,
         traceability_required_for_grades = EXCLUDED.traceability_required_for_grades,
         max_latency_ms_by_load_tier = EXCLUDED.max_latency_ms_by_load_tier,
         local_preferred_task_types = EXCLUDED.local_preferred_task_types,
         cloud_required_load_tiers = EXCLUDED.cloud_required_load_tiers,
         enabled = EXCLUDED.enabled,
         updated_at = EXCLUDED.updated_at`,
      [
        policy.id,
        JSON.stringify(policy.allowedVendors),
        JSON.stringify(policy.blockedVendors),
        policy.defaultPrivacy,
        policy.defaultCostSensitivity,
        JSON.stringify(policy.structuredOutputRequiredForGrades),
        JSON.stringify(policy.traceabilityRequiredForGrades),
        JSON.stringify(policy.maxLatencyMsByLoadTier),
        JSON.stringify(policy.localPreferredTaskTypes),
        JSON.stringify(policy.cloudRequiredLoadTiers),
        policy.enabled,
        policy.updatedAt,
      ],
    );
  }

  // ─── ApplicationPolicy ────────────────────────────────────────────────

  async findApplicationPolicy(application: string): Promise<ApplicationPolicy | null> {
    const result = await this.pool.query(
      'SELECT * FROM application_policies WHERE application = $1',
      [application],
    );
    return result.rows.length > 0 ? this.mapAppRow(result.rows[0]) : null;
  }

  async findApplicationPolicyById(id: string): Promise<ApplicationPolicy | null> {
    const result = await this.pool.query(
      'SELECT * FROM application_policies WHERE id = $1',
      [id],
    );
    return result.rows.length > 0 ? this.mapAppRow(result.rows[0]) : null;
  }

  async listApplicationPolicies(): Promise<ApplicationPolicy[]> {
    const result = await this.pool.query(
      'SELECT * FROM application_policies ORDER BY application',
    );
    return result.rows.map(this.mapAppRow);
  }

  async saveApplicationPolicy(policy: ApplicationPolicy): Promise<void> {
    await this.pool.query(
      `INSERT INTO application_policies (
         id, application, allowed_vendors, blocked_vendors,
         privacy_override, cost_sensitivity_override,
         preferred_model_profile_ids, blocked_model_profile_ids,
         local_preferred_task_types, structured_output_required_for_grades,
         enabled, updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (id) DO UPDATE SET
         application = EXCLUDED.application,
         allowed_vendors = EXCLUDED.allowed_vendors,
         blocked_vendors = EXCLUDED.blocked_vendors,
         privacy_override = EXCLUDED.privacy_override,
         cost_sensitivity_override = EXCLUDED.cost_sensitivity_override,
         preferred_model_profile_ids = EXCLUDED.preferred_model_profile_ids,
         blocked_model_profile_ids = EXCLUDED.blocked_model_profile_ids,
         local_preferred_task_types = EXCLUDED.local_preferred_task_types,
         structured_output_required_for_grades = EXCLUDED.structured_output_required_for_grades,
         enabled = EXCLUDED.enabled,
         updated_at = EXCLUDED.updated_at`,
      [
        policy.id,
        policy.application,
        policy.allowedVendors ? JSON.stringify(policy.allowedVendors) : null,
        policy.blockedVendors ? JSON.stringify(policy.blockedVendors) : null,
        policy.privacyOverride,
        policy.costSensitivityOverride,
        policy.preferredModelProfileIds ? JSON.stringify(policy.preferredModelProfileIds) : null,
        policy.blockedModelProfileIds ? JSON.stringify(policy.blockedModelProfileIds) : null,
        policy.localPreferredTaskTypes ? JSON.stringify(policy.localPreferredTaskTypes) : null,
        policy.structuredOutputRequiredForGrades
          ? JSON.stringify(policy.structuredOutputRequiredForGrades)
          : null,
        policy.enabled,
        policy.updatedAt,
      ],
    );
  }

  async deleteApplicationPolicy(id: string): Promise<void> {
    await this.pool.query('DELETE FROM application_policies WHERE id = $1', [id]);
  }

  // ─── ProcessPolicy ────────────────────────────────────────────────────

  async findProcessPolicy(
    application: string,
    process: string,
    step?: string,
  ): Promise<ProcessPolicy | null> {
    let query: string;
    let params: unknown[];

    if (step != null) {
      query = 'SELECT * FROM process_policies WHERE application = $1 AND process = $2 AND step = $3';
      params = [application, process, step];
    } else {
      query = 'SELECT * FROM process_policies WHERE application = $1 AND process = $2 AND step IS NULL';
      params = [application, process];
    }

    const result = await this.pool.query(query, params);
    return result.rows.length > 0 ? this.mapProcessRow(result.rows[0]) : null;
  }

  async findProcessPolicyById(id: string): Promise<ProcessPolicy | null> {
    const result = await this.pool.query(
      'SELECT * FROM process_policies WHERE id = $1',
      [id],
    );
    return result.rows.length > 0 ? this.mapProcessRow(result.rows[0]) : null;
  }

  async listProcessPolicies(application?: string): Promise<ProcessPolicy[]> {
    const result = application
      ? await this.pool.query(
          'SELECT * FROM process_policies WHERE application = $1 ORDER BY application, process, step',
          [application],
        )
      : await this.pool.query(
          'SELECT * FROM process_policies ORDER BY application, process, step',
        );
    return result.rows.map(this.mapProcessRow);
  }

  async saveProcessPolicy(policy: ProcessPolicy): Promise<void> {
    await this.pool.query(
      `INSERT INTO process_policies (
         id, application, process, step,
         default_model_profile_id, default_tactic_profile_id,
         allowed_model_profile_ids, blocked_model_profile_ids,
         allowed_tactic_profile_ids,
         privacy_override, cost_sensitivity_override,
         force_escalation_for_grades, enabled, updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       ON CONFLICT (id) DO UPDATE SET
         application = EXCLUDED.application,
         process = EXCLUDED.process,
         step = EXCLUDED.step,
         default_model_profile_id = EXCLUDED.default_model_profile_id,
         default_tactic_profile_id = EXCLUDED.default_tactic_profile_id,
         allowed_model_profile_ids = EXCLUDED.allowed_model_profile_ids,
         blocked_model_profile_ids = EXCLUDED.blocked_model_profile_ids,
         allowed_tactic_profile_ids = EXCLUDED.allowed_tactic_profile_ids,
         privacy_override = EXCLUDED.privacy_override,
         cost_sensitivity_override = EXCLUDED.cost_sensitivity_override,
         force_escalation_for_grades = EXCLUDED.force_escalation_for_grades,
         enabled = EXCLUDED.enabled,
         updated_at = EXCLUDED.updated_at`,
      [
        policy.id,
        policy.application,
        policy.process,
        policy.step,
        policy.defaultModelProfileId,
        policy.defaultTacticProfileId,
        policy.allowedModelProfileIds ? JSON.stringify(policy.allowedModelProfileIds) : null,
        policy.blockedModelProfileIds ? JSON.stringify(policy.blockedModelProfileIds) : null,
        policy.allowedTacticProfileIds ? JSON.stringify(policy.allowedTacticProfileIds) : null,
        policy.privacyOverride,
        policy.costSensitivityOverride,
        policy.forceEscalationForGrades ? JSON.stringify(policy.forceEscalationForGrades) : null,
        policy.enabled,
        policy.updatedAt,
      ],
    );
  }

  async deleteProcessPolicy(id: string): Promise<void> {
    await this.pool.query('DELETE FROM process_policies WHERE id = $1', [id]);
  }

  // ─── Row Mappers ──────────────────────────────────────────────────────

  private mapGlobalRow(row: Record<string, unknown>): GlobalPolicy {
    return {
      id: row.id as string,
      allowedVendors: this.parseJsonArray(row.allowed_vendors),
      blockedVendors: this.parseJsonArray(row.blocked_vendors),
      defaultPrivacy: row.default_privacy as GlobalPolicy['defaultPrivacy'],
      defaultCostSensitivity: row.default_cost_sensitivity as GlobalPolicy['defaultCostSensitivity'],
      structuredOutputRequiredForGrades: this.parseJsonArray(row.structured_output_required_for_grades),
      traceabilityRequiredForGrades: this.parseJsonArray(row.traceability_required_for_grades),
      maxLatencyMsByLoadTier: this.parseJsonObject(row.max_latency_ms_by_load_tier),
      localPreferredTaskTypes: this.parseJsonArray(row.local_preferred_task_types),
      cloudRequiredLoadTiers: this.parseJsonArray(row.cloud_required_load_tiers),
      enabled: row.enabled as boolean,
      updatedAt: new Date(row.updated_at as string),
    };
  }

  private mapAppRow(row: Record<string, unknown>): ApplicationPolicy {
    return {
      id: row.id as string,
      application: row.application as string,
      allowedVendors: this.parseJsonArrayOrNull(row.allowed_vendors),
      blockedVendors: this.parseJsonArrayOrNull(row.blocked_vendors),
      privacyOverride: (row.privacy_override as ApplicationPolicy['privacyOverride']) ?? null,
      costSensitivityOverride:
        (row.cost_sensitivity_override as ApplicationPolicy['costSensitivityOverride']) ?? null,
      preferredModelProfileIds: this.parseJsonArrayOrNull(row.preferred_model_profile_ids),
      blockedModelProfileIds: this.parseJsonArrayOrNull(row.blocked_model_profile_ids),
      localPreferredTaskTypes: this.parseJsonArrayOrNull(row.local_preferred_task_types),
      structuredOutputRequiredForGrades: this.parseJsonArrayOrNull(
        row.structured_output_required_for_grades,
      ),
      enabled: row.enabled as boolean,
      updatedAt: new Date(row.updated_at as string),
    };
  }

  private mapProcessRow(row: Record<string, unknown>): ProcessPolicy {
    return {
      id: row.id as string,
      application: row.application as string,
      process: row.process as string,
      step: (row.step as string) ?? null,
      defaultModelProfileId: (row.default_model_profile_id as string) ?? null,
      defaultTacticProfileId: (row.default_tactic_profile_id as string) ?? null,
      allowedModelProfileIds: this.parseJsonArrayOrNull(row.allowed_model_profile_ids),
      blockedModelProfileIds: this.parseJsonArrayOrNull(row.blocked_model_profile_ids),
      allowedTacticProfileIds: this.parseJsonArrayOrNull(row.allowed_tactic_profile_ids),
      privacyOverride: (row.privacy_override as ProcessPolicy['privacyOverride']) ?? null,
      costSensitivityOverride:
        (row.cost_sensitivity_override as ProcessPolicy['costSensitivityOverride']) ?? null,
      forceEscalationForGrades: this.parseJsonArrayOrNull(row.force_escalation_for_grades),
      enabled: row.enabled as boolean,
      updatedAt: new Date(row.updated_at as string),
    };
  }

  private parseJsonArray(value: unknown): any[] {
    if (Array.isArray(value)) return value;
    if (typeof value === 'string') return JSON.parse(value);
    return [];
  }

  private parseJsonArrayOrNull(value: unknown): any[] | null {
    if (value == null) return null;
    if (Array.isArray(value)) return value;
    if (typeof value === 'string') return JSON.parse(value);
    return null;
  }

  private parseJsonObject(value: unknown): Record<string, any> {
    if (value != null && typeof value === 'object' && !Array.isArray(value))
      return value as Record<string, any>;
    if (typeof value === 'string') return JSON.parse(value);
    return {};
  }
}
