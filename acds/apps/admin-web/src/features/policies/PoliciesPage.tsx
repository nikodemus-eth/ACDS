import { useState } from 'react';
import { PageHeader } from '../../components/common/PageHeader';
import { PolicyForm } from '../../components/forms/PolicyForm';
import { GlobalPolicyPanel } from './GlobalPolicyPanel';
import { ApplicationPolicyPanel } from './ApplicationPolicyPanel';
import { ProcessPolicyPanel } from './ProcessPolicyPanel';
import { usePolicies, useCreatePolicy } from '../../hooks/usePolicies';

export function PoliciesPage() {
  const { data: policies = [], isLoading } = usePolicies();
  const [showForm, setShowForm] = useState(false);
  const createMutation = useCreatePolicy();

  const globalPolicy = policies.find((p) => p.level === 'global');
  const appPolicies = policies.filter((p) => p.level === 'application');
  const processPolicies = policies.filter((p) => p.level === 'process');

  if (isLoading) return <p>Loading policies...</p>;

  return (
    <div>
      <PageHeader
        title="Policies"
        actions={
          <button
            onClick={() => setShowForm(!showForm)}
            className="button button--primary"
          >
            {showForm ? 'Cancel' : 'Add Policy'}
          </button>
        }
      />

      {showForm && (
        <div className="stack-gap">
          <PolicyForm
            onSubmit={(data) => {
              createMutation.mutate(data, {
                onSuccess: () => setShowForm(false),
              });
            }}
            onCancel={() => setShowForm(false)}
            isSubmitting={createMutation.isPending}
          />
        </div>
      )}

      <div className="panel-stack">
        <GlobalPolicyPanel policy={globalPolicy} />
        <ApplicationPolicyPanel policies={appPolicies} />
        <ProcessPolicyPanel policies={processPolicies} />
      </div>
    </div>
  );
}
