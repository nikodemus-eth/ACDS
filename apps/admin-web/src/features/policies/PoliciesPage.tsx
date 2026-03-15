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
            {showForm ? 'Cancel' : 'Add Policy'}
          </button>
        }
      />

      {showForm && (
        <div style={{ marginBottom: '24px' }}>
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

      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        <GlobalPolicyPanel policy={globalPolicy} />
        <ApplicationPolicyPanel policies={appPolicies} />
        <ProcessPolicyPanel policies={processPolicies} />
      </div>
    </div>
  );
}
