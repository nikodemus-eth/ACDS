import type { IntegritySnapshotRepository, IntegritySnapshot, Cadence } from '@acds/grits';
import type { Pool } from '@acds/persistence-pg';

export class PgIntegritySnapshotRepository implements IntegritySnapshotRepository {
  constructor(private readonly pool: Pool) {}

  async save(snapshot: IntegritySnapshot): Promise<void> {
    await this.pool.query(
      `INSERT INTO integrity_snapshots (
         id, cadence, started_at, completed_at, total_duration_ms, results, overall_status, defect_count
       )
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8::jsonb)
       ON CONFLICT (id) DO UPDATE SET
         cadence = EXCLUDED.cadence,
         started_at = EXCLUDED.started_at,
         completed_at = EXCLUDED.completed_at,
         total_duration_ms = EXCLUDED.total_duration_ms,
         results = EXCLUDED.results,
         overall_status = EXCLUDED.overall_status,
         defect_count = EXCLUDED.defect_count`,
      [
        snapshot.id,
        snapshot.cadence,
        snapshot.startedAt,
        snapshot.completedAt,
        snapshot.totalDurationMs,
        JSON.stringify(snapshot.results),
        snapshot.overallStatus,
        JSON.stringify(snapshot.defectCount),
      ],
    );
  }

  async findById(id: string): Promise<IntegritySnapshot | undefined> {
    const result = await this.pool.query(
      'SELECT * FROM integrity_snapshots WHERE id = $1',
      [id],
    );
    return result.rows.length > 0 ? this.mapRow(result.rows[0]) : undefined;
  }

  async findLatestByCadence(cadence: Cadence): Promise<IntegritySnapshot | undefined> {
    const result = await this.pool.query(
      `SELECT * FROM integrity_snapshots
       WHERE cadence = $1
       ORDER BY completed_at DESC
       LIMIT 1`,
      [cadence],
    );
    return result.rows.length > 0 ? this.mapRow(result.rows[0]) : undefined;
  }

  async findByTimeRange(since: string, until: string): Promise<IntegritySnapshot[]> {
    const result = await this.pool.query(
      `SELECT * FROM integrity_snapshots
       WHERE completed_at >= $1 AND completed_at <= $2
       ORDER BY completed_at DESC`,
      [since, until],
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  private mapRow(row: Record<string, unknown>): IntegritySnapshot {
    return {
      id: row.id as string,
      cadence: row.cadence as Cadence,
      startedAt: new Date(row.started_at as string).toISOString(),
      completedAt: new Date(row.completed_at as string).toISOString(),
      totalDurationMs: Number(row.total_duration_ms),
      results: (typeof row.results === 'string' ? JSON.parse(row.results) : row.results) as IntegritySnapshot['results'],
      overallStatus: row.overall_status as IntegritySnapshot['overallStatus'],
      defectCount: (typeof row.defect_count === 'string' ? JSON.parse(row.defect_count) : row.defect_count) as IntegritySnapshot['defectCount'],
    };
  }
}
