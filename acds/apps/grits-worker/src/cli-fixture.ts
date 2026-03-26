import type { Cadence, IntegritySnapshot } from '@acds/grits';
import { createFixtureRepositoryContext } from './repositories/createFixtureRepositoryContext.js';
import { runFastIntegrityCheck } from './handlers/runFastIntegrityCheck.js';
import { runDailyIntegrityCheck } from './handlers/runDailyIntegrityCheck.js';
import { runReleaseIntegrityCheck } from './handlers/runReleaseIntegrityCheck.js';
import { writeSnapshotArtifact } from './cli/writeSnapshotArtifact.js';

async function runCadence(cadence: Cadence): Promise<IntegritySnapshot> {
  const context = createFixtureRepositoryContext();
  switch (cadence) {
    case 'fast':
      return runFastIntegrityCheck(context);
    case 'daily':
      return runDailyIntegrityCheck(context);
    case 'release':
      return runReleaseIntegrityCheck(context);
  }
}

async function main(): Promise<void> {
  const cadence = (process.argv[2] as Cadence | undefined) ?? 'fast';
  const snapshot = await runCadence(cadence);
  const artifact = await writeSnapshotArtifact(snapshot, process.env.GRITS_OUTPUT_PATH);
  console.log(`[grits-cli-fixture] Snapshot artifact written to ${artifact}`);
}

main().catch((error) => {
  console.error('[grits-cli-fixture] Fatal error:', error);
  process.exit(1);
});
