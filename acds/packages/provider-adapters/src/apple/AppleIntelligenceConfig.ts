export interface AppleIntelligenceConfig {
  baseUrl: string;
  timeout?: number;
}

export const DEFAULT_APPLE_INTELLIGENCE_CONFIG: Partial<AppleIntelligenceConfig> = {
  baseUrl: 'http://localhost:11435',
  timeout: 30000,
};
