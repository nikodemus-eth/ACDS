import { createHash } from 'node:crypto';

import type {
  DocumentExtractOutput,
  ExtractOutput,
  FoundationModelInput,
  GenerateOutput,
  ImageGenerateInput,
  ImageGenerateOutput,
  OCROutput,
  ProofreadOutput,
  RenderAudioOutput,
  RewriteOutput,
  SoundClassifyInput,
  SoundClassifyOutput,
  SpeakOutput,
  SummarizeOutput,
  TranscriptOutput,
  TranscribeFileInput,
  TranscribeLiveInput,
  TranslationInput,
  TranslationOutput,
  TTSInput,
  VisionInput,
  WritingSummarizeOutput,
  WritingToolInput,
} from './apple-interfaces.js';

const DEFAULT_VOICE = 'Samantha';
const DEFAULT_IMAGE_SIZE = 1024;
const SENTENCE_BOUNDARY = /(?<=[.!?])\s+/;

const TYPO_CORRECTIONS: Array<[RegExp, string]> = [
  [/\bteh\b/gi, 'the'],
  [/\brecieve\b/gi, 'receive'],
  [/\bsentance\b/gi, 'sentence'],
  [/\bspeling\b/gi, 'spelling'],
  [/\bThs\b/g, 'This'],
];

const TRANSLATION_DICTIONARY: Record<string, Record<string, string>> = {
  es: {
    hello: 'hola',
    world: 'mundo',
    how: 'como',
    are: 'estas',
    you: 'tu',
  },
  fr: {
    hello: 'bonjour',
    world: 'monde',
  },
};

function stableHash(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 12);
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function splitWords(text: string): string[] {
  return normalizeWhitespace(text)
    .split(/\s+/)
    .filter(Boolean);
}

function toSentenceCase(text: string): string {
  const trimmed = normalizeWhitespace(text);
  if (trimmed.length === 0) {
    return '';
  }

  const capitalized = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  return /[.!?]$/.test(capitalized) ? capitalized : `${capitalized}.`;
}

function selectSummarySentences(text: string, maxSentences = 2): string[] {
  const sentences = normalizeWhitespace(text)
    .split(SENTENCE_BOUNDARY)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  if (sentences.length === 0) {
    return [];
  }

  return sentences.slice(0, Math.max(1, Math.min(maxSentences, sentences.length)));
}

function estimateTokenCount(text: string): number {
  return Math.max(1, Math.ceil(normalizeWhitespace(text).length / 4));
}

function inferLanguage(text: string): string {
  const normalized = text.toLowerCase();
  if (/[¿¡]/.test(text) || /\b(hola|gracias|adios)\b/.test(normalized)) {
    return 'es';
  }
  if (/\b(bonjour|merci|monde)\b/.test(normalized)) {
    return 'fr';
  }
  return 'en';
}

function buildArtifactRef(kind: 'audio' | 'image', payload: string, extension: string): string {
  return `${kind}://${stableHash(payload)}.${extension}`;
}

function buildSegments(transcript: string, segmentCount: number, secondsPerSegment: number): TranscriptOutput['segments'] {
  const words = splitWords(transcript);
  const chunkSize = Math.max(1, Math.ceil(words.length / segmentCount));
  const segments: TranscriptOutput['segments'] = [];

  for (let index = 0; index < segmentCount; index++) {
    const chunk = words.slice(index * chunkSize, (index + 1) * chunkSize);
    if (chunk.length === 0) {
      continue;
    }
    segments.push({
      text: chunk.join(' '),
      startTime: Number((index * secondsPerSegment).toFixed(1)),
      endTime: Number(((index + 1) * secondsPerSegment).toFixed(1)),
    });
  }

  return segments;
}

function deriveAudioNarrative(audioData: string): string {
  if (normalizeWhitespace(audioData).length === 0) {
    return 'Audio input was empty.';
  }

  const hash = stableHash(audioData);
  return `Local audio sample ${hash} contains intelligible speech.`;
}

function replaceWords(text: string, dictionary: Record<string, string>): string {
  return text.replace(/\b[\p{L}']+\b/gu, (word) => {
    const translated = dictionary[word.toLowerCase()];
    if (!translated) {
      return word;
    }
    return /^[A-Z]/.test(word)
      ? translated.charAt(0).toUpperCase() + translated.slice(1)
      : translated;
  });
}

export function generateText(input: FoundationModelInput): GenerateOutput {
  const text = normalizeWhitespace(input.text);
  const promptSummary = selectSummarySentences(text, 1)[0] ?? text;
  return {
    generatedText: toSentenceCase(`Generated response: ${promptSummary}`),
    tokenCount: estimateTokenCount(text),
  };
}

export function summarizeText(input: FoundationModelInput): SummarizeOutput {
  const text = normalizeWhitespace(input.text);
  const summarySentences = selectSummarySentences(text, 2);
  const summary = summarySentences.length > 0 ? summarySentences.join(' ') : 'No content provided.';
  return {
    summary,
    tokenCount: estimateTokenCount(summary),
  };
}

export function extractEntities(input: FoundationModelInput): ExtractOutput {
  const text = normalizeWhitespace(input.text);
  const entities = new Map<string, { type: string; value: string; confidence: number }>();
  const addEntity = (type: string, value: string, confidence: number) => {
    const normalized = value.trim();
    if (normalized.length > 0 && !entities.has(`${type}:${normalized}`)) {
      entities.set(`${type}:${normalized}`, { type, value: normalized, confidence });
    }
  };

  for (const match of text.matchAll(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g)) {
    addEntity('proper_noun', match[1], 0.89);
  }
  for (const match of text.matchAll(/\b(\d+(?:\.\d+)?)\b/g)) {
    addEntity('number', match[1], 0.86);
  }

  if (entities.size === 0 && text.length > 0) {
    addEntity('text_fragment', text.slice(0, 40), 0.75);
  }

  return {
    entities: Array.from(entities.values()),
  };
}

export function rewriteText(input: WritingToolInput): RewriteOutput {
  const text = normalizeWhitespace(input.text);
  return {
    rewrittenText: toSentenceCase(`Rewritten: ${text}`),
  };
}

export function proofreadText(input: WritingToolInput): ProofreadOutput {
  const corrections: ProofreadOutput['corrections'] = [];
  let correctedText = input.text;

  for (const [pattern, replacement] of TYPO_CORRECTIONS) {
    correctedText = correctedText.replace(pattern, (match, offset) => {
      corrections.push({ original: match, corrected: replacement, position: offset });
      return replacement;
    });
  }

  correctedText = toSentenceCase(correctedText);
  return {
    correctedText,
    corrections,
  };
}

export function summarizeWriting(input: WritingToolInput): WritingSummarizeOutput {
  return {
    summary: summarizeText({ text: input.text }).summary,
  };
}

export function transcribeFile(input: TranscribeFileInput): TranscriptOutput {
  const transcript = deriveAudioNarrative(input.audioData);
  return {
    transcript,
    segments: buildSegments(transcript, 1, 3.5),
    language: input.language ?? 'en',
    confidence: normalizeWhitespace(input.audioData).length === 0 ? 0.4 : 0.95,
  };
}

export function transcribeLive(input: TranscribeLiveInput): TranscriptOutput {
  const transcript = `Live transcription captured at ${input.sampleRate}Hz.`;
  return {
    transcript,
    segments: buildSegments(transcript, 1, 1.2),
    language: input.language ?? 'en',
    confidence: 0.88,
  };
}

export function transcribeLongform(input: TranscribeFileInput): TranscriptOutput {
  const transcript = `${deriveAudioNarrative(input.audioData)} Long-form continuation preserved.`;
  return {
    transcript,
    segments: buildSegments(transcript, 2, 60),
    language: input.language ?? 'en',
    confidence: 0.91,
  };
}

export function dictateFallback(input: TranscribeFileInput): TranscriptOutput {
  const transcript = `Fallback dictation: ${deriveAudioNarrative(input.audioData)}`;
  return {
    transcript,
    segments: buildSegments(transcript, 1, 2),
    language: input.language ?? 'en',
    confidence: 0.8,
  };
}

export function speakText(input: TTSInput): SpeakOutput {
  const text = normalizeWhitespace(input.text);
  const rate = input.rate && input.rate > 0 ? input.rate : 1;
  return {
    status: 'completed',
    durationMs: Math.max(60, Math.round((text.length * 60) / rate)),
  };
}

export function renderAudio(input: TTSInput): RenderAudioOutput {
  const speech = speakText(input);
  const payload = `${input.voice ?? DEFAULT_VOICE}:${normalizeWhitespace(input.text)}`;
  return {
    artifactRef: buildArtifactRef('audio', payload, 'm4a'),
    format: 'm4a',
    durationMs: speech.durationMs,
    sizeBytes: Math.max(256, normalizeWhitespace(input.text).length * 120),
  };
}

export function performOCR(input: VisionInput): OCROutput {
  const imageFingerprint = stableHash(input.imageData);
  const extractedText = `Extracted text from image ${imageFingerprint}.`;
  return {
    extractedText,
    confidence: 0.94,
    regions: [
      {
        text: extractedText,
        bounds: { x: 10, y: 10, width: 220, height: 32 },
        confidence: 0.94,
      },
    ],
  };
}

export function extractDocument(input: VisionInput): DocumentExtractOutput {
  const ocr = performOCR(input);
  return {
    pages: [
      {
        pageNumber: 1,
        text: ocr.extractedText,
        tables: [],
      },
    ],
  };
}

export function generateImage(input: ImageGenerateInput): ImageGenerateOutput {
  const payload = `${input.style ?? 'default'}:${normalizeWhitespace(input.prompt)}`;
  return {
    artifactRef: buildArtifactRef('image', payload, 'png'),
    format: 'png',
    width: DEFAULT_IMAGE_SIZE,
    height: DEFAULT_IMAGE_SIZE,
  };
}

export function translateText(input: TranslationInput): TranslationOutput {
  const detectedLanguage = input.sourceLanguage ?? inferLanguage(input.text);
  const dictionary = TRANSLATION_DICTIONARY[input.targetLanguage];
  const translatedText = dictionary
    ? replaceWords(input.text, dictionary)
    : `[${input.targetLanguage}] ${normalizeWhitespace(input.text)}`;

  return {
    translatedText: toSentenceCase(translatedText),
    detectedLanguage,
    targetLanguage: input.targetLanguage,
  };
}

export function classifySound(input: SoundClassifyInput): SoundClassifyOutput {
  const normalized = normalizeWhitespace(input.audioData).toLowerCase();
  const events: SoundClassifyOutput['events'] = [];

  events.push({
    label: normalized.includes('music') ? 'music' : 'speech',
    confidence: 0.85,
    timeRange: { start: 0, end: 2.5 },
  });

  if (normalized.includes('alarm') || normalized.includes('beep')) {
    events.push({
      label: 'alarm',
      confidence: 0.77,
      timeRange: { start: 2.5, end: 5 },
    });
  } else {
    events.push({
      label: 'ambient',
      confidence: 0.62,
      timeRange: { start: 2.5, end: 5 },
    });
  }

  return { events };
}
