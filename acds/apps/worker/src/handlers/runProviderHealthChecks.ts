import type { Provider } from '@acds/core-types';
import {
  ProviderHealthService,
  ProviderConnectionTester,
  AdapterResolver,
} from '@acds/provider-broker';
import { createPool, PgProviderRepository, PgProviderHealthRepository } from '@acds/persistence-pg';

function createWorkerPool() {
  const databaseUrl = new URL(process.env.DATABASE_URL ?? 'postgresql://localhost:5432/acds');
  return createPool({
    host: databaseUrl.hostname,
    port: databaseUrl.port ? Number(databaseUrl.port) : 5432,
    database: databaseUrl.pathname.replace(/^\//, ''),
    user: decodeURIComponent(databaseUrl.username),
    password: decodeURIComponent(databaseUrl.password),
    ssl: databaseUrl.searchParams.get('sslmode') === 'require',
  });
}

export async function runProviderHealthChecks(): Promise<void> {
  const pool = createWorkerPool();
  const providerRepository = new PgProviderRepository(pool);
  const healthRepository = new PgProviderHealthRepository(pool);
  const adapterResolver = new AdapterResolver();
  const connectionTester = new ProviderConnectionTester(adapterResolver);
  const healthService = new ProviderHealthService(healthRepository);

  const providers: Provider[] = await providerRepository.findEnabled();

  if (providers.length === 0) {
    console.log('[health-check] No enabled providers to check.');
    return;
  }

  console.log(
    `[health-check] Checking ${providers.length} enabled provider(s)...`
  );

  for (const provider of providers) {
    try {
      const result = await connectionTester.testConnection(provider);
      if (result.success) {
        await healthService.recordSuccess(provider.id, result.latencyMs);
        console.log(
          `[health-check] ${provider.name}: healthy (${result.latencyMs}ms)`
        );
      } else {
        await healthService.recordFailure(provider.id, result.message);
        console.log(
          `[health-check] ${provider.name}: unhealthy - ${result.message}`
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await healthService.recordFailure(provider.id, message);
      console.error(
        `[health-check] ${provider.name}: error - ${message}`
      );
    }
  }
}
