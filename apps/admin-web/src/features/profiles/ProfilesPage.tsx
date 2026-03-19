import { useState } from 'react';
import { PageHeader } from '../../components/common/PageHeader';
import { ProfileForm } from '../../components/forms/ProfileForm';
import { ModelProfilesPanel } from './ModelProfilesPanel';
import { TacticProfilesPanel } from './TacticProfilesPanel';
import { useCreateProfile } from '../../hooks/useProfiles';

type Tab = 'model' | 'tactic';

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
            className="button button--primary"
          >
            {showForm ? 'Cancel' : 'Add Profile'}
          </button>
        }
      />

      {showForm && (
        <div className="stack-gap">
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

      <div className="tab-list" role="tablist" aria-label="Profile types">
        <button
          className="tab"
          role="tab"
          id="profile-tab-0"
          aria-selected={tab === 'model'}
          aria-controls="profile-panel-0"
          onClick={() => setTab('model')}
        >
          Model Profiles
        </button>
        <button
          className="tab"
          role="tab"
          id="profile-tab-1"
          aria-selected={tab === 'tactic'}
          aria-controls="profile-panel-1"
          onClick={() => setTab('tactic')}
        >
          Tactic Profiles
        </button>
      </div>

      {tab === 'model' ? (
        <div role="tabpanel" id="profile-panel-0" aria-labelledby="profile-tab-0">
          <ModelProfilesPanel />
        </div>
      ) : (
        <div role="tabpanel" id="profile-panel-1" aria-labelledby="profile-tab-1">
          <TacticProfilesPanel />
        </div>
      )}
    </div>
  );
}
