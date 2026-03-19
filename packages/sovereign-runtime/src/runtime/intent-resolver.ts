/**
 * Intent Resolver — maps free-text task descriptions to structured intents.
 *
 * This is a deterministic, keyword-based resolver. It does not use LLMs
 * for intent classification — that would create a circular dependency.
 * The resolver is a pure function with no side effects.
 */

export type Intent =
  | 'summarization'
  | 'transcription'
  | 'speech_output'
  | 'ocr'
  | 'translation'
  | 'image_generation'
  | 'sound_classification'
  | 'text_generation'
  | 'text_extraction'
  | 'text_rewrite'
  | 'text_proofread';

export interface ResolvedIntent {
  intent: Intent;
  confidence: number;
}

/**
 * Keyword patterns for each intent, ordered by specificity.
 * First match wins — more specific patterns go first.
 */
const INTENT_PATTERNS: Array<{ intent: Intent; patterns: RegExp[] }> = [
  {
    intent: 'ocr',
    patterns: [
      /\b(ocr|extract\s+text\s+from\s+(this\s+|the\s+|a\s+)?(image|screenshot|photo|picture|scan))\b/i,
      /\b(read\s+(the\s+)?(text|words)\s+(in|from|on)\s+(this|the|a)\s+(image|screenshot|photo|picture|scan))\b/i,
    ],
  },
  {
    intent: 'transcription',
    patterns: [
      /\b(transcrib(e|tion)|speech[\s-]to[\s-]text)\b/i,
      /\b(convert\s+(this\s+)?audio\s+to\s+text)\b/i,
    ],
  },
  {
    intent: 'speech_output',
    patterns: [
      /\bread\s+.{1,30}\s+aloud\b/i,
      /\b(speak|narrat(e|ion)|text[\s-]to[\s-]speech|tts)\b/i,
      /\b(say\s+(this|it)\s+out\s+loud)\b/i,
    ],
  },
  {
    intent: 'sound_classification',
    patterns: [
      /\b(classif(y|ication)\s+(this\s+)?sound|sound\s+(classif|analys|detect))\b/i,
      /\b(identify\s+(this\s+)?sound|what\s+sound\s+is\s+this)\b/i,
    ],
  },
  {
    intent: 'image_generation',
    patterns: [
      /\b(generat(e|ion)\s+(an?\s+)?image|creat(e|ion)\s+(an?\s+)?image|draw|illustrat(e|ion))\b/i,
      /\b(make\s+(me\s+)?(an?\s+)?image|image\s+generat)\b/i,
    ],
  },
  {
    intent: 'translation',
    patterns: [
      /\b(translat(e|ion)|convert\s+to\s+\w+\s+language)\b/i,
    ],
  },
  {
    intent: 'text_proofread',
    patterns: [
      /\b(proofread|proof[\s-]read|check\s+(the\s+)?(grammar|spelling))\b/i,
    ],
  },
  {
    intent: 'text_rewrite',
    patterns: [
      /\b(rewrite|re[\s-]write|rephrase|paraphrase)\b/i,
    ],
  },
  {
    intent: 'text_extraction',
    patterns: [
      /\b(extract\s+(the\s+)?(data|information|entities|fields|key\s+points))\b/i,
    ],
  },
  {
    intent: 'summarization',
    patterns: [
      /\b(summariz(e|ation)|summary|tldr|tl;dr|brief\s+overview)\b/i,
      /\b(give\s+me\s+(a\s+)?summary)\b/i,
    ],
  },
  {
    intent: 'text_generation',
    patterns: [
      /\b(generat(e|ion)\s+(text|content|response)|write|compose|draft)\b/i,
    ],
  },
];

/**
 * Resolve a task description to a structured intent.
 * Returns undefined if no intent could be matched.
 */
export function resolveIntent(task: string): ResolvedIntent | undefined {
  const normalizedTask = task.trim().toLowerCase();

  for (const { intent, patterns } of INTENT_PATTERNS) {
    for (const pattern of patterns) {
      if (pattern.test(normalizedTask)) {
        return { intent, confidence: 1.0 };
      }
    }
  }

  return undefined;
}
