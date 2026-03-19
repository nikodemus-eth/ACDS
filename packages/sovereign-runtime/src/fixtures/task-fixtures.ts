/**
 * Reusable task input samples for testing.
 */
export const TASK_FIXTURES = {
  summarize: { task: 'summarize this document', input: { text: 'The quick brown fox jumps over the lazy dog. This is a test document for summarization.' } },
  transcribe: { task: 'transcribe this audio file', input: { audioData: 'base64audiocontent', language: 'en' } },
  readAloud: { task: 'read this report aloud', input: { text: 'Quarterly financial report for Q3 2025.' } },
  ocr: { task: 'extract text from this screenshot', input: { imageData: 'base64imagedata' } },
  translate: { task: 'translate this text', input: { text: 'Hello world', targetLanguage: 'es' } },
  generateImage: { task: 'generate an image of a sunset', input: { prompt: 'A sunset over the ocean' } },
  classifySound: { task: 'classify this sound', input: { audioData: 'base64sounddata' } },
} as const;
