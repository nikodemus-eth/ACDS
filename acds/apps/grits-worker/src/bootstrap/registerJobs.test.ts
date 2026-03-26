import { afterEach, describe, expect, it } from 'vitest';
import { registerJobs } from './registerJobs.js';

describe('registerJobs', () => {
  afterEach(() => {
    delete process.env.GRITS_RELEASE_MODE;
  });

  it('returns only the release job in release mode', () => {
    process.env.GRITS_RELEASE_MODE = 'true';
    const jobs = registerJobs();
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.name).toBe('grits-release-integrity');
  });

  it('returns recurring jobs outside release mode', () => {
    const jobs = registerJobs();
    expect(jobs.map((job) => job.name)).toEqual([
      'grits-fast-integrity',
      'grits-daily-integrity',
    ]);
  });
});
