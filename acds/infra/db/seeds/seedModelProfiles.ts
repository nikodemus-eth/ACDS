import { Client } from 'pg';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

interface ModelProfileSeed {
  name: string;
  supportedTaskTypes: string[];
  supportedLoadTiers: string[];
  minimumCognitiveGrade: string;
  localOnly: boolean;
  cloudAllowed: boolean;
}

async function seedModelProfiles(): Promise<void> {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });

  const profilesPath = resolve(
    __dirname,
    '../../config/profiles/modelProfiles.json'
  );
  const profiles: ModelProfileSeed[] = JSON.parse(
    readFileSync(profilesPath, 'utf-8')
  );

  try {
    await client.connect();
    console.log('[seed] Connected to database.');

    for (const profile of profiles) {
      await client.query(
        `INSERT INTO model_profiles (
          name,
          supported_task_types,
          supported_load_tiers,
          minimum_cognitive_grade,
          local_only,
          cloud_allowed
        ) VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (name) DO UPDATE SET
          supported_task_types = EXCLUDED.supported_task_types,
          supported_load_tiers = EXCLUDED.supported_load_tiers,
          minimum_cognitive_grade = EXCLUDED.minimum_cognitive_grade,
          local_only = EXCLUDED.local_only,
          cloud_allowed = EXCLUDED.cloud_allowed,
          updated_at = NOW()`,
        [
          profile.name,
          JSON.stringify(profile.supportedTaskTypes),
          JSON.stringify(profile.supportedLoadTiers),
          profile.minimumCognitiveGrade,
          profile.localOnly,
          profile.cloudAllowed,
        ]
      );
      console.log(`[seed] Upserted model profile: ${profile.name}`);
    }

    console.log(
      `[seed] Successfully seeded ${profiles.length} model profile(s).`
    );
  } catch (error) {
    console.error('[seed] Failed to seed model profiles:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

seedModelProfiles();
