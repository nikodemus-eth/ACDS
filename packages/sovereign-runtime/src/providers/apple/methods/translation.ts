import type { TranslationInput } from '../apple-interfaces.js';
import { fakeTranslate } from '../apple-fakes.js';
import { MethodNotAvailableError } from '../../../domain/errors.js';

export function executeTranslation(method: string, input: unknown): unknown {
  const shortMethod = method.replace('apple.translation.', '');
  if (shortMethod !== 'translate') {
    throw new MethodNotAvailableError(method, 'apple-intelligence-runtime');
  }
  return fakeTranslate(input as TranslationInput);
}
