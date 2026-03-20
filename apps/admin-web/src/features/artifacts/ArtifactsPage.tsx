import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../../components/common/PageHeader';
import { DataTable, type ColumnDef } from '../../components/common/DataTable';
import { StatusBadge } from '../../components/common/StatusBadge';
import { useArtifacts, useArtifactStats } from '../../hooks/useArtifacts';
import type { ArtifactEntryView } from './artifactsApi';

const DISPOSITION_STATUS_MAP: Record<string, 'healthy' | 'pending' | 'running'> = {
  'apple-only': 'healthy',
  'apple-preferred': 'pending',
  'apple-optional': 'running',
};

const QUALITY_TIER_STATUS_MAP: Record<string, string> = {
  production: 'healthy',
  production_candidate: 'pending',
  consumer_demo_grade: 'running',
  experimental: 'degraded',
  none: 'unknown',
};

function DispositionBadge({ disposition }: { disposition: string }) {
  const status = DISPOSITION_STATUS_MAP[disposition] ?? 'unknown';
  return <StatusBadge status={status} label={disposition.replace(/-/g, ' ')} />;
}

function QualityBadge({ tier }: { tier: string }) {
  const status = QUALITY_TIER_STATUS_MAP[tier] ?? 'unknown';
  return <StatusBadge status={status} label={tier.replace(/_/g, ' ')} />;
}

const columns: ColumnDef<ArtifactEntryView>[] = [
  {
    key: 'artifact_type',
    header: 'Artifact Type',
    sortable: true,
    render: (r) => (
      <span className="artifact-type-label">
        <span className="artifact-type-label__family">{r.family}</span>
        <span className="artifact-type-label__dot">.</span>
        <span className="artifact-type-label__action">{r.action}</span>
        {r.variant && (
          <>
            <span className="artifact-type-label__dot">.</span>
            <span className="artifact-type-label__variant">{r.variant}</span>
          </>
        )}
      </span>
    ),
  },
  {
    key: 'capability_id',
    header: 'Capability',
    sortable: true,
    render: (r) => <code className="artifact-capability">{r.capability_id}</code>,
  },
  {
    key: 'provider_disposition',
    header: 'Disposition',
    sortable: true,
    render: (r) => <DispositionBadge disposition={r.provider_disposition} />,
  },
  {
    key: 'output_modality',
    header: 'Output',
    sortable: true,
    render: (r) => r.output_modality,
  },
  {
    key: 'quality_tier',
    header: 'Quality Tier',
    sortable: true,
    render: (r) => <QualityBadge tier={r.quality_tier} />,
  },
];

type FamilyFilter = 'all' | string;

export function ArtifactsPage() {
  const navigate = useNavigate();
  const { data: artifacts = [], isLoading } = useArtifacts();
  const { data: stats } = useArtifactStats();
  const [familyFilter, setFamilyFilter] = useState<FamilyFilter>('all');

  const families = [...new Set(artifacts.map((a) => a.family))].sort();
  const filtered = familyFilter === 'all'
    ? artifacts
    : artifacts.filter((a) => a.family === familyFilter);

  return (
    <div>
      <PageHeader title="Artifact Registry" />

      {stats && (
        <div className="artifact-stats" role="region" aria-label="Artifact statistics">
          <div className="artifact-stats__card">
            <span className="artifact-stats__value">{stats.total_artifacts}</span>
            <span className="artifact-stats__label">Artifact Types</span>
          </div>
          <div className="artifact-stats__card">
            <span className="artifact-stats__value">{stats.total_families}</span>
            <span className="artifact-stats__label">Families</span>
          </div>
          {Object.entries(stats.by_disposition).map(([disposition, count]) => (
            <div key={disposition} className="artifact-stats__card">
              <span className="artifact-stats__value">{count}</span>
              <span className="artifact-stats__label">{disposition.replace(/-/g, ' ')}</span>
            </div>
          ))}
        </div>
      )}

      <div className="artifact-filter" role="group" aria-label="Filter by family">
        <button
          className={`artifact-filter__btn ${familyFilter === 'all' ? 'artifact-filter__btn--active' : ''}`}
          onClick={() => setFamilyFilter('all')}
        >
          All ({artifacts.length})
        </button>
        {families.map((fam) => {
          const count = artifacts.filter((a) => a.family === fam).length;
          return (
            <button
              key={fam}
              className={`artifact-filter__btn ${familyFilter === fam ? 'artifact-filter__btn--active' : ''}`}
              onClick={() => setFamilyFilter(fam)}
            >
              {fam} ({count})
            </button>
          );
        })}
      </div>

      {isLoading ? (
        <p className="empty-state">Loading artifact registry...</p>
      ) : (
        <DataTable
          columns={columns}
          data={filtered}
          keyExtractor={(r) => r.artifact_type}
          onRowClick={(r) => navigate(`/artifacts/${encodeURIComponent(r.artifact_type)}`)}
          emptyMessage="No artifacts registered"
          caption="Artifact registry entries"
          rowLabel={(r) => r.artifact_type}
        />
      )}
    </div>
  );
}
