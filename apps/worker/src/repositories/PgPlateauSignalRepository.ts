import type { Pool } from 'pg';
import type { PlateauSignal } from '@acds/adaptive-optimizer';
import type { PlateauSignalRepository } from '../handlers/runPlateauDetection.js';
import type { PlateauSignalReader } from '../handlers/runAdaptationRecommendations.js';

export class PgPlateauSignalRepository implements PlateauSignalRepository, PlateauSignalReader {
  constructor(private readonly pool: Pool) {}

  async saveSignal(signal: PlateauSignal): Promise<void> {
    await this.pool.query(
      `INSERT INTO plateau_signals (family_key, detected, severity, flat_quality, rising_cost, rising_correction_burden, repeated_fallbacks, persistent_underperformance, detected_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        signal.familyKey,
        signal.detected,
        signal.severity,
        signal.indicators.flatQuality,
        signal.indicators.risingCost,
        signal.indicators.risingCorrectionBurden,
        signal.indicators.repeatedFallbacks,
        signal.indicators.persistentUnderperformance,
        signal.detectedAt,
      ],
    );
  }

  async listActivePlateaus(): Promise<PlateauSignal[]> {
    const result = await this.pool.query(
      `SELECT * FROM plateau_signals WHERE detected = TRUE ORDER BY created_at DESC`,
    );
    return result.rows.map((r) => this.mapRow(r));
  }

  private mapRow(row: Record<string, unknown>): PlateauSignal {
    return {
      familyKey: row.family_key as string,
      detected: row.detected as boolean,
      severity: row.severity as PlateauSignal['severity'],
      indicators: {
        flatQuality: row.flat_quality as boolean,
        risingCost: row.rising_cost as boolean,
        risingCorrectionBurden: row.rising_correction_burden as boolean,
        repeatedFallbacks: row.repeated_fallbacks as boolean,
        persistentUnderperformance: row.persistent_underperformance as boolean,
      },
      detectedAt: row.detected_at as string,
    };
  }
}
