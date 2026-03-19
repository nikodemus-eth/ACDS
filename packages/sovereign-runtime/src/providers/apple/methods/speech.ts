import type { TranscribeFileInput, TranscribeLiveInput } from '../apple-interfaces.js';
import {
  dictateFallback,
  transcribeFile,
  transcribeLive,
  transcribeLongform,
} from '../apple-local-engine.js';
import { MethodNotAvailableError } from '../../../domain/errors.js';

export type SpeechMethod = 'transcribe_file' | 'transcribe_live' | 'transcribe_longform' | 'dictation_fallback';

const handlers: Record<SpeechMethod, (input: unknown) => unknown> = {
  transcribe_file: (input) => transcribeFile(input as TranscribeFileInput),
  transcribe_live: (input) => transcribeLive(input as TranscribeLiveInput),
  transcribe_longform: (input) => transcribeLongform(input as TranscribeFileInput),
  dictation_fallback: (input) => dictateFallback(input as TranscribeFileInput),
};

export function executeSpeech(method: string, input: unknown): unknown {
  const shortMethod = method.replace('apple.speech.', '') as SpeechMethod;
  const handler = handlers[shortMethod];
  if (!handler) {
    throw new MethodNotAvailableError(method, 'apple-intelligence-runtime');
  }
  return handler(input);
}
