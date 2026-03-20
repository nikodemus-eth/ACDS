// ---------------------------------------------------------------------------
// Seed Data Wiring — Validates all JSON config and logs what would be inserted
// ---------------------------------------------------------------------------
// Run with: npx tsx infra/db/seeds/validateSeeds.ts
// ---------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Types for seed data validation
// ---------------------------------------------------------------------------

interface ProviderSeed {
  name: string;
  vendor: string;
  authType: string;
  baseUrl: string;
  environment: string;
}

interface GlobalPolicySeed {
  allowedVendors: string[];
  blockedVendors: string[];
  defaultPrivacy: string;
  costSensitivity: string;
  maxLatencyByLoadTier: Record<string, number>;
  structuredOutputByGrade: Record<string, boolean>;
  traceabilityByGrade: Record<string, string>;
}

interface ApplicationPolicySeed {
  application: string;
  overrides: Record<string, unknown>;
}

interface ModelProfileSeed {
  name: string;
  vendor?: string;
  modelId?: string;
  supportedTaskTypes: string[];
  supportedLoadTiers: string[];
  minimumCognitiveGrade: string;
  contextWindow?: number;
  maxTokens?: number;
  costPer1kInput?: number;
  costPer1kOutput?: number;
  localOnly: boolean;
  cloudAllowed: boolean;
}

interface TacticProfileSeed {
  name: string;
  executionMethod: string;
  multiStage: boolean;
  requiresStructuredOutput: boolean;
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

const VALID_VENDORS = ['ollama', 'apple'];
const VALID_LOAD_TIERS = ['single_shot', 'batch', 'streaming', 'high_throughput'];
const VALID_COGNITIVE_GRADES = ['basic', 'standard', 'enhanced', 'frontier', 'specialized'];
const VALID_TASK_TYPES = [
  'classification', 'extraction', 'summarization', 'analytical',
  'decision_support', 'planning', 'critique', 'creative',
  'transformation', 'retrieval_synthesis',
];

function validateGlobalPolicy(data: GlobalPolicySeed): string[] {
  const errors: string[] = [];

  if (!Array.isArray(data.allowedVendors)) {
    errors.push('allowedVendors must be an array');
  } else {
    for (const v of data.allowedVendors) {
      if (!VALID_VENDORS.includes(v)) {
        errors.push(`Unknown vendor in allowedVendors: ${v}`);
      }
    }
  }

  if (!Array.isArray(data.blockedVendors)) {
    errors.push('blockedVendors must be an array');
  }

  if (typeof data.defaultPrivacy !== 'string') {
    errors.push('defaultPrivacy must be a string');
  }

  if (typeof data.costSensitivity !== 'string') {
    errors.push('costSensitivity must be a string');
  }

  if (typeof data.maxLatencyByLoadTier !== 'object' || data.maxLatencyByLoadTier === null) {
    errors.push('maxLatencyByLoadTier must be an object');
  }

  return errors;
}

function validateApplicationPolicy(data: ApplicationPolicySeed): string[] {
  const errors: string[] = [];

  if (typeof data.application !== 'string' || data.application.trim().length === 0) {
    errors.push('application must be a non-empty string');
  }

  if (typeof data.overrides !== 'object' || data.overrides === null) {
    errors.push('overrides must be an object');
  }

  return errors;
}

function validateModelProfile(data: ModelProfileSeed): string[] {
  const errors: string[] = [];

  if (typeof data.name !== 'string' || data.name.trim().length === 0) {
    errors.push('name must be a non-empty string');
  }

  if (!Array.isArray(data.supportedTaskTypes)) {
    errors.push('supportedTaskTypes must be an array');
  } else {
    for (const t of data.supportedTaskTypes) {
      if (!VALID_TASK_TYPES.includes(t)) {
        errors.push(`Unknown task type: ${t}`);
      }
    }
  }

  if (!Array.isArray(data.supportedLoadTiers)) {
    errors.push('supportedLoadTiers must be an array');
  } else {
    for (const lt of data.supportedLoadTiers) {
      if (!VALID_LOAD_TIERS.includes(lt)) {
        errors.push(`Unknown load tier: ${lt}`);
      }
    }
  }

  if (!VALID_COGNITIVE_GRADES.includes(data.minimumCognitiveGrade)) {
    errors.push(`Unknown cognitive grade: ${data.minimumCognitiveGrade}`);
  }

  if (typeof data.localOnly !== 'boolean') {
    errors.push('localOnly must be a boolean');
  }

  if (typeof data.cloudAllowed !== 'boolean') {
    errors.push('cloudAllowed must be a boolean');
  }

  return errors;
}

function validateTacticProfile(data: TacticProfileSeed): string[] {
  const errors: string[] = [];

  if (typeof data.name !== 'string' || data.name.trim().length === 0) {
    errors.push('name must be a non-empty string');
  }

  if (typeof data.executionMethod !== 'string') {
    errors.push('executionMethod must be a string');
  }

  if (typeof data.multiStage !== 'boolean') {
    errors.push('multiStage must be a boolean');
  }

  if (typeof data.requiresStructuredOutput !== 'boolean') {
    errors.push('requiresStructuredOutput must be a boolean');
  }

  return errors;
}

// ---------------------------------------------------------------------------
// File loading
// ---------------------------------------------------------------------------

function loadJson<T>(relativePath: string): T {
  const fullPath = resolve(__dirname, relativePath);
  const raw = readFileSync(fullPath, 'utf-8');
  return JSON.parse(raw) as T;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const VALID_AUTH_TYPES = ['none', 'api_key', 'bearer_token', 'custom'];

function validateProvider(data: ProviderSeed): string[] {
  const errors: string[] = [];
  if (typeof data.name !== 'string' || data.name.trim().length === 0) errors.push('name must be non-empty');
  if (!VALID_VENDORS.includes(data.vendor)) errors.push(`Unknown vendor: ${data.vendor}`);
  if (!VALID_AUTH_TYPES.includes(data.authType)) errors.push(`Unknown authType: ${data.authType}`);
  if (typeof data.baseUrl !== 'string' || data.baseUrl.trim().length === 0) errors.push('baseUrl must be non-empty');
  if (typeof data.environment !== 'string' || data.environment.trim().length === 0) errors.push('environment must be non-empty');
  return errors;
}

function validateSeeds(): void {
  let hasErrors = false;

  console.log('=== ACDS Seed Data Validation ===\n');

  // --- Providers ---
  console.log('[1/5] Validating providers...');
  const providers = loadJson<ProviderSeed[]>('../../config/providers/defaultProviders.json');
  for (const provider of providers) {
    const errors = validateProvider(provider);
    if (errors.length > 0) {
      hasErrors = true;
      console.error(`  ERRORS in provider "${provider.name}":`, errors);
    } else {
      console.log(`  OK — would UPSERT providers: ${provider.name} (${provider.vendor})`);
    }
  }

  // --- Global Policy ---
  console.log('\n[2/5] Validating global policy...');
  const globalPolicy = loadJson<GlobalPolicySeed>('../../config/policies/globalPolicy.json');
  const globalErrors = validateGlobalPolicy(globalPolicy);
  if (globalErrors.length > 0) {
    hasErrors = true;
    console.error('  ERRORS:', globalErrors);
  } else {
    console.log('  OK — would INSERT into global_policies:');
    console.log(`    allowedVendors: ${JSON.stringify(globalPolicy.allowedVendors)}`);
    console.log(`    defaultPrivacy: ${globalPolicy.defaultPrivacy}`);
    console.log(`    costSensitivity: ${globalPolicy.costSensitivity}`);
  }

  // --- Application Policies ---
  console.log('\n[3/5] Validating application policies...');
  const appPolicyFiles = ['thingsteadPolicy.json', 'processSwarmPolicy.json'];
  for (const file of appPolicyFiles) {
    const policy = loadJson<ApplicationPolicySeed>(`../../config/policies/${file}`);
    const errors = validateApplicationPolicy(policy);
    if (errors.length > 0) {
      hasErrors = true;
      console.error(`  ERRORS in ${file}:`, errors);
    } else {
      console.log(`  OK — would UPSERT application_policies: ${policy.application}`);
      console.log(`    overrides keys: ${Object.keys(policy.overrides).join(', ')}`);
    }
  }

  // --- Model Profiles ---
  console.log('\n[4/5] Validating model profiles...');
  const modelProfiles = loadJson<ModelProfileSeed[]>('../../config/profiles/modelProfiles.json');
  for (const profile of modelProfiles) {
    const errors = validateModelProfile(profile);
    if (errors.length > 0) {
      hasErrors = true;
      console.error(`  ERRORS in profile "${profile.name}":`, errors);
    } else {
      console.log(`  OK — would UPSERT model_profiles: ${profile.name}`);
      console.log(`    taskTypes: ${JSON.stringify(profile.supportedTaskTypes)}`);
      console.log(`    loadTiers: ${JSON.stringify(profile.supportedLoadTiers)}`);
      console.log(`    grade: ${profile.minimumCognitiveGrade}, local: ${profile.localOnly}, cloud: ${profile.cloudAllowed}`);
    }
  }

  // --- Tactic Profiles ---
  console.log('\n[5/5] Validating tactic profiles...');
  const tacticProfiles = loadJson<TacticProfileSeed[]>('../../config/profiles/tacticProfiles.json');
  for (const profile of tacticProfiles) {
    const errors = validateTacticProfile(profile);
    if (errors.length > 0) {
      hasErrors = true;
      console.error(`  ERRORS in tactic "${profile.name}":`, errors);
    } else {
      console.log(`  OK — would UPSERT tactic_profiles: ${profile.name}`);
      console.log(`    method: ${profile.executionMethod}, multiStage: ${profile.multiStage}, structured: ${profile.requiresStructuredOutput}`);
    }
  }

  // --- Summary ---
  console.log('\n=== Summary ===');
  console.log(`Providers: ${providers.length}`);
  console.log(`Global policies: 1`);
  console.log(`Application policies: ${appPolicyFiles.length}`);
  console.log(`Model profiles: ${modelProfiles.length}`);
  console.log(`Tactic profiles: ${tacticProfiles.length}`);

  if (hasErrors) {
    console.error('\nValidation FAILED — fix errors before seeding.');
    process.exit(1);
  } else {
    console.log('\nAll seed data is valid. Ready to insert into PostgreSQL.');
  }
}

validateSeeds();
