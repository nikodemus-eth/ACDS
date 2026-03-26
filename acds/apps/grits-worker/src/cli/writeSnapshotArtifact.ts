import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { IntegritySnapshot } from '@acds/grits';

export async function writeSnapshotArtifact(snapshot: IntegritySnapshot, outputPath?: string): Promise<string> {
  const resolvedPath = resolve(outputPath ?? `.artifacts/grits/${snapshot.cadence}-snapshot.json`);
  await mkdir(dirname(resolvedPath), { recursive: true });
  await writeFile(resolvedPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
  return resolvedPath;
}
