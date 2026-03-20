import { useParams, useNavigate } from 'react-router-dom';
import { PageHeader } from '../../components/common/PageHeader';
import { StatusBadge } from '../../components/common/StatusBadge';
import { useArtifact } from '../../hooks/useArtifacts';

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="artifact-detail__row">
      <dt className="artifact-detail__label">{label}</dt>
      <dd className="artifact-detail__value">{children}</dd>
    </div>
  );
}

function TagList({ items, className }: { items: string[]; className?: string }) {
  return (
    <div className={`artifact-tags ${className ?? ''}`}>
      {items.map((item) => (
        <span key={item} className="artifact-tags__tag">{item}</span>
      ))}
    </div>
  );
}

export function ArtifactDetailPage() {
  const { artifactType } = useParams<{ artifactType: string }>();
  const navigate = useNavigate();
  const { data: artifact, isLoading, error } = useArtifact(artifactType ?? '');

  if (isLoading) {
    return <p className="empty-state">Loading artifact details...</p>;
  }

  if (error || !artifact) {
    return (
      <div>
        <PageHeader
          title="Artifact Not Found"
          actions={
            <button className="button button--ghost" onClick={() => navigate('/artifacts')}>
              Back to Registry
            </button>
          }
        />
        <p className="empty-state">Artifact type "{artifactType}" was not found in the registry.</p>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={artifact.artifact_type}
        actions={
          <button className="button button--ghost" onClick={() => navigate('/artifacts')}>
            Back to Registry
          </button>
        }
      />

      <div className="artifact-detail" role="region" aria-label="Artifact details">
        {/* Identity */}
        <section className="artifact-detail__section">
          <h3 className="artifact-detail__section-title">Identity</h3>
          <dl className="artifact-detail__grid">
            <DetailRow label="Artifact Type">
              <code>{artifact.artifact_type}</code>
            </DetailRow>
            <DetailRow label="Version">{artifact.artifact_version}</DetailRow>
            <DetailRow label="Family">{artifact.family}</DetailRow>
            <DetailRow label="Action">{artifact.action}</DetailRow>
            {artifact.variant && (
              <DetailRow label="Variant">{artifact.variant}</DetailRow>
            )}
            <DetailRow label="Description">{artifact.description}</DetailRow>
          </dl>
        </section>

        {/* Provider Configuration */}
        <section className="artifact-detail__section">
          <h3 className="artifact-detail__section-title">Provider Configuration</h3>
          <dl className="artifact-detail__grid">
            <DetailRow label="Disposition">
              <StatusBadge
                status={artifact.provider_disposition === 'apple-only' ? 'healthy' : artifact.provider_disposition === 'apple-preferred' ? 'pending' : 'running'}
                label={artifact.provider_disposition.replace(/-/g, ' ')}
              />
            </DetailRow>
            <DetailRow label="Default Provider">{artifact.default_provider}</DetailRow>
            <DetailRow label="Supported Providers">
              <TagList items={artifact.supported_providers} />
            </DetailRow>
          </dl>
        </section>

        {/* Capability Mapping */}
        <section className="artifact-detail__section">
          <h3 className="artifact-detail__section-title">Capability Mapping</h3>
          <dl className="artifact-detail__grid">
            <DetailRow label="Capability ID">
              <code>{artifact.capability_id}</code>
            </DetailRow>
            <DetailRow label="Output Modality">{artifact.output_modality}</DetailRow>
            <DetailRow label="Output Format">{artifact.output_format}</DetailRow>
          </dl>
        </section>

        {/* Quality & Policy */}
        <section className="artifact-detail__section">
          <h3 className="artifact-detail__section-title">Quality & Policy</h3>
          <dl className="artifact-detail__grid">
            <DetailRow label="Quality Tier">
              <StatusBadge
                status={artifact.quality_tier === 'production' ? 'healthy' : artifact.quality_tier === 'experimental' ? 'degraded' : 'pending'}
                label={artifact.quality_tier.replace(/_/g, ' ')}
              />
            </DetailRow>
            <DetailRow label="Quality Metrics">
              <TagList items={artifact.quality_metrics} />
            </DetailRow>
            <DetailRow label="Policy Requirements">
              <TagList items={artifact.policy_requirements} className="artifact-tags--policy" />
            </DetailRow>
            <DetailRow label="Test Suites">
              <TagList items={artifact.test_suites} />
            </DetailRow>
          </dl>
        </section>

        {/* Pipeline Stages */}
        <section className="artifact-detail__section">
          <h3 className="artifact-detail__section-title">Pipeline Stages</h3>
          <div className="artifact-pipeline-stages">
            {['Intake', 'Policy Gate', 'Planning', 'Execution', 'Post-Processing', 'Provenance', 'Delivery'].map((stage, i) => (
              <div key={stage} className="artifact-pipeline-stages__stage">
                <span className="artifact-pipeline-stages__number">{i + 1}</span>
                <span className="artifact-pipeline-stages__name">{stage}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
