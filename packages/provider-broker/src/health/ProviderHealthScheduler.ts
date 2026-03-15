import type { ProviderRepository } from '../registry/ProviderRepository.js';
import type { ProviderConnectionTester } from '../execution/ProviderConnectionTester.js';
import type { ProviderHealthService } from './ProviderHealthService.js';

export interface HealthCheckSchedulerConfig {
  intervalMs: number;
  enabled: boolean;
}

export class ProviderHealthScheduler {
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly providerRepository: ProviderRepository,
    private readonly connectionTester: ProviderConnectionTester,
    private readonly healthService: ProviderHealthService,
    private readonly config: HealthCheckSchedulerConfig
  ) {}

  start(): void {
    if (!this.config.enabled || this.timer) return;
    this.timer = setInterval(() => void this.runChecks(), this.config.intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async runChecks(): Promise<void> {
    const providers = await this.providerRepository.findEnabled();
    for (const provider of providers) {
      try {
        const result = await this.connectionTester.testConnection(provider);
        if (result.success) {
          await this.healthService.recordSuccess(provider.id, result.latencyMs);
        } else {
          await this.healthService.recordFailure(provider.id, result.message);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        await this.healthService.recordFailure(provider.id, message);
      }
    }
  }
}
