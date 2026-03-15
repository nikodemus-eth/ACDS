import { registerJobs } from './bootstrap/registerJobs.js';
import type { JobDefinition } from './bootstrap/registerJobs.js';

interface RunningJob {
  definition: JobDefinition;
  timer: ReturnType<typeof setInterval>;
}

async function main(): Promise<void> {
  console.log('[worker] Starting ACDS worker process...');

  const jobs = registerJobs();
  const running: RunningJob[] = [];

  for (const job of jobs) {
    console.log(
      `[worker] Registering job "${job.name}" with interval ${job.intervalMs}ms`
    );

    // Run immediately on startup, then on interval
    void runJob(job);

    const timer = setInterval(() => void runJob(job), job.intervalMs);
    running.push({ definition: job, timer });
  }

  console.log(`[worker] ${running.length} job(s) registered and running.`);

  // Graceful shutdown
  const shutdown = (): void => {
    console.log('[worker] Shutting down...');
    for (const { definition, timer } of running) {
      clearInterval(timer);
      console.log(`[worker] Stopped job "${definition.name}"`);
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
    console.log(`[worker] Job "${job.name}" completed in ${elapsed}ms`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[worker] Job "${job.name}" failed: ${message}`);
  }
}

main().catch((error) => {
  console.error('[worker] Fatal error:', error);
  process.exit(1);
});
