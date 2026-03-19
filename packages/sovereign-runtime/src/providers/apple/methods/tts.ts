import type { TTSInput } from '../apple-interfaces.js';
import { renderAudio, speakText } from '../apple-local-engine.js';
import { MethodNotAvailableError } from '../../../domain/errors.js';

export type TTSMethod = 'speak' | 'render_audio';

const handlers: Record<TTSMethod, (input: TTSInput) => unknown> = {
  speak: speakText,
  render_audio: renderAudio,
};

export function executeTTS(method: string, input: unknown): unknown {
  const shortMethod = method.replace('apple.tts.', '') as TTSMethod;
  const handler = handlers[shortMethod];
  if (!handler) {
    throw new MethodNotAvailableError(method, 'apple-intelligence-runtime');
  }
  return handler(input as TTSInput);
}
