import { Client } from 'pg';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

interface TacticProfileSeed {
  name: string;
  executionMethod: string;
  multiStage: boolean;
  requiresStructuredOutput: boolean;
}

async function seedTacticProfiles(): Promise<void> {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });

  const profilesPath = resolve(
    __dirname,
    '../../config/profiles/tacticProfiles.json'
  );
  const profiles: TacticProfileSeed[] = JSON.parse(
    readFileSync(profilesPath, 'utf-8')
  );

  try {
    await client.connect();
    console.log('[seed] Connected to database.');

    for (const profile of profiles) {
      await client.query(
        `INSERT INTO tactic_profiles (
          name,
          execution_method,
          multi_stage,
          requires_structured_output
        ) VALUES ($1, $2, $3, $4)
        ON CONFLICT (name) DO UPDATE SET
          execution_method = EXCLUDED.execution_method,
          multi_stage = EXCLUDED.multi_stage,
          requires_structured_output = EXCLUDED.requires_structured_output,
          updated_at = NOW()`,
        [
          profile.name,
          profile.executionMethod,
          profile.multiStage,
          profile.requiresStructuredOutput,
        ]
      );
      console.log(`[seed] Upserted tactic profile: ${profile.name}`);
    }

    console.log(
      `[seed] Successfully seeded ${profiles.length} tactic profile(s).`
    );
  } catch (error) {
    console.error('[seed] Failed to seed tactic profiles:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

seedTacticProfiles();
