import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ExecutionRecord } from '@acds/core-types';
import { PageHeader } from '../../components/common/PageHeader';
import { DataTable, type ColumnDef } from '../../components/common/DataTable';
import { StatusBadge } from '../../components/common/StatusBadge';
import { useExecutions } from '../../hooks/useExecutions';
import { formatDate, formatDuration, truncate } from '../../lib/formatters';
import type { ExecutionFilters } from './executionsApi';

const inputStyle: React.CSSProperties = {
  padding: '6px 10px',
  border: '1px solid #d1d5db',
  borderRadius: '6px',
  fontSize: '13px',
};

const columns: ColumnDef<ExecutionRecord>[] = [
  { key: 'id', header: 'ID', render: (r) => truncate(r.id, 12) },
  {
    key: 'status',
    header: 'Status',
    sortable: true,
    render: (r) => <StatusBadge status={r.status} />,
  },
  {
    key: 'application',
    header: 'Application',
    sortable: true,
    render: (r) => r.executionFamily.application,
  },
  {
    key: 'process',
    header: 'Process',
    render: (r) => r.executionFamily.process,
  },
  { key: 'latencyMs', header: 'Latency', sortable: true, render: (r) => formatDuration(r.latencyMs) },
  {
    key: 'fallbackAttempts',
    header: 'Fallbacks',
    render: (r) => String(r.fallbackAttempts),
  },
  { key: 'createdAt', header: 'Created', sortable: true, render: (r) => formatDate(r.createdAt) },
];

export function ExecutionsPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState('');
  const [application, setApplication] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const filters: ExecutionFilters = {
    status: status || undefined,
    application: application || undefined,
    from: from || undefined,
    to: to || undefined,
  };

  const { data: executions = [], isLoading } = useExecutions(filters);

  return (
    <div>
      <PageHeader title="Executions" />

      <div
        style={{
          display: 'flex',
          gap: '12px',
          flexWrap: 'wrap',
          marginBottom: '20px',
          alignItems: 'center',
        }}
      >
        <select style={inputStyle} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="running">Running</option>
          <option value="succeeded">Succeeded</option>
          <option value="failed">Failed</option>
          <option value="fallback_succeeded">Fallback Succeeded</option>
          <option value="fallback_failed">Fallback Failed</option>
        </select>

        <input
          style={inputStyle}
          value={application}
          onChange={(e) => setApplication(e.target.value)}
          placeholder="Application"
        />

        <input
          style={inputStyle}
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
        />
        <input
          style={inputStyle}
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
        />
      </div>

      {isLoading ? (
        <p>Loading executions...</p>
      ) : (
        <DataTable
          columns={columns}
          data={executions}
          keyExtractor={(r) => r.id}
          onRowClick={(r) => navigate(`/executions/${r.id}`)}
          emptyMessage="No executions found"
          caption="Execution records"
          rowLabel={(r) => r.id}
        />
      )}
    </div>
  );
}
