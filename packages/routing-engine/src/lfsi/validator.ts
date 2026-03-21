// LFSI MVP — Capability-Level Validation
// Spec reference: Section 12 (Validation Requirements)

import type { InferenceResult, ValidationResult } from './types.js';

export function validateResult(capability: string, result: InferenceResult): ValidationResult {
  const failures: string[] = [];

  const text = result.rawText ?? (typeof result.output?.text === 'string' ? result.output.text : '');

  switch (capability) {
    case 'text.summarize':
      if (!text || text.trim().length === 0) failures.push('empty_summary');
      else if (text.trim().length < 10) failures.push('summary_too_short');
      break;

    case 'text.rewrite':
      if (!text || text.trim().length === 0) failures.push('empty_rewrite');
      break;

    case 'text.extract.structured': {
      if (!text || text.trim().length === 0) {
        failures.push('empty_extraction');
      } else {
        try {
          const parsed = JSON.parse(text);
          if (typeof parsed !== 'object' || parsed === null) {
            failures.push('extraction_not_object');
          }
        } catch {
          failures.push('extraction_invalid_json');
        }
      }
      break;
    }

    case 'reasoning.deep':
    case 'reasoning.light':
      if (!text || text.trim().length === 0) failures.push('empty_reasoning');
      break;

    case 'speech.tts':
      // Provider must confirm execution — content should be non-empty
      if (!text && !result.output?.status && !result.output?.audioData) {
        failures.push('tts_no_confirmation');
      }
      break;

    case 'speech.stt':
      if (!text || text.trim().length === 0) failures.push('empty_transcript');
      break;

    case 'intent.classify':
    case 'text.generate.short':
    case 'text.generate.long':
    case 'code.assist.basic':
      if (!text || text.trim().length === 0) failures.push('empty_output');
      break;

    default:
      // Unknown capability — let it pass, router handles unknown capability rejection
      break;
  }

  const passed = failures.length === 0;
  return {
    passed,
    confidence: passed ? 0.9 : 0.3,
    failures,
    nextAction: passed ? 'return' : 'escalate',
  };
}
