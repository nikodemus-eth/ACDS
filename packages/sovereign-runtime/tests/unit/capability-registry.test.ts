import { describe, it, expect, beforeEach } from 'vitest';
import { CapabilityRegistry } from '../../src/registry/capability-registry.js';
import { CAPABILITY_CONTRACTS, CAPABILITY_IDS } from '../../src/domain/capability-taxonomy.js';
import { InvalidRegistrationError } from '../../src/domain/errors.js';
import { FREE_COST, LOCAL_LATENCY } from '../../src/domain/cost-types.js';
import type { CapabilityBinding } from '../../src/registry/capability-binding.js';
import type { CapabilityContract } from '../../src/domain/capability-contract.js';
import { createDefaultCapabilityRegistry } from '../../src/registry/default-registry.js';
import { z } from 'zod';

describe('CapabilityRegistry', () => {
  let registry: CapabilityRegistry;

  const testContract: CapabilityContract = {
    id: 'test.cap',
    version: '1.0',
    category: 'text',
    inputSchema: z.object({ text: z.string() }),
    outputSchema: z.object({ result: z.string() }),
    deterministic: true,
    description: 'Test capability',
  };

  const testBinding: CapabilityBinding = {
    capabilityId: 'test.cap',
    capabilityVersion: '1.0',
    providerId: 'test-provider',
    methodId: 'test.method',
    cost: FREE_COST,
    latency: LOCAL_LATENCY,
    reliability: 0.95,
    locality: 'local',
  };

  beforeEach(() => {
    registry = new CapabilityRegistry();
  });

  describe('registerContract', () => {
    it('registers a new contract', () => {
      registry.registerContract(testContract);
      expect(registry.hasCapability('test.cap')).toBe(true);
      expect(registry.contractCount).toBe(1);
    });

    it('throws on duplicate registration', () => {
      registry.registerContract(testContract);
      expect(() => registry.registerContract(testContract)).toThrow(InvalidRegistrationError);
    });
  });

  describe('bindProvider', () => {
    it('binds a provider to a registered contract', () => {
      registry.registerContract(testContract);
      registry.bindProvider(testBinding);
      expect(registry.getBindings('test.cap')).toHaveLength(1);
    });

    it('throws when binding to unregistered capability', () => {
      expect(() => registry.bindProvider(testBinding)).toThrow(InvalidRegistrationError);
    });

    it('throws on duplicate provider+method binding', () => {
      registry.registerContract(testContract);
      registry.bindProvider(testBinding);
      expect(() => registry.bindProvider(testBinding)).toThrow(InvalidRegistrationError);
    });

    it('allows multiple bindings for same capability from different methods', () => {
      registry.registerContract(testContract);
      registry.bindProvider(testBinding);
      registry.bindProvider({ ...testBinding, methodId: 'test.method2' });
      expect(registry.getBindings('test.cap')).toHaveLength(2);
    });
  });

  describe('getContract', () => {
    it('returns undefined for unregistered capability', () => {
      expect(registry.getContract('nonexistent')).toBeUndefined();
    });

    it('returns the contract for registered capability', () => {
      registry.registerContract(testContract);
      const result = registry.getContract('test.cap');
      expect(result?.id).toBe('test.cap');
    });
  });

  describe('getBindings', () => {
    it('returns empty array for capability with no bindings', () => {
      registry.registerContract(testContract);
      expect(registry.getBindings('test.cap')).toEqual([]);
    });

    it('returns empty array for unregistered capability', () => {
      expect(registry.getBindings('nonexistent')).toEqual([]);
    });
  });

  describe('getLocalBindings', () => {
    it('filters to local-only bindings', () => {
      registry.registerContract(testContract);
      registry.bindProvider(testBinding);
      registry.bindProvider({
        ...testBinding,
        methodId: 'test.remote',
        providerId: 'remote-provider',
        locality: 'remote',
      });
      const localOnly = registry.getLocalBindings('test.cap');
      expect(localOnly).toHaveLength(1);
      expect(localOnly[0].locality).toBe('local');
    });
  });

  describe('getAllContracts', () => {
    it('returns all registered contracts', () => {
      registry.registerContract(testContract);
      registry.registerContract({ ...testContract, id: 'test.cap2' });
      expect(registry.getAllContracts()).toHaveLength(2);
    });
  });
});

describe('createDefaultCapabilityRegistry', () => {
  it('registers all 18 canonical contracts', () => {
    const registry = createDefaultCapabilityRegistry();
    expect(registry.contractCount).toBe(18);
  });

  it('has bindings for all Apple-covered capabilities', () => {
    const registry = createDefaultCapabilityRegistry();

    // text.generate should have 1 binding
    expect(registry.getBindings(CAPABILITY_IDS.TEXT_GENERATE).length).toBeGreaterThanOrEqual(1);

    // text.summarize should have 2 bindings (foundation_models + writing_tools)
    expect(registry.getBindings(CAPABILITY_IDS.TEXT_SUMMARIZE)).toHaveLength(2);

    // speech.transcribe should have 4 bindings
    expect(registry.getBindings(CAPABILITY_IDS.SPEECH_TRANSCRIBE)).toHaveLength(4);

    // speech.synthesize should have 2 bindings
    expect(registry.getBindings(CAPABILITY_IDS.SPEECH_SYNTHESIZE)).toHaveLength(2);

    // image.ocr should have 2 bindings
    expect(registry.getBindings(CAPABILITY_IDS.IMAGE_OCR)).toHaveLength(2);
  });

  it('all Apple bindings are local and free', () => {
    const registry = createDefaultCapabilityRegistry();
    for (const id of Object.values(CAPABILITY_IDS)) {
      for (const binding of registry.getBindings(id)) {
        if (binding.providerId === 'apple-intelligence-runtime') {
          expect(binding.locality).toBe('local');
          expect(binding.cost.model).toBe('free');
          expect(binding.cost.unitCost).toBe(0);
        }
      }
    }
  });

  it('has 17 total Apple bindings across all capabilities', () => {
    const registry = createDefaultCapabilityRegistry();
    let totalBindings = 0;
    for (const id of Object.values(CAPABILITY_IDS)) {
      totalBindings += registry.getBindings(id).length;
    }
    expect(totalBindings).toBe(17);
  });

  it('capabilities without Apple methods have no bindings', () => {
    const registry = createDefaultCapabilityRegistry();
    // These capabilities have no Apple method mapping
    expect(registry.getBindings(CAPABILITY_IDS.TEXT_CLASSIFY)).toHaveLength(0);
    expect(registry.getBindings(CAPABILITY_IDS.TEXT_EMBED)).toHaveLength(0);
    expect(registry.getBindings(CAPABILITY_IDS.IMAGE_DESCRIBE)).toHaveLength(0);
    expect(registry.getBindings(CAPABILITY_IDS.AGENT_CONTROL_DECIDE)).toHaveLength(0);
    expect(registry.getBindings(CAPABILITY_IDS.ROUTER_SCORE)).toHaveLength(0);
    expect(registry.getBindings(CAPABILITY_IDS.POLICY_EVALUATE)).toHaveLength(0);
    expect(registry.getBindings(CAPABILITY_IDS.RISK_ASSESS)).toHaveLength(0);
  });
});
