import type { ProviderRuntime, MethodExecutionResult, ProviderHealthResult } from '../provider-runtime.js';
import { MethodNotAvailableError, ProviderUnavailableError } from '../../domain/errors.js';
import { executeFoundationModel } from './methods/foundation-models.js';
import { executeWritingTool } from './methods/writing-tools.js';
import { executeSpeech } from './methods/speech.js';
import { executeTTS } from './methods/tts.js';
import { executeVision } from './methods/vision.js';
import { executeImage } from './methods/image.js';
import { executeTranslation } from './methods/translation.js';
import { executeSound } from './methods/sound.js';

/**
 * Subsystem dispatch table. Maps method ID prefixes to subsystem handlers.
 */
const SUBSYSTEM_DISPATCH: Record<string, (method: string, input: unknown) => unknown | Promise<unknown>> = {
  'apple.foundation_models.': executeFoundationModel,
  'apple.writing_tools.': executeWritingTool,
  'apple.speech.': executeSpeech,
  'apple.tts.': executeTTS,
  'apple.vision.': executeVision,
  'apple.image_creator.': executeImage,
  'apple.translation.': executeTranslation,
  'apple.sound.': executeSound,
};

/**
 * Apple Sovereign Runtime Adapter.
 *
 * Dispatches method calls to the correct subsystem handler based on
 * the fully qualified method ID. This is a method-level runtime,
 * not a generic text endpoint.
 */
export class AppleRuntimeAdapter implements ProviderRuntime {
  readonly providerId = 'apple-intelligence-runtime';
  private _available = true;

  async execute(methodId: string, input: unknown): Promise<MethodExecutionResult> {
    if (!this._available) {
      throw new ProviderUnavailableError(this.providerId);
    }

    const handler = this.findHandler(methodId);
    if (!handler) {
      throw new MethodNotAvailableError(methodId, this.providerId);
    }

    const start = performance.now();
    const output = await handler(methodId, input);
    const latencyMs = Math.round(performance.now() - start);

    return {
      output,
      latencyMs,
      deterministic: true,
      executionMode: 'local',
    };
  }

  async isAvailable(): Promise<boolean> {
    return this._available;
  }

  async healthCheck(): Promise<ProviderHealthResult> {
    const start = performance.now();
    const status = this._available ? 'healthy' : 'unavailable';
    return {
      status,
      latencyMs: Math.round(performance.now() - start),
      details: { platform: 'darwin', framework: 'FoundationModels' },
    };
  }

  /**
   * Simulate unavailability for testing.
   */
  setAvailable(available: boolean): void {
    this._available = available;
  }

  private findHandler(methodId: string): ((method: string, input: unknown) => unknown | Promise<unknown>) | undefined {
    for (const [prefix, handler] of Object.entries(SUBSYSTEM_DISPATCH)) {
      if (methodId.startsWith(prefix)) {
        return handler;
      }
    }
    return undefined;
  }
}
