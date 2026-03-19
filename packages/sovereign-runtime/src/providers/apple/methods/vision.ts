import type { VisionInput } from '../apple-interfaces.js';
import { extractDocument, performOCR } from '../apple-local-engine.js';
import { MethodNotAvailableError } from '../../../domain/errors.js';

export type VisionMethod = 'ocr' | 'document_extract';

const handlers: Record<VisionMethod, (input: VisionInput) => unknown> = {
  ocr: performOCR,
  document_extract: extractDocument,
};

export function executeVision(method: string, input: unknown): unknown {
  const shortMethod = method.replace('apple.vision.', '') as VisionMethod;
  const handler = handlers[shortMethod];
  if (!handler) {
    throw new MethodNotAvailableError(method, 'apple-intelligence-runtime');
  }
  return handler(input as VisionInput);
}
