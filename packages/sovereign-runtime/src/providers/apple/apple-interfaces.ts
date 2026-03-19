/**
 * TypeScript interfaces for Apple subsystem input/output contracts.
 * These define the structured boundaries between ACDS and Apple platform APIs.
 */

// ── Foundation Models ──

export interface FoundationModelInput {
  text: string;
  maxTokens?: number;
  temperature?: number;
}

export interface GenerateOutput {
  generatedText: string;
  tokenCount: number;
}

export interface SummarizeOutput {
  summary: string;
  tokenCount: number;
}

export interface ExtractOutput {
  entities: Array<{ type: string; value: string; confidence: number }>;
}

// ── Writing Tools ──

export interface WritingToolInput {
  text: string;
}

export interface RewriteOutput {
  rewrittenText: string;
}

export interface ProofreadOutput {
  correctedText: string;
  corrections: Array<{ original: string; corrected: string; position: number }>;
}

export interface WritingSummarizeOutput {
  summary: string;
}

// ── Speech Input ──

export interface TranscribeFileInput {
  audioData: string; // base64-encoded or file reference
  language?: string;
}

export interface TranscribeLiveInput {
  sampleRate: number;
  language?: string;
}

export interface TranscriptOutput {
  transcript: string;
  segments: Array<{ text: string; startTime: number; endTime: number }>;
  language: string;
  confidence: number;
}

// ── Speech Output (TTS) ──

export interface TTSInput {
  text: string;
  voice?: string;
  rate?: number;
}

export interface SpeakOutput {
  status: 'completed' | 'interrupted';
  durationMs: number;
}

export interface RenderAudioOutput {
  artifactRef: string;
  format: string;
  durationMs: number;
  sizeBytes: number;
}

// ── Vision ──

export interface VisionInput {
  imageData: string; // base64-encoded or file reference
}

export interface OCROutput {
  extractedText: string;
  confidence: number;
  regions: Array<{ text: string; bounds: { x: number; y: number; width: number; height: number }; confidence: number }>;
}

export interface DocumentExtractOutput {
  pages: Array<{ pageNumber: number; text: string; tables: unknown[] }>;
}

// ── Image Generation ──

export interface ImageGenerateInput {
  prompt: string;
  style?: string;
}

export interface ImageGenerateOutput {
  artifactRef: string;
  format: string;
  width: number;
  height: number;
}

// ── Translation ──

export interface TranslationInput {
  text: string;
  targetLanguage: string;
  sourceLanguage?: string;
}

export interface TranslationOutput {
  translatedText: string;
  detectedLanguage: string;
  targetLanguage: string;
}

// ── Sound Analysis ──

export interface SoundClassifyInput {
  audioData: string;
}

export interface SoundClassifyOutput {
  events: Array<{ label: string; confidence: number; timeRange: { start: number; end: number } }>;
}
