import type { FoundationModelInput, GenerateOutput, SummarizeOutput, ExtractOutput } from '../apple-interfaces.js';
import { fakeGenerate, fakeSummarize, fakeExtract } from '../apple-fakes.js';
import { MethodNotAvailableError } from '../../../domain/errors.js';

export type FoundationModelMethod = 'generate' | 'summarize' | 'extract';

const handlers: Record<FoundationModelMethod, (input: FoundationModelInput) => unknown> = {
  generate: fakeGenerate,
  summarize: fakeSummarize,
  extract: fakeExtract,
};

export function executeFoundationModel(method: string, input: unknown): unknown {
  const shortMethod = method.replace('apple.foundation_models.', '') as FoundationModelMethod;
  const handler = handlers[shortMethod];
  if (!handler) {
    throw new MethodNotAvailableError(method, 'apple-intelligence-runtime');
  }
  return handler(input as FoundationModelInput);
}
