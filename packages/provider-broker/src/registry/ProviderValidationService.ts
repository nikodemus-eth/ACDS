import type { Provider, ProviderVendor, AuthType } from '@acds/core-types';

const VALID_VENDORS = new Set(['ollama', 'lmstudio', 'gemini', 'openai']);
const VALID_AUTH_TYPES = new Set(['none', 'api_key', 'oauth', 'local']);

export class ProviderValidationService {
  validate(input: Omit<Provider, 'id' | 'createdAt' | 'updatedAt'>): string[] {
    const errors: string[] = [];

    if (!input.name || input.name.trim().length === 0) {
      errors.push('Provider name is required');
    }

    if (!VALID_VENDORS.has(input.vendor)) {
      errors.push(`Invalid vendor: ${input.vendor}. Must be one of: ${[...VALID_VENDORS].join(', ')}`);
    }

    if (!VALID_AUTH_TYPES.has(input.authType)) {
      errors.push(`Invalid auth type: ${input.authType}. Must be one of: ${[...VALID_AUTH_TYPES].join(', ')}`);
    }

    if (!input.baseUrl) {
      errors.push('Base URL is required');
    } else {
      try {
        new URL(input.baseUrl);
      } catch {
        errors.push(`Invalid base URL: ${input.baseUrl}`);
      }
    }

    if (!input.environment || input.environment.trim().length === 0) {
      errors.push('Environment is required');
    }

    return errors;
  }
}
