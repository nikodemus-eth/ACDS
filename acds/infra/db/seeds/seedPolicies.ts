import { Client } from 'pg';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

interface GlobalPolicy {
  allowedVendors: string[];
  blockedVendors: string[];
  defaultPrivacy: string;
  costSensitivity: string;
  maxLatencyByLoadTier: Record<string, number>;
  structuredOutputByGrade: Record<string, boolean>;
  traceabilityByGrade: Record<string, string>;
}

interface ApplicationPolicy {
  application: string;
  overrides: Record<string, unknown>;
}

async function seedPolicies(): Promise<void> {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });

  const globalPolicyPath = resolve(
    __dirname,
    '../../config/policies/globalPolicy.json'
  );
  const thingsteadPolicyPath = resolve(
    __dirname,
    '../../config/policies/thingsteadPolicy.json'
  );
  const processSwarmPolicyPath = resolve(
    __dirname,
    '../../config/policies/processSwarmPolicy.json'
  );

  const globalPolicy: GlobalPolicy = JSON.parse(
    readFileSync(globalPolicyPath, 'utf-8')
  );
  const thingsteadPolicy: ApplicationPolicy = JSON.parse(
    readFileSync(thingsteadPolicyPath, 'utf-8')
  );
  const processSwarmPolicy: ApplicationPolicy = JSON.parse(
    readFileSync(processSwarmPolicyPath, 'utf-8')
  );

  try {
    await client.connect();
    console.log('[seed] Connected to database.');

    // Seed global policy
    await client.query(
      `INSERT INTO global_policies (
        allowed_vendors,
        blocked_vendors,
        default_privacy,
        cost_sensitivity,
        max_latency_by_load_tier,
        structured_output_by_grade,
        traceability_by_grade
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        JSON.stringify(globalPolicy.allowedVendors),
        JSON.stringify(globalPolicy.blockedVendors),
        globalPolicy.defaultPrivacy,
        globalPolicy.costSensitivity,
        JSON.stringify(globalPolicy.maxLatencyByLoadTier),
        JSON.stringify(globalPolicy.structuredOutputByGrade),
        JSON.stringify(globalPolicy.traceabilityByGrade),
      ]
    );
    console.log('[seed] Inserted global policy.');

    // Seed application policies
    const appPolicies: ApplicationPolicy[] = [
      thingsteadPolicy,
      processSwarmPolicy,
    ];

    for (const policy of appPolicies) {
      await client.query(
        `INSERT INTO application_policies (
          application,
          overrides
        ) VALUES ($1, $2)
        ON CONFLICT (application) DO UPDATE SET
          overrides = EXCLUDED.overrides,
          updated_at = NOW()`,
        [policy.application, JSON.stringify(policy.overrides)]
      );
      console.log(
        `[seed] Upserted application policy: ${policy.application}`
      );
    }

    console.log('[seed] Successfully seeded all policies.');
  } catch (error) {
    console.error('[seed] Failed to seed policies:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

seedPolicies();
