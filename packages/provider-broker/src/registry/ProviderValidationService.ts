import { ProviderVendor, AuthType } from '@acds/core-types';
import type { Provider } from '@acds/core-types';

const VALID_VENDORS = new Set<string>(Object.values(ProviderVendor));
const VALID_AUTH_TYPES = new Set<string>(Object.values(AuthType));
const LOCAL_VENDORS = new Set<string>([
  ProviderVendor.OLLAMA,
  ProviderVendor.LMSTUDIO,
]);
const BLOCKED_HOSTS = new Set([
  '0.0.0.0',
  '127.0.0.1',
  '::1',
  'localhost',
  'metadata.google.internal',
]);

function isPrivateOrSpecialHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();

  if (BLOCKED_HOSTS.has(normalized)) {
    return true;
  }

  if (/^169\.254\./.test(normalized)) return true;
  if (/^10\./.test(normalized)) return true;
  if (/^192\.168\./.test(normalized)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(normalized)) return true;
  if (/^127\./.test(normalized)) return true;
  if (/^0x[0-9a-f]+$/i.test(normalized)) return true;
  if (/^\[?fe80:/i.test(normalized)) return true;
  if (/^\[?fc/i.test(normalized) || /^\[?fd/i.test(normalized)) return true;

  return false;
}

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
        const parsed = new URL(input.baseUrl);
        const protocol = parsed.protocol.toLowerCase();
        const hostname = parsed.hostname.toLowerCase();

        if (input.baseUrl.length > 2048) {
          errors.push('Base URL must be 2048 characters or fewer');
        }

        if (!['http:', 'https:'].includes(protocol)) {
          errors.push('Base URL must use http:// or https://');
        }

        if (parsed.username || parsed.password) {
          errors.push('Base URL must not contain embedded credentials');
        }

        if (!hostname) {
          errors.push('Base URL must include a hostname');
        }

        if (LOCAL_VENDORS.has(input.vendor)) {
          if (!isPrivateOrSpecialHostname(hostname)) {
            errors.push('Local providers must use a loopback or private-network hostname');
          }
        } else {
          if (protocol !== 'https:') {
            errors.push('Cloud providers must use https://');
          }
          if (isPrivateOrSpecialHostname(hostname)) {
            errors.push('Cloud providers must not target loopback, link-local, or private-network hosts');
          }
        }
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
