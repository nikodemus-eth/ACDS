import type { TacticProfile } from '@acds/core-types';
import { DataTable, type ColumnDef } from '../../components/common/DataTable';
import { StatusBadge } from '../../components/common/StatusBadge';
import { useTacticProfiles } from '../../hooks/useProfiles';

const columns: ColumnDef<TacticProfile>[] = [
  { key: 'name', header: 'Name', sortable: true, render: (r) => r.name },
  { key: 'executionMethod', header: 'Execution Method', render: (r) => r.executionMethod },
  {
    key: 'multiStage',
    header: 'Multi-Stage',
    render: (r) => (r.multiStage ? 'Yes' : 'No'),
  },
  {
    key: 'taskTypes',
    header: 'Task Types',
    render: (r) => r.supportedTaskTypes.join(', '),
  },
  {
    key: 'enabled',
    header: 'Status',
    render: (r) => (
      <StatusBadge
        status={r.enabled ? 'healthy' : 'unknown'}
        label={r.enabled ? 'Enabled' : 'Disabled'}
      />
    ),
  },
];

export function TacticProfilesPanel() {
  const { data: profiles = [], isLoading } = useTacticProfiles();

  if (isLoading) return <p>Loading tactic profiles...</p>;

  return (
    <DataTable
      columns={columns}
      data={profiles}
      keyExtractor={(r) => r.id}
      emptyMessage="No tactic profiles configured"
    />
  );
}
