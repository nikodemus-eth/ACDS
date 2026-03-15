import { useState } from 'react';
import { PageHeader } from '../../components/common/PageHeader';
import { ProfileForm } from '../../components/forms/ProfileForm';
import { ModelProfilesPanel } from './ModelProfilesPanel';
import { TacticProfilesPanel } from './TacticProfilesPanel';
import { useCreateProfile } from '../../hooks/useProfiles';

type Tab = 'model' | 'tactic';

const tabStyle = (active: boolean): React.CSSProperties => ({
  padding: '8px 20px',
  border: 'none',
  borderBottom: active ? '2px solid #3b82f6' : '2px solid transparent',
  backgroundColor: 'transparent',
  color: active ? '#3b82f6' : '#6b7280',
  fontWeight: active ? 600 : 400,
  cursor: 'pointer',
  fontSize: '14px',
});

export function ProfilesPage() {
  const [tab, setTab] = useState<Tab>('model');
  const [showForm, setShowForm] = useState(false);
  const createMutation = useCreateProfile();

  return (
    <div>
      <PageHeader
        title="Profiles"
        actions={
          <button
            onClick={() => setShowForm(!showForm)}
            style={{
              padding: '8px 16px',
              backgroundColor: '#3b82f6',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >
            {showForm ? 'Cancel' : 'Add Profile'}
          </button>
        }
      />

      {showForm && (
        <div style={{ marginBottom: '24px' }}>
          <ProfileForm
            onSubmit={(data) => {
              createMutation.mutate(data, {
                onSuccess: () => setShowForm(false),
              });
            }}
            isSubmitting={createMutation.isPending}
          />
        </div>
      )}

      <div style={{ display: 'flex', gap: '4px', marginBottom: '16px', borderBottom: '1px solid #e5e7eb' }}>
        <button style={tabStyle(tab === 'model')} onClick={() => setTab('model')}>
          Model Profiles
        </button>
        <button style={tabStyle(tab === 'tactic')} onClick={() => setTab('tactic')}>
          Tactic Profiles
        </button>
      </div>

      {tab === 'model' ? <ModelProfilesPanel /> : <TacticProfilesPanel />}
    </div>
  );
}
