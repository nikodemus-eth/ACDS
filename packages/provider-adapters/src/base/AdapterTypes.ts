export interface AdapterRequest {
  prompt: string;
  systemPrompt?: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  stopSequences?: string[];
  responseFormat?: 'text' | 'json';
  /** Subsystem method for multi-capability providers (e.g. 'image_creator.generate' for Apple Intelligence). */
  method?: string;
  /** Target language code for translation (e.g. 'es', 'fr'). */
  targetLanguage?: string;
  /** Source language code hint for translation/speech. */
  sourceLanguage?: string;
  /** Voice identifier for TTS. */
  voice?: string;
  /** Speech rate for TTS (0.0–1.0). */
  rate?: number;
}

export interface AdapterResponse {
  content: string;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
  finishReason: 'stop' | 'length' | 'error' | 'unknown';
  latencyMs: number;
  rawMetadata?: Record<string, unknown>;
}

export interface AdapterConnectionResult {
  success: boolean;
  latencyMs: number;
  message: string;
  models?: string[];
}

export interface AdapterConfig {
  baseUrl: string;
  apiKey?: string;
  timeout?: number;
  additionalHeaders?: Record<string, string>;
}
