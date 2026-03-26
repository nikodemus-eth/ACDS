import type { Cadence, IntegritySnapshot } from '@acds/grits';
import { createPgRepositoryContext } from './repositories/createPgRepositoryContext.js';
import { runFastIntegrityCheck } from './handlers/runFastIntegrityCheck.js';
import { runDailyIntegrityCheck } from './handlers/runDailyIntegrityCheck.js';
import { runReleaseIntegrityCheck } from './handlers/runReleaseIntegrityCheck.js';
import { isReleaseBlockingSnapshot } from './cli/exitPolicy.js';
import { writeSnapshotArtifact } from './cli/writeSnapshotArtifact.js';

async function runCadence(cadence: Cadence): Promise<IntegritySnapshot> {
  const context = createPgRepositoryContext();
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
  const cadence = (process.argv[2] as Cadence | undefined) ?? 'release';
  const snapshot = await runCadence(cadence);
  const artifact = await writeSnapshotArtifact(snapshot, process.env.GRITS_OUTPUT_PATH);
  console.log(`[grits-cli-pg] Snapshot artifact written to ${artifact}`);

  if (cadence === 'release' && isReleaseBlockingSnapshot(snapshot)) {
    console.error('[grits-cli-pg] Release gate failed: blocking GRITS defects detected.');
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('[grits-cli-pg] Fatal error:', error);
  process.exit(1);
});
