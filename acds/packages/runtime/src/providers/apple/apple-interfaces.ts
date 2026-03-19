/**
 * Platform boundary interfaces for Apple Intelligence subsystems.
 *
 * These define the contract a real Apple framework integration would fulfill.
 * In tests we use deterministic fakes that implement these interfaces.
 */

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------
export interface TranscriptionSegment {
  readonly text: string;
  readonly start_ms: number;
  readonly end_ms: number;
}

export interface TranscriptionResult {
  readonly text: string;
  readonly confidence: number;
  readonly segments: readonly TranscriptionSegment[];
}

export interface AudioArtifact {
  readonly artifact_path: string;
  readonly format: string;
  readonly duration_ms: number;
}

export interface OcrRegion {
  readonly text: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface OcrResult {
  readonly text: string;
  readonly confidence: number;
  readonly regions: readonly OcrRegion[];
}

export interface DocumentExtractionResult {
  readonly text: string;
  readonly fields: Record<string, string>;
  readonly confidence: number;
}

export interface ProofreadSuggestion {
  readonly original: string;
  readonly suggestion: string;
  readonly offset: number;
}

export interface ProofreadResult {
  readonly corrected: string;
  readonly suggestions: readonly ProofreadSuggestion[];
}

export interface ImageArtifact {
  readonly artifact_path: string;
  readonly width: number;
  readonly height: number;
}

export interface TranslationResult {
  readonly translated: string;
  readonly source_language: string;
  readonly target_language: string;
}

export interface SoundEvent {
  readonly label: string;
  readonly confidence: number;
}

export interface SoundClassificationResult {
  readonly events: readonly SoundEvent[];
}

export interface GenerateOptions {
  readonly max_tokens?: number;
  readonly temperature?: number;
}

// ---------------------------------------------------------------------------
// Platform interfaces
// ---------------------------------------------------------------------------
export interface AppleFoundationModelsPlatform {
  generate(prompt: string, options?: GenerateOptions): Promise<string>;
  summarize(text: string): Promise<string>;
  extract(text: string, schema: Record<string, unknown>): Promise<Record<string, unknown>>;
}

export interface AppleSpeechPlatform {
  transcribeLive(audioStream: unknown): Promise<TranscriptionResult>;
  transcribeFile(path: string): Promise<TranscriptionResult>;
  transcribeLongform(path: string): Promise<TranscriptionResult>;
  dictationFallback(audioStream: unknown): Promise<TranscriptionResult>;
}

export interface AppleTtsPlatform {
  speak(text: string, voice?: string): Promise<void>;
  renderAudio(text: string, voice?: string, format?: string): Promise<AudioArtifact>;
}

export interface AppleVisionPlatform {
  ocr(imagePath: string): Promise<OcrResult>;
  documentExtract(imagePath: string): Promise<DocumentExtractionResult>;
}

export interface AppleWritingToolsPlatform {
  rewrite(text: string, tone?: string): Promise<string>;
  proofread(text: string): Promise<ProofreadResult>;
  summarize(text: string): Promise<string>;
}

export interface AppleImagePlatform {
  generate(prompt: string, style?: string): Promise<ImageArtifact>;
}

export interface AppleTranslationPlatform {
  translate(text: string, targetLang: string): Promise<TranslationResult>;
}

export interface AppleSoundPlatform {
  classify(audioPath: string): Promise<SoundClassificationResult>;
}

// ---------------------------------------------------------------------------
// Aggregate platform bundle
// ---------------------------------------------------------------------------
export interface ApplePlatformBundle {
  readonly foundationModels: AppleFoundationModelsPlatform;
  readonly speech: AppleSpeechPlatform;
  readonly tts: AppleTtsPlatform;
  readonly vision: AppleVisionPlatform;
  readonly writingTools: AppleWritingToolsPlatform;
  readonly image: AppleImagePlatform;
  readonly translation: AppleTranslationPlatform;
  readonly sound: AppleSoundPlatform;
}
