import { z } from 'zod';

export type CapabilityCategory = 'text' | 'speech' | 'image' | 'control' | 'governance' | 'sound' | 'translation';

export interface CapabilityContract {
  /** Dot-separated capability identifier, e.g. "text.summarize" */
  id: string;
  /** Semver-style version, e.g. "1.0" */
  version: string;
  /** Broad functional category */
  category: CapabilityCategory;
  /** Zod schema describing valid input payloads */
  inputSchema: z.ZodType;
  /** Zod schema describing valid output payloads */
  outputSchema: z.ZodType;
  /** Whether the capability is expected to be deterministic */
  deterministic: boolean;
  /** Human-readable description */
  description: string;
}
