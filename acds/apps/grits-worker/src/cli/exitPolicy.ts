import type { IntegritySnapshot } from '@acds/grits';

export function isReleaseBlockingSnapshot(snapshot: IntegritySnapshot): boolean {
  return snapshot.defectCount.critical > 0 || snapshot.defectCount.high > 0 || snapshot.overallStatus === 'red';
}
