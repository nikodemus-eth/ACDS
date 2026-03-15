import React, { useState } from 'react';
import type { PolicyPayload, PolicyRecord } from '../../features/policies/policiesApi';

interface PolicyFormProps {
  initial?: PolicyRecord;
  onSubmit: (data: PolicyPayload) => void;
  onCancel: () => void;
  isSubmitting: boolean;
}

const fieldStyle: React.CSSProperties = { marginBottom: '16px' };

const labelElStyle: React.CSSProperties = {
  display: 'block',
  marginBottom: '4px',
  fontSize: '13px',
  fontWeight: 500,
  color: '#374151',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  border: '1px solid #d1d5db',
  borderRadius: '6px',
  fontSize: '14px',
  boxSizing: 'border-box',
};

export function PolicyForm({ initial, onSubmit, onCancel, isSubmitting }: PolicyFormProps) {
  const [level, setLevel] = useState<'global' | 'application' | 'process'>(initial?.level ?? 'global');
  const [application, setApplication] = useState(initial?.application ?? '');
  const [process, setProcess] = useState(initial?.process ?? '');
  const [allowedVendors, setAllowedVendors] = useState(initial?.allowedVendors.join(', ') ?? '');
  const [blockedVendors, setBlockedVendors] = useState(initial?.blockedVendors.join(', ') ?? '');
  const [defaultsJson, setDefaultsJson] = useState(
    initial?.defaults ? JSON.stringify(initial.defaults, null, 2) : '{}',
  );
  const [constraintsJson, setConstraintsJson] = useState(
    initial?.constraints ? JSON.stringify(initial.constraints, null, 2) : '{}',
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    let defaults: Record<string, unknown> = {};
    let constraints: Record<string, unknown> = {};
    try {
      defaults = JSON.parse(defaultsJson) as Record<string, unknown>;
      constraints = JSON.parse(constraintsJson) as Record<string, unknown>;
    } catch {
      alert('Invalid JSON in defaults or constraints');
      return;
    }

    const payload: PolicyPayload = {
      level,
      allowedVendors: allowedVendors.split(',').map((s) => s.trim()).filter(Boolean),
      blockedVendors: blockedVendors.split(',').map((s) => s.trim()).filter(Boolean),
      defaults,
      constraints,
      enabled: true,
    };

    if (level === 'application' || level === 'process') {
      payload.application = application;
    }
    if (level === 'process') {
      payload.process = process;
    }

    onSubmit(payload);
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        backgroundColor: '#ffffff',
        borderRadius: '8px',
        padding: '20px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        maxWidth: '520px',
      }}
    >
      <h3 style={{ margin: '0 0 16px', fontSize: '16px', fontWeight: 600 }}>
        {initial ? 'Edit Policy' : 'New Policy'}
      </h3>

      {!initial && (
        <div style={fieldStyle}>
          <label style={labelElStyle}>Level</label>
          <select style={inputStyle} value={level} onChange={(e) => setLevel(e.target.value as PolicyPayload['level'])}>
            <option value="global">Global</option>
            <option value="application">Application</option>
            <option value="process">Process</option>
          </select>
        </div>
      )}

      {(level === 'application' || level === 'process') && (
        <div style={fieldStyle}>
          <label style={labelElStyle}>Application</label>
          <input style={inputStyle} value={application} onChange={(e) => setApplication(e.target.value)} required />
        </div>
      )}

      {level === 'process' && (
        <div style={fieldStyle}>
          <label style={labelElStyle}>Process</label>
          <input style={inputStyle} value={process} onChange={(e) => setProcess(e.target.value)} required />
        </div>
      )}

      <div style={fieldStyle}>
        <label style={labelElStyle}>Allowed Vendors (comma-separated)</label>
        <input
          style={inputStyle}
          value={allowedVendors}
          onChange={(e) => setAllowedVendors(e.target.value)}
          placeholder="ollama, openai"
        />
      </div>

      <div style={fieldStyle}>
        <label style={labelElStyle}>Blocked Vendors (comma-separated)</label>
        <input
          style={inputStyle}
          value={blockedVendors}
          onChange={(e) => setBlockedVendors(e.target.value)}
          placeholder="Leave empty for none"
        />
      </div>

      <div style={fieldStyle}>
        <label style={labelElStyle}>Defaults (JSON)</label>
        <textarea
          style={{ ...inputStyle, minHeight: '80px', fontFamily: 'monospace', fontSize: '12px' }}
          value={defaultsJson}
          onChange={(e) => setDefaultsJson(e.target.value)}
        />
      </div>

      <div style={fieldStyle}>
        <label style={labelElStyle}>Constraints (JSON)</label>
        <textarea
          style={{ ...inputStyle, minHeight: '80px', fontFamily: 'monospace', fontSize: '12px' }}
          value={constraintsJson}
          onChange={(e) => setConstraintsJson(e.target.value)}
        />
      </div>

      <div style={{ display: 'flex', gap: '8px' }}>
        <button
          type="submit"
          disabled={isSubmitting}
          style={{
            padding: '8px 20px',
            backgroundColor: '#3b82f6',
            color: '#fff',
            border: 'none',
            borderRadius: '6px',
            cursor: isSubmitting ? 'not-allowed' : 'pointer',
            fontSize: '14px',
          }}
        >
          {isSubmitting ? 'Saving...' : initial ? 'Update Policy' : 'Create Policy'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          style={{
            padding: '8px 20px',
            backgroundColor: '#f3f4f6',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '14px',
          }}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
