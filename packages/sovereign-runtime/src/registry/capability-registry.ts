import type { CapabilityContract } from '../domain/capability-contract.js';
import type { CapabilityBinding } from './capability-binding.js';
import { InvalidRegistrationError } from '../domain/errors.js';

export class CapabilityRegistry {
  private contracts = new Map<string, CapabilityContract>();
  private bindings = new Map<string, CapabilityBinding[]>(); // capabilityId -> bindings[]

  registerContract(contract: CapabilityContract): void {
    if (this.contracts.has(contract.id)) {
      throw new InvalidRegistrationError(`Capability ${contract.id} already registered`);
    }
    this.contracts.set(contract.id, contract);
  }

  bindProvider(binding: CapabilityBinding): void {
    if (!this.contracts.has(binding.capabilityId)) {
      throw new InvalidRegistrationError(`Capability ${binding.capabilityId} not registered`);
    }
    const existing = this.bindings.get(binding.capabilityId) ?? [];
    // Check for duplicate provider+method
    if (existing.some((b) => b.providerId === binding.providerId && b.methodId === binding.methodId)) {
      throw new InvalidRegistrationError(`Binding already exists for ${binding.providerId}:${binding.methodId}`);
    }
    existing.push(binding);
    this.bindings.set(binding.capabilityId, existing);
  }

  getContract(capabilityId: string): CapabilityContract | undefined {
    return this.contracts.get(capabilityId);
  }

  getBindings(capabilityId: string): CapabilityBinding[] {
    return this.bindings.get(capabilityId) ?? [];
  }

  getLocalBindings(capabilityId: string): CapabilityBinding[] {
    return this.getBindings(capabilityId).filter((b) => b.locality === 'local');
  }

  getAllContracts(): CapabilityContract[] {
    return Array.from(this.contracts.values());
  }

  hasCapability(capabilityId: string): boolean {
    return this.contracts.has(capabilityId);
  }

  get contractCount(): number {
    return this.contracts.size;
  }
}
