// ---------------------------------------------------------------------------
// ProviderPresenter – formats Provider entities for API responses
// ---------------------------------------------------------------------------

import type { Provider, ProviderHealth } from '@acds/core-types';

/**
 * Public shape returned to API clients.  NEVER includes secrets.
 */
export interface ProviderView {
  id: string;
  name: string;
  vendor: string;
  authType: string;
  baseUrl: string;
  enabled: boolean;
  environment: string;
  createdAt: string;
  updatedAt: string;
  health?: ProviderHealthView;
}

export interface ProviderHealthView {
  status: string;
  lastTestAt: string | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  latencyMs: number | null;
  message: string | null;
}

export class ProviderPresenter {
  /**
   * Formats a single Provider entity for the API response.
   * Omits any secret material – only exposes safe metadata.
   */
  static toView(provider: Provider, health?: ProviderHealth | null): ProviderView {
    const view: ProviderView = {
      id: provider.id,
      name: provider.name,
      vendor: provider.vendor,
      authType: provider.authType,
      baseUrl: provider.baseUrl,
      enabled: provider.enabled,
      environment: provider.environment,
      createdAt: provider.createdAt.toISOString(),
      updatedAt: provider.updatedAt.toISOString(),
    };

    if (health) {
      view.health = {
        status: health.status,
        lastTestAt: health.lastTestAt?.toISOString() ?? null,
        lastSuccessAt: health.lastSuccessAt?.toISOString() ?? null,
        lastFailureAt: health.lastFailureAt?.toISOString() ?? null,
        latencyMs: health.latencyMs,
        message: health.message,
      };
    }

    return view;
  }

  /**
   * Formats a list of Provider entities.
   */
  static toViewList(
    providers: Provider[],
    healthMap?: Map<string, ProviderHealth>,
  ): ProviderView[] {
    return providers.map((p) =>
      ProviderPresenter.toView(p, healthMap?.get(p.id) ?? null),
    );
  }
}
