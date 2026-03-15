import type { Provider } from '@acds/core-types';
import {
  ProviderHealthService,
  ProviderConnectionTester,
  type ProviderRepository,
  type ProviderHealthRepository,
  AdapterResolver,
} from '@acds/provider-broker';

/**
 * Calls ProviderHealthService to check all enabled providers.
 *
 * In a full implementation, the repository and adapter instances would be
 * injected via a DI container. For the MVP, they are constructed inline
 * using environment-driven configuration.
 */
export async function runProviderHealthChecks(): Promise<void> {
  // TODO: Replace with DI-resolved instances once container is wired
  const providerRepository = getProviderRepository();
  const healthRepository = getHealthRepository();
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

/**
 * Placeholder factory for ProviderRepository.
 * Will be replaced by DI container resolution.
 */
function getProviderRepository(): ProviderRepository {
  // TODO: Wire to actual database-backed repository
  throw new Error(
    'ProviderRepository not yet wired. Configure DI container or set DATABASE_URL.'
  );
}

/**
 * Placeholder factory for ProviderHealthRepository.
 * Will be replaced by DI container resolution.
 */
function getHealthRepository(): ProviderHealthRepository {
  // TODO: Wire to actual database-backed repository
  throw new Error(
    'ProviderHealthRepository not yet wired. Configure DI container or set DATABASE_URL.'
  );
}
