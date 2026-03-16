export interface LMStudioConfig {
  baseUrl: string;
  timeout?: number;
}

export const DEFAULT_LMSTUDIO_CONFIG: Partial<LMStudioConfig> = {
  baseUrl: 'http://localhost:1234',
  timeout: 30000,
};
