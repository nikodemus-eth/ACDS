import type { ModelProfile } from '@acds/core-types';
import { DataTable, type ColumnDef } from '../../components/common/DataTable';
import { StatusBadge } from '../../components/common/StatusBadge';
import { useModelProfiles } from '../../hooks/useProfiles';

const columns: ColumnDef<ModelProfile>[] = [
  { key: 'name', header: 'Name', sortable: true, render: (r) => r.name },
  {
    key: 'taskTypes',
    header: 'Task Types',
    render: (r) => r.supportedTaskTypes.join(', '),
  },
  {
    key: 'loadTiers',
    header: 'Load Tiers',
    render: (r) => r.supportedLoadTiers.join(', '),
  },
  {
    key: 'cognitiveGrade',
    header: 'Cognitive Grade',
    render: (r) => r.minimumCognitiveGrade,
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

export function ModelProfilesPanel() {
  const { data: profiles = [], isLoading } = useModelProfiles();

  if (isLoading) return <p>Loading model profiles...</p>;

  return (
    <DataTable
      columns={columns}
      data={profiles}
      keyExtractor={(r) => r.id}
      emptyMessage="No model profiles configured"
    />
  );
}
