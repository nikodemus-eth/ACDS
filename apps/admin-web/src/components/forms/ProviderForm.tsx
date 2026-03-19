import React, { useState } from 'react';
import { ProviderVendor, AuthType } from '@acds/core-types';
import type { CreateProviderPayload } from '../../features/providers/providersApi';
import { FormField } from './FormField';

interface ProviderFormProps {
  onSubmit: (data: CreateProviderPayload) => void;
  isSubmitting: boolean;
}

export function ProviderForm({ onSubmit, isSubmitting }: ProviderFormProps) {
  const [name, setName] = useState('');
  const [vendor, setVendor] = useState<string>(ProviderVendor.OLLAMA);
  const [authType, setAuthType] = useState<string>(AuthType.NONE);
  const [baseUrl, setBaseUrl] = useState('');
  const [environment, setEnvironment] = useState('development');
  const [secret, setSecret] = useState('');
  const [submitStatus, setSubmitStatus] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitStatus(null);
    onSubmit({
      name,
      vendor,
      authType,
      baseUrl,
      environment,
      secret: secret || undefined,
    });
  }

  const vendorOptions = Object.values(ProviderVendor).map((v) => ({ value: v, label: v }));
  const authOptions = Object.values(AuthType).map((a) => ({ value: a, label: a }));
  const envOptions = [
    { value: 'development', label: 'development' },
    { value: 'staging', label: 'staging' },
    { value: 'production', label: 'production' },
  ];

  const showSecret = authType === AuthType.API_KEY || authType === AuthType.BEARER_TOKEN;

  return (
    <form onSubmit={handleSubmit} className="form-panel">
      <h3 className="form-panel__title">New Provider</h3>

      <fieldset className="form-fieldset">
        <legend className="form-legend">Provider Details</legend>

        <FormField
          id="provider-name"
          label="Name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="organization"
        />

        <FormField
          id="provider-vendor"
          label="Vendor"
          as="select"
          value={vendor}
          onChange={(e) => setVendor(e.target.value)}
          options={vendorOptions}
        />

        <FormField
          id="provider-environment"
          label="Environment"
          as="select"
          value={environment}
          onChange={(e) => setEnvironment(e.target.value)}
          options={envOptions}
        />
      </fieldset>

      <fieldset className="form-fieldset">
        <legend className="form-legend">Connection</legend>

        <FormField
          id="provider-base-url"
          label="Base URL"
          required
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder="http://localhost:11434"
          autoComplete="url"
        />

        <FormField
          id="provider-auth-type"
          label="Auth Type"
          as="select"
          value={authType}
          onChange={(e) => setAuthType(e.target.value)}
          options={authOptions}
        />
      </fieldset>

      {showSecret && (
        <fieldset className="form-fieldset">
          <legend className="form-legend">Authentication</legend>

          <FormField
            id="provider-secret"
            label="API Key / Token"
            type="password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            placeholder="API key or token"
            autoComplete="new-password"
            helper="Only set on creation. Cannot be changed later."
          />
        </fieldset>
      )}

      <div className="form-actions">
        <button
          type="submit"
          className="button button--primary"
          aria-busy={isSubmitting}
          disabled={isSubmitting}
        >
          {isSubmitting ? 'Creating...' : 'Create Provider'}
        </button>
      </div>

      <div aria-live="polite" className="form-status">
        {submitStatus && <p>{submitStatus}</p>}
      </div>
    </form>
  );
}
