export interface OllamaConfig {
  baseUrl: string;
  timeout?: number;
}

export const DEFAULT_OLLAMA_CONFIG: Partial<OllamaConfig> = {
  baseUrl: 'http://localhost:11434',
  timeout: 30000,
};
