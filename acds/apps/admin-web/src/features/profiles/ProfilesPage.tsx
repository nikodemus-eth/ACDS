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

      <div className="segmented-control">
        <button
          className={tab === 'model' ? 'segmented-control__button segmented-control__button--active' : 'segmented-control__button'}
          onClick={() => setTab('model')}
        >
          Model Profiles
        </button>
        <button
          className={tab === 'tactic' ? 'segmented-control__button segmented-control__button--active' : 'segmented-control__button'}
          onClick={() => setTab('tactic')}
        >
          Tactic Profiles
        </button>
      </div>

      {tab === 'model' ? <ModelProfilesPanel /> : <TacticProfilesPanel />}
    </div>
  );
}
