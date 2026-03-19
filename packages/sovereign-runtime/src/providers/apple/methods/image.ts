import type { ImageGenerateInput } from '../apple-interfaces.js';
import { generateImage } from '../apple-local-engine.js';
import { MethodNotAvailableError } from '../../../domain/errors.js';

export function executeImage(method: string, input: unknown): unknown {
  const shortMethod = method.replace('apple.image_creator.', '');
  if (shortMethod !== 'generate') {
    throw new MethodNotAvailableError(method, 'apple-intelligence-runtime');
  }
  return generateImage(input as ImageGenerateInput);
}
