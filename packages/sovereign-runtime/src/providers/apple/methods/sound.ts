import type { SoundClassifyInput } from '../apple-interfaces.js';
import { fakeSoundClassify } from '../apple-fakes.js';
import { MethodNotAvailableError } from '../../../domain/errors.js';

export function executeSound(method: string, input: unknown): unknown {
  const shortMethod = method.replace('apple.sound.', '');
  if (shortMethod !== 'classify') {
    throw new MethodNotAvailableError(method, 'apple-intelligence-runtime');
  }
  return fakeSoundClassify(input as SoundClassifyInput);
}
