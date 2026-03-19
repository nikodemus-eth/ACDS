/**
 * Fake Apple platform bindings for testing.
 *
 * These produce realistic stub responses that satisfy the output schemas
 * without requiring actual Apple framework access. The architecture is real;
 * only the platform boundary is stubbed.
 */

import type * as I from './apple-interfaces.js';

export function fakeGenerate(input: I.FoundationModelInput): I.GenerateOutput {
  return {
    generatedText: `Generated response for: ${input.text.substring(0, 50)}`,
    tokenCount: Math.ceil(input.text.length / 4),
  };
}

export function fakeSummarize(input: I.FoundationModelInput): I.SummarizeOutput {
  const words = input.text.split(/\s+/);
  const summaryWords = words.slice(0, Math.max(5, Math.ceil(words.length * 0.2)));
  return {
    summary: summaryWords.join(' ') + '...',
    tokenCount: summaryWords.length,
  };
}

export function fakeExtract(input: I.FoundationModelInput): I.ExtractOutput {
  return {
    entities: [
      { type: 'text_fragment', value: input.text.substring(0, 30), confidence: 0.92 },
    ],
  };
}

export function fakeRewrite(input: I.WritingToolInput): I.RewriteOutput {
  return {
    rewrittenText: `Rewritten: ${input.text}`,
  };
}

export function fakeProofread(input: I.WritingToolInput): I.ProofreadOutput {
  return {
    correctedText: input.text,
    corrections: [],
  };
}

export function fakeWritingSummarize(input: I.WritingToolInput): I.WritingSummarizeOutput {
  return {
    summary: `Summary of: ${input.text.substring(0, 40)}...`,
  };
}

export function fakeTranscribeFile(input: I.TranscribeFileInput): I.TranscriptOutput {
  return {
    transcript: 'Transcribed audio content from file.',
    segments: [{ text: 'Transcribed audio content from file.', startTime: 0, endTime: 3.5 }],
    language: input.language ?? 'en',
    confidence: 0.95,
  };
}

export function fakeTranscribeLive(_input: I.TranscribeLiveInput): I.TranscriptOutput {
  return {
    transcript: 'Live transcription segment.',
    segments: [{ text: 'Live transcription segment.', startTime: 0, endTime: 1.2 }],
    language: 'en',
    confidence: 0.88,
  };
}

export function fakeTranscribeLongform(input: I.TranscribeFileInput): I.TranscriptOutput {
  return {
    transcript: 'Long-form transcription of extended audio.',
    segments: [
      { text: 'Long-form transcription', startTime: 0, endTime: 60 },
      { text: 'of extended audio.', startTime: 60, endTime: 120 },
    ],
    language: input.language ?? 'en',
    confidence: 0.91,
  };
}

export function fakeDictationFallback(input: I.TranscribeFileInput): I.TranscriptOutput {
  return {
    transcript: 'Dictation fallback transcription.',
    segments: [{ text: 'Dictation fallback transcription.', startTime: 0, endTime: 2.0 }],
    language: input.language ?? 'en',
    confidence: 0.80,
  };
}

export function fakeSpeak(input: I.TTSInput): I.SpeakOutput {
  return {
    status: 'completed',
    durationMs: input.text.length * 60, // ~60ms per character approximation
  };
}

export function fakeRenderAudio(input: I.TTSInput): I.RenderAudioOutput {
  return {
    artifactRef: `audio://tts/${Date.now()}.m4a`,
    format: 'm4a',
    durationMs: input.text.length * 60,
    sizeBytes: input.text.length * 120,
  };
}

export function fakeOCR(input: I.VisionInput): I.OCROutput {
  return {
    extractedText: 'Extracted text from image analysis.',
    confidence: 0.94,
    regions: [
      {
        text: 'Extracted text from image analysis.',
        bounds: { x: 10, y: 10, width: 200, height: 30 },
        confidence: 0.94,
      },
    ],
  };
}

export function fakeDocumentExtract(_input: I.VisionInput): I.DocumentExtractOutput {
  return {
    pages: [
      {
        pageNumber: 1,
        text: 'Document page content extracted.',
        tables: [],
      },
    ],
  };
}

export function fakeImageGenerate(input: I.ImageGenerateInput): I.ImageGenerateOutput {
  return {
    artifactRef: `image://generated/${Date.now()}.png`,
    format: 'png',
    width: 1024,
    height: 1024,
  };
}

export function fakeTranslate(input: I.TranslationInput): I.TranslationOutput {
  return {
    translatedText: `[${input.targetLanguage}] ${input.text}`,
    detectedLanguage: input.sourceLanguage ?? 'en',
    targetLanguage: input.targetLanguage,
  };
}

export function fakeSoundClassify(_input: I.SoundClassifyInput): I.SoundClassifyOutput {
  return {
    events: [
      { label: 'speech', confidence: 0.85, timeRange: { start: 0, end: 2.5 } },
      { label: 'music', confidence: 0.62, timeRange: { start: 2.5, end: 5.0 } },
    ],
  };
}
