import type { CapabilityTestResponse } from '@acds/core-types';
import { StatusBadge } from '../../../components/common/StatusBadge';

interface ExecutionMetadataProps {
  result: CapabilityTestResponse;
}

export function ExecutionMetadata({ result }: ExecutionMetadataProps) {
  return (
    <div className="execution-metadata">
      <dl className="dl-grid">
        <dt className="dl-grid__term">Status</dt>
        <dd className="dl-grid__value">
          <StatusBadge
            status={result.success ? 'healthy' : 'unhealthy'}
            label={result.success ? 'Success' : 'Failed'}
          />
        </dd>
        <dt className="dl-grid__term">Provider</dt>
        <dd className="dl-grid__value">{result.providerId}</dd>
        <dt className="dl-grid__term">Capability</dt>
        <dd className="dl-grid__value">{result.capabilityId}</dd>
        <dt className="dl-grid__term">Duration</dt>
        <dd className="dl-grid__value">{result.durationMs}ms</dd>
        <dt className="dl-grid__term">Timestamp</dt>
        <dd className="dl-grid__value">{new Date(result.timestamp).toLocaleString()}</dd>
      </dl>
      {result.error && (
        <div className="execution-metadata__error panel panel--danger">
          <h4>{result.error.code}</h4>
          <p>{result.error.message}</p>
          {result.error.detail && <pre>{result.error.detail}</pre>}
        </div>
      )}
    </div>
  );
}
