import type { WritingToolInput } from '../apple-interfaces.js';
import { fakeRewrite, fakeProofread, fakeWritingSummarize } from '../apple-fakes.js';
import { MethodNotAvailableError } from '../../../domain/errors.js';

export type WritingToolMethod = 'rewrite' | 'proofread' | 'summarize';

const handlers: Record<WritingToolMethod, (input: WritingToolInput) => unknown> = {
  rewrite: fakeRewrite,
  proofread: fakeProofread,
  summarize: fakeWritingSummarize,
};

export function executeWritingTool(method: string, input: unknown): unknown {
  const shortMethod = method.replace('apple.writing_tools.', '') as WritingToolMethod;
  const handler = handlers[shortMethod];
  if (!handler) {
    throw new MethodNotAvailableError(method, 'apple-intelligence-runtime');
  }
  return handler(input as WritingToolInput);
}
