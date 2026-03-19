import type { ImageGenerateInput } from '../apple-interfaces.js';
import { fakeImageGenerate } from '../apple-fakes.js';
import { MethodNotAvailableError } from '../../../domain/errors.js';

export function executeImage(method: string, input: unknown): unknown {
  const shortMethod = method.replace('apple.image_creator.', '');
  if (shortMethod !== 'generate') {
    throw new MethodNotAvailableError(method, 'apple-intelligence-runtime');
  }
  return fakeImageGenerate(input as ImageGenerateInput);
}
