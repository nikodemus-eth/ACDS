export interface OpenAIConfig {
  baseUrl: string;
  apiKey: string;
  timeout?: number;
  organization?: string;
}

export const DEFAULT_OPENAI_CONFIG: Partial<OpenAIConfig> = {
  baseUrl: 'https://api.openai.com',
  timeout: 30000,
};
