import React, { useState } from 'react';
import { ProviderVendor, AuthType } from '@acds/core-types';
import type { CreateProviderPayload } from '../../features/providers/providersApi';

interface ProviderFormProps {
  onSubmit: (data: CreateProviderPayload) => void;
  isSubmitting: boolean;
}

const fieldStyle: React.CSSProperties = {
  marginBottom: '16px',
};

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

export function ProviderForm({ onSubmit, isSubmitting }: ProviderFormProps) {
  const [name, setName] = useState('');
  const [vendor, setVendor] = useState<string>(ProviderVendor.OLLAMA);
  const [authType, setAuthType] = useState<string>(AuthType.NONE);
  const [baseUrl, setBaseUrl] = useState('');
  const [environment, setEnvironment] = useState('development');
  const [secret, setSecret] = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit({
      name,
      vendor,
      authType,
      baseUrl,
      environment,
      secret: secret || undefined,
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        backgroundColor: '#ffffff',
        borderRadius: '8px',
        padding: '20px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        maxWidth: '480px',
      }}
    >
      <h3 style={{ margin: '0 0 16px', fontSize: '16px', fontWeight: 600 }}>New Provider</h3>

      <div style={fieldStyle}>
        <label htmlFor="provider-name" style={labelElStyle}>Name</label>
        <input
          id="provider-name"
          style={inputStyle}
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="organization"
          required
        />
      </div>

      <div style={fieldStyle}>
        <label htmlFor="provider-vendor" style={labelElStyle}>Vendor</label>
        <select
          id="provider-vendor"
          style={inputStyle}
          value={vendor}
          onChange={(e) => setVendor(e.target.value)}
        >
          {Object.values(ProviderVendor).map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      </div>

      <div style={fieldStyle}>
        <label htmlFor="provider-auth-type" style={labelElStyle}>Auth Type</label>
        <select
          id="provider-auth-type"
          style={inputStyle}
          value={authType}
          onChange={(e) => setAuthType(e.target.value)}
        >
          {Object.values(AuthType).map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      </div>

      <div style={fieldStyle}>
        <label htmlFor="provider-base-url" style={labelElStyle}>Base URL</label>
        <input
          id="provider-base-url"
          style={inputStyle}
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder="http://localhost:11434"
          autoComplete="url"
          required
        />
      </div>

      <div style={fieldStyle}>
        <label htmlFor="provider-environment" style={labelElStyle}>Environment</label>
        <select
          id="provider-environment"
          style={inputStyle}
          value={environment}
          onChange={(e) => setEnvironment(e.target.value)}
        >
          <option value="development">development</option>
          <option value="staging">staging</option>
          <option value="production">production</option>
        </select>
      </div>

      <div style={fieldStyle}>
        <label htmlFor="provider-secret" style={labelElStyle}>Secret (only set on create)</label>
        <input
          id="provider-secret"
          style={inputStyle}
          type="password"
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          placeholder="API key or token"
          autoComplete="new-password"
        />
      </div>

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
        {isSubmitting ? 'Creating...' : 'Create Provider'}
      </button>
    </form>
  );
}
