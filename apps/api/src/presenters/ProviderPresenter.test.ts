import { describe, it, expect } from 'vitest';
import { ProviderPresenter } from './ProviderPresenter.js';

const now = new Date('2026-03-15T10:00:00Z');

function makeProvider(id: string) {
  return {
    id,
    name: `Provider ${id}`,
    vendor: 'openai',
    authType: 'api_key',
    baseUrl: 'https://api.openai.com',
    enabled: true,
    environment: 'production',
    createdAt: now,
    updatedAt: now,
  };
}

describe('ProviderPresenter', () => {
  it('toView formats dates as ISO strings and omits secrets', () => {
    const view = ProviderPresenter.toView(makeProvider('p1') as any);
    expect(view.id).toBe('p1');
    expect(view.createdAt).toBe('2026-03-15T10:00:00.000Z');
    expect(view.updatedAt).toBe('2026-03-15T10:00:00.000Z');
    expect(view.health).toBeUndefined();
  });

  it('toView includes health when provided', () => {
    const health = {
      status: 'healthy',
      lastTestAt: now,
      lastSuccessAt: now,
      lastFailureAt: null,
      latencyMs: 100,
      message: 'ok',
    };
    const view = ProviderPresenter.toView(makeProvider('p1') as any, health as any);
    expect(view.health).toBeDefined();
    expect(view.health!.status).toBe('healthy');
    expect(view.health!.lastTestAt).toBe('2026-03-15T10:00:00.000Z');
    expect(view.health!.lastFailureAt).toBeNull();
  });

  it('toViewList formats multiple providers', () => {
    const views = ProviderPresenter.toViewList(
      [makeProvider('p1'), makeProvider('p2')] as any[],
    );
    expect(views).toHaveLength(2);
    expect(views[0].id).toBe('p1');
    expect(views[1].id).toBe('p2');
  });

  it('toViewList with healthMap applies health to matching providers', () => {
    const healthMap = new Map<string, any>();
    healthMap.set('p1', {
      status: 'degraded',
      lastTestAt: now,
      lastSuccessAt: null,
      lastFailureAt: now,
      latencyMs: 500,
      message: 'slow',
    });

    const views = ProviderPresenter.toViewList(
      [makeProvider('p1'), makeProvider('p2')] as any[],
      healthMap,
    );
    expect(views[0].health?.status).toBe('degraded');
    expect(views[1].health).toBeUndefined();
  });
});
