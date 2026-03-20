// ---------------------------------------------------------------------------
// Seed Providers — Inserts default provider configurations into PostgreSQL
// ---------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));

interface ProviderSeed {
  name: string;
  vendor: string;
  authType: string;
  baseUrl: string;
  environment: string;
}

const VALID_VENDORS = ['ollama', 'apple'];
const VALID_AUTH_TYPES = ['none', 'api_key', 'bearer_token', 'custom'];

function validateProvider(data: ProviderSeed): string[] {
  const errors: string[] = [];

  if (typeof data.name !== 'string' || data.name.trim().length === 0) {
    errors.push('name must be a non-empty string');
  }

  if (!VALID_VENDORS.includes(data.vendor)) {
    errors.push(`Unknown vendor: ${data.vendor}`);
  }

  if (!VALID_AUTH_TYPES.includes(data.authType)) {
    errors.push(`Unknown authType: ${data.authType}`);
  }

  if (typeof data.baseUrl !== 'string' || data.baseUrl.trim().length === 0) {
    errors.push('baseUrl must be a non-empty string');
  }

  if (typeof data.environment !== 'string' || data.environment.trim().length === 0) {
    errors.push('environment must be a non-empty string');
  }

  return errors;
}

export async function seedProviders(pool: pg.Pool): Promise<number> {
  const providers = JSON.parse(
    readFileSync(resolve(__dirname, '../../config/providers/defaultProviders.json'), 'utf-8'),
  ) as ProviderSeed[];

  let inserted = 0;

  for (const provider of providers) {
    const errors = validateProvider(provider);
    if (errors.length > 0) {
      console.error(`  ERRORS in provider "${provider.name}":`, errors);
      continue;
    }

    // Upsert by name+vendor to avoid duplicates on re-run
    const result = await pool.query(
      `INSERT INTO providers (name, vendor, auth_type, base_url, environment)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [provider.name, provider.vendor, provider.authType, provider.baseUrl, provider.environment],
    );

    if (result.rowCount && result.rowCount > 0) {
      console.log(`  Inserted provider: ${provider.name} (${provider.vendor})`);
      inserted++;
    } else {
      console.log(`  Skipped provider (already exists): ${provider.name}`);
    }
  }

  return inserted;
}
