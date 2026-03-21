// ---------------------------------------------------------------------------
// Capability Test Console – types for the provider capability testing surface
// ---------------------------------------------------------------------------

export type InputMode =
  | 'text_prompt'
  | 'image_prompt'
  | 'image_upload'
  | 'tts_prompt'
  | 'audio_input'
  | 'long_text'
  | 'structured_options';

export type OutputMode = 'text' | 'image' | 'audio' | 'json' | 'error';

export interface CapabilityManifestEntry {
  capabilityId: string;
  label: string;
  description: string;
  category: string;
  inputMode: InputMode;
  outputMode: OutputMode;
  available: boolean;
  settingsSchema?: Record<string, unknown>;
}

export interface CapabilityTestRequest {
  input: Record<string, unknown>;
  settings?: Record<string, unknown>;
}

export interface CapabilityTestResponse {
  success: boolean;
  providerId: string;
  capabilityId: string;
  durationMs: number;
  output: { type: OutputMode; value: unknown };
  rawResponse: Record<string, unknown>;
  error?: { code: string; message: string; detail?: string };
  timestamp: string;
}
