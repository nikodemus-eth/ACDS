import React, { useState } from 'react';
import type { PolicyPayload, PolicyRecord } from '../../features/policies/policiesApi';
import { FormField } from './FormField';

interface PolicyFormProps {
  initial?: PolicyRecord;
  onSubmit: (data: PolicyPayload) => void;
  onCancel: () => void;
  isSubmitting: boolean;
}

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
  const [jsonError, setJsonError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setJsonError(null);

    let defaults: Record<string, unknown> = {};
    let constraints: Record<string, unknown> = {};
    try {
      defaults = JSON.parse(defaultsJson) as Record<string, unknown>;
      constraints = JSON.parse(constraintsJson) as Record<string, unknown>;
    } catch {
      setJsonError('Invalid JSON in defaults or constraints. Please check syntax.');
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

  const levelOptions = [
    { value: 'global', label: 'Global' },
    { value: 'application', label: 'Application' },
    { value: 'process', label: 'Process' },
  ];

  return (
    <form onSubmit={handleSubmit} className="form-panel">
      <h3 className="form-panel__title">
        {initial ? 'Edit Policy' : 'New Policy'}
      </h3>

      {!initial && (
        <FormField
          id="policy-level"
          label="Level"
          as="select"
          value={level}
          onChange={(e) => setLevel(e.target.value as PolicyPayload['level'])}
          options={levelOptions}
        />
      )}

      {(level === 'application' || level === 'process') && (
        <fieldset className="form-fieldset">
          <legend className="form-legend">Scope</legend>

          <FormField
            id="policy-application"
            label="Application"
            required
            value={application}
            onChange={(e) => setApplication(e.target.value)}
            autoComplete="off"
          />

          {level === 'process' && (
            <FormField
              id="policy-process"
              label="Process"
              required
              value={process}
              onChange={(e) => setProcess(e.target.value)}
              autoComplete="off"
            />
          )}
        </fieldset>
      )}

      <fieldset className="form-fieldset">
        <legend className="form-legend">Vendor Restrictions</legend>

        <FormField
          id="policy-allowed-vendors"
          label="Allowed Vendors"
          value={allowedVendors}
          onChange={(e) => setAllowedVendors(e.target.value)}
          placeholder="ollama, openai"
          helper="Comma-separated list of allowed vendors"
        />

        <FormField
          id="policy-blocked-vendors"
          label="Blocked Vendors"
          value={blockedVendors}
          onChange={(e) => setBlockedVendors(e.target.value)}
          placeholder="Leave empty for none"
          helper="Comma-separated list of blocked vendors"
        />
      </fieldset>

      <fieldset className="form-fieldset">
        <legend className="form-legend">Advanced Configuration</legend>

        <FormField
          id="policy-defaults"
          label="Defaults (JSON)"
          as="textarea"
          value={defaultsJson}
          onChange={(e) => { setDefaultsJson(e.target.value); setJsonError(null); }}
          error={jsonError && jsonError.includes('defaults') ? jsonError : undefined}
          helper="Valid JSON object for default routing parameters"
        >
          <textarea
            id="policy-defaults"
            className={`form-field__input form-field__input--mono ${jsonError ? 'form-field__input--invalid' : ''}`}
            value={defaultsJson}
            onChange={(e) => { setDefaultsJson(e.target.value); setJsonError(null); }}
            rows={4}
            aria-describedby="policy-defaults-helper"
          />
          <div id="policy-defaults-helper" className="form-field__helper">
            Valid JSON object, e.g. {`{"maxLatencyMs": 3000}`}
          </div>
        </FormField>

        <FormField
          id="policy-constraints"
          label="Constraints (JSON)"
          as="textarea"
          value={constraintsJson}
          onChange={(e) => { setConstraintsJson(e.target.value); setJsonError(null); }}
          error={jsonError && jsonError.includes('constraints') ? jsonError : undefined}
        >
          <textarea
            id="policy-constraints"
            className={`form-field__input form-field__input--mono ${jsonError ? 'form-field__input--invalid' : ''}`}
            value={constraintsJson}
            onChange={(e) => { setConstraintsJson(e.target.value); setJsonError(null); }}
            rows={4}
            aria-describedby="policy-constraints-helper"
          />
          <div id="policy-constraints-helper" className="form-field__helper">
            Valid JSON object, e.g. {`{"localOnly": true}`}
          </div>
        </FormField>

        {jsonError && (
          <div role="alert" className="form-field__error">
            {jsonError}
          </div>
        )}
      </fieldset>

      <div className="form-actions">
        <button
          type="submit"
          className="button button--primary"
          aria-busy={isSubmitting}
          disabled={isSubmitting}
        >
          {isSubmitting ? 'Saving...' : initial ? 'Update Policy' : 'Create Policy'}
        </button>
        <button
          type="button"
          className="button button--ghost"
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>

      <div aria-live="polite" className="form-status" />
    </form>
  );
}
