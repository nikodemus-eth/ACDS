import type { IntegritySnapshotRepository, IntegritySnapshot, Cadence } from '@acds/grits';
import { createPool } from '@acds/persistence-pg';

// ---------------------------------------------------------------------------
// InMemory implementation (used by tests)
// ---------------------------------------------------------------------------

export class InMemoryIntegritySnapshotRepository implements IntegritySnapshotRepository {
  private readonly snapshots: IntegritySnapshot[] = [];

  async save(snapshot: IntegritySnapshot): Promise<void> {
    this.snapshots.push(snapshot);
  }

  async findById(id: string): Promise<IntegritySnapshot | undefined> {
    return this.snapshots.find((s) => s.id === id);
  }

  async findLatestByCadence(cadence: Cadence): Promise<IntegritySnapshot | undefined> {
    const matching = this.snapshots
      .filter((s) => s.cadence === cadence)
      .sort((a, b) => b.completedAt.localeCompare(a.completedAt));
    return matching[0];
  }

  async findByTimeRange(since: string, until: string): Promise<IntegritySnapshot[]> {
    return this.snapshots.filter(
      (s) => s.completedAt >= since && s.completedAt <= until,
    );
  }
}

// ---------------------------------------------------------------------------
// Pg implementation (production)
// ---------------------------------------------------------------------------

function createWorkerPool() {
  const databaseUrl = new URL(process.env.DATABASE_URL ?? 'postgresql://localhost:5432/acds');
  return createPool({
    host: databaseUrl.hostname,
    port: databaseUrl.port ? Number(databaseUrl.port) : 5432,
    database: databaseUrl.pathname.replace(/^\//, ''),
    user: decodeURIComponent(databaseUrl.username),
    password: decodeURIComponent(databaseUrl.password),
    ssl: databaseUrl.searchParams.get('sslmode') === 'require',
  });
}

const pool = createWorkerPool();

export class PgIntegritySnapshotRepository implements IntegritySnapshotRepository {
  async save(snapshot: IntegritySnapshot): Promise<void> {
    await pool.query(
      `INSERT INTO integrity_snapshots (id, cadence, started_at, completed_at, total_duration_ms, results, overall_status, defect_count)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (id) DO NOTHING`,
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
    const result = await pool.query(
      'SELECT * FROM integrity_snapshots WHERE id = $1',
      [id],
    );
    return result.rows.length > 0 ? this.mapRow(result.rows[0]) : undefined;
  }

  async findLatestByCadence(cadence: Cadence): Promise<IntegritySnapshot | undefined> {
    const result = await pool.query(
      `SELECT * FROM integrity_snapshots
       WHERE cadence = $1
       ORDER BY completed_at DESC
       LIMIT 1`,
      [cadence],
    );
    return result.rows.length > 0 ? this.mapRow(result.rows[0]) : undefined;
  }

  async findByTimeRange(since: string, until: string): Promise<IntegritySnapshot[]> {
    const result = await pool.query(
      `SELECT * FROM integrity_snapshots
       WHERE completed_at >= $1 AND completed_at <= $2
       ORDER BY completed_at DESC`,
      [since, until],
    );
    return result.rows.map(this.mapRow);
  }

  private mapRow(row: Record<string, unknown>): IntegritySnapshot {
    return {
      id: row.id as string,
      cadence: row.cadence as Cadence,
      startedAt: row.started_at as string,
      completedAt: row.completed_at as string,
      totalDurationMs: row.total_duration_ms as number,
      results: typeof row.results === 'string' ? JSON.parse(row.results) : row.results as IntegritySnapshot['results'],
      overallStatus: row.overall_status as IntegritySnapshot['overallStatus'],
      defectCount: typeof row.defect_count === 'string' ? JSON.parse(row.defect_count) : row.defect_count as IntegritySnapshot['defectCount'],
    };
  }
}

const instance = new PgIntegritySnapshotRepository();

export function getIntegritySnapshotRepository(): IntegritySnapshotRepository {
  return instance;
}
