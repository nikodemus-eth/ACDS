export interface GeminiConfig {
  baseUrl: string;
  apiKey: string;
  timeout?: number;
}

export const DEFAULT_GEMINI_CONFIG: Partial<GeminiConfig> = {
  baseUrl: 'https://generativelanguage.googleapis.com',
  timeout: 30000,
};
