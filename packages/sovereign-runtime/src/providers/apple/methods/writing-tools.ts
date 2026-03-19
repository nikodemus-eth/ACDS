import type { WritingToolInput } from '../apple-interfaces.js';
import { proofreadText, rewriteText, summarizeWriting } from '../apple-local-engine.js';
import { MethodNotAvailableError } from '../../../domain/errors.js';

export type WritingToolMethod = 'rewrite' | 'proofread' | 'summarize';

const handlers: Record<WritingToolMethod, (input: WritingToolInput) => unknown> = {
  rewrite: rewriteText,
  proofread: proofreadText,
  summarize: summarizeWriting,
};

export function executeWritingTool(method: string, input: unknown): unknown {
  const shortMethod = method.replace('apple.writing_tools.', '') as WritingToolMethod;
  const handler = handlers[shortMethod];
  if (!handler) {
    throw new MethodNotAvailableError(method, 'apple-intelligence-runtime');
  }
  return handler(input as WritingToolInput);
}
