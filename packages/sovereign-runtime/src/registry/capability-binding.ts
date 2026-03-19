import type { CostProfile, LatencyProfile } from '../domain/cost-types.js';

export interface CapabilityBinding {
  capabilityId: string;
  capabilityVersion: string;
  providerId: string;
  methodId: string;
  cost: CostProfile;
  latency: LatencyProfile;
  reliability: number; // 0-1
  locality: 'local' | 'remote';
}
