import { describe, it, expect } from 'vitest';
import { ProviderRecordMapper } from './ProviderRecordMapper.js';
import type { ProviderRecord } from './ProviderRecordMapper.js';
import type { Provider } from '@acds/core-types';
import { ProviderVendor, AuthType } from '@acds/core-types';

const now = new Date('2025-06-01T00:00:00Z');
const later = new Date('2025-06-02T00:00:00Z');

const sampleRecord: ProviderRecord = {
  id: 'rec-1',
  name: 'OpenAI Prod',
  vendor: 'openai',
  auth_type: 'api_key',
  base_url: 'https://api.openai.com',
  enabled: true,
  environment: 'production',
  created_at: now,
  updated_at: later,
};

const sampleProvider: Provider = {
  id: 'rec-1',
  name: 'OpenAI Prod',
  vendor: ProviderVendor.OPENAI,
  authType: AuthType.API_KEY,
  baseUrl: 'https://api.openai.com',
  enabled: true,
  environment: 'production',
  createdAt: now,
  updatedAt: later,
};

describe('ProviderRecordMapper', () => {
  describe('toDomain', () => {
    it('maps a database record to a Provider domain object', () => {
      const result = ProviderRecordMapper.toDomain(sampleRecord);

      expect(result.id).toBe('rec-1');
      expect(result.name).toBe('OpenAI Prod');
      expect(result.vendor).toBe(ProviderVendor.OPENAI);
      expect(result.authType).toBe(AuthType.API_KEY);
      expect(result.baseUrl).toBe('https://api.openai.com');
      expect(result.enabled).toBe(true);
      expect(result.environment).toBe('production');
      expect(result.createdAt).toBe(now);
      expect(result.updatedAt).toBe(later);
    });

    it('maps disabled provider correctly', () => {
      const record: ProviderRecord = { ...sampleRecord, enabled: false };
      const result = ProviderRecordMapper.toDomain(record);
      expect(result.enabled).toBe(false);
    });
  });

  describe('toRecord', () => {
    it('maps a Provider domain object to a database record', () => {
      const result = ProviderRecordMapper.toRecord(sampleProvider);

      expect(result.id).toBe('rec-1');
      expect(result.name).toBe('OpenAI Prod');
      expect(result.vendor).toBe('openai');
      expect(result.auth_type).toBe('api_key');
      expect(result.base_url).toBe('https://api.openai.com');
      expect(result.enabled).toBe(true);
      expect(result.environment).toBe('production');
      expect(result.created_at).toBe(now);
      expect(result.updated_at).toBe(later);
    });
  });

  describe('round-trip', () => {
    it('toDomain(toRecord(provider)) preserves all fields', () => {
      const record = ProviderRecordMapper.toRecord(sampleProvider);
      const roundTripped = ProviderRecordMapper.toDomain(record);

      expect(roundTripped).toEqual(sampleProvider);
    });

    it('toRecord(toDomain(record)) preserves all fields', () => {
      const domain = ProviderRecordMapper.toDomain(sampleRecord);
      const roundTripped = ProviderRecordMapper.toRecord(domain);

      expect(roundTripped).toEqual(sampleRecord);
    });
  });
});
