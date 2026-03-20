import pg from 'pg';
import { seedProviders } from './seedProviders.js';
import { seedPolicies } from './seedPolicies.js';
import { seedModelProfiles } from './seedModelProfiles.js';
import { seedTacticProfiles } from './seedTacticProfiles.js';

async function main() {
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL ?? 'postgresql://acds:acds_dev@localhost:5432/acds',
  });
  try {
    console.log('Seeding providers...');
    await seedProviders(pool);
    console.log('Seeding policies...');
    await seedPolicies(pool);
    console.log('Seeding model profiles...');
    await seedModelProfiles(pool);
    console.log('Seeding tactic profiles...');
    await seedTacticProfiles(pool);
    console.log('Done!');
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
