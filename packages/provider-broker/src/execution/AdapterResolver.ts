import type { ProviderAdapter } from '@acds/provider-adapters';

export class AdapterResolver {
  private readonly adapters = new Map<string, ProviderAdapter>();

  register(vendorName: string, adapter: ProviderAdapter): void {
    this.adapters.set(vendorName, adapter);
  }

  resolve(vendorName: string): ProviderAdapter {
    const adapter = this.adapters.get(vendorName);
    if (!adapter) {
      throw new Error(`No adapter registered for vendor: ${vendorName}`);
    }
    return adapter;
  }

  listRegistered(): string[] {
    return [...this.adapters.keys()];
  }

  has(vendorName: string): boolean {
    return this.adapters.has(vendorName);
  }
}
