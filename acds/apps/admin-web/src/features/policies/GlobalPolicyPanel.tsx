import { useState } from 'react';
import type { PolicyRecord } from './policiesApi';
import { PolicyForm } from '../../components/forms/PolicyForm';
import { useUpdatePolicy } from '../../hooks/usePolicies';

interface GlobalPolicyPanelProps {
  policy: PolicyRecord | undefined;
}

const sectionStyle: React.CSSProperties = {
  backgroundColor: '#ffffff',
  borderRadius: '8px',
  padding: '20px',
  boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
};

const rowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  padding: '8px 0',
  borderBottom: '1px solid #f3f4f6',
  fontSize: '13px',
};

export function GlobalPolicyPanel({ policy }: GlobalPolicyPanelProps) {
  const [editing, setEditing] = useState(false);
  const updateMutation = useUpdatePolicy();

  if (!policy) {
    return (
      <div style={sectionStyle}>
        <p style={{ color: '#6b7280' }}>No global policy configured.</p>
      </div>
    );
  }

  if (editing) {
    return (
      <div style={sectionStyle}>
        <PolicyForm
          initial={policy}
          onSubmit={(data) => {
            updateMutation.mutate(
              { id: policy.id, payload: data },
              { onSuccess: () => setEditing(false) },
            );
          }}
          onCancel={() => setEditing(false)}
          isSubmitting={updateMutation.isPending}
        />
      </div>
    );
  }

  return (
    <div style={sectionStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>Global Policy</h3>
        <button
          onClick={() => setEditing(true)}
          style={{
            padding: '6px 14px',
            backgroundColor: '#3b82f6',
            color: '#fff',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '13px',
          }}
        >
          Edit
        </button>
      </div>
      <div style={rowStyle}>
        <span style={{ color: '#6b7280' }}>Allowed Vendors</span>
        <span style={{ fontWeight: 500 }}>{policy.allowedVendors.join(', ') || 'All'}</span>
      </div>
      <div style={rowStyle}>
        <span style={{ color: '#6b7280' }}>Blocked Vendors</span>
        <span style={{ fontWeight: 500 }}>{policy.blockedVendors.join(', ') || 'None'}</span>
      </div>
      <div style={rowStyle}>
        <span style={{ color: '#6b7280' }}>Defaults</span>
        <span style={{ fontWeight: 500 }}>{JSON.stringify(policy.defaults)}</span>
      </div>
    </div>
  );
}
