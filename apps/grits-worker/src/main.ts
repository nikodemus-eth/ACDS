import { registerJobs } from './bootstrap/registerJobs.js';
import type { JobDefinition } from './bootstrap/registerJobs.js';

interface RunningJob {
  definition: JobDefinition;
  timer: ReturnType<typeof setInterval>;
}

async function main(): Promise<void> {
  console.log('[grits-worker] Starting GRITS integrity worker...');

  const jobs = registerJobs();
  const running: RunningJob[] = [];

  for (const job of jobs) {
    console.log(
      `[grits-worker] Registering job "${job.name}" with interval ${job.intervalMs}ms`
    );

    // Run immediately on startup, then on interval
    void runJob(job);

    if (job.intervalMs > 0) {
      const timer = setInterval(() => void runJob(job), job.intervalMs);
      running.push({ definition: job, timer });
    }
  }

  console.log(`[grits-worker] ${running.length} recurring job(s) registered.`);

  // In release mode, exit after first run completes
  if (process.env.GRITS_RELEASE_MODE === 'true') {
    console.log('[grits-worker] Release mode — will exit after completion.');
    return;
  }

  // Graceful shutdown
  const shutdown = (): void => {
    console.log('[grits-worker] Shutting down...');
    for (const { definition, timer } of running) {
      clearInterval(timer);
      console.log(`[grits-worker] Stopped job "${definition.name}"`);
    }
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

async function runJob(job: JobDefinition): Promise<void> {
  try {
    const start = Date.now();
    await job.handler();
    const elapsed = Date.now() - start;
    console.log(`[grits-worker] Job "${job.name}" completed in ${elapsed}ms`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[grits-worker] Job "${job.name}" failed: ${message}`);
  }
}

main().catch((error) => {
  console.error('[grits-worker] Fatal error:', error);
  process.exit(1);
});
