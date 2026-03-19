import React, { useState } from 'react';
import type { CreateProfilePayload } from '../../features/profiles/profilesApi';
import { FormField } from './FormField';

interface ProfileFormProps {
  onSubmit: (data: CreateProfilePayload) => void;
  isSubmitting: boolean;
}

export function ProfileForm({ onSubmit, isSubmitting }: ProfileFormProps) {
  const [type, setType] = useState<'model' | 'tactic'>('model');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [taskTypes, setTaskTypes] = useState('');
  const [loadTiers, setLoadTiers] = useState('');
  const [vendor, setVendor] = useState('openai');
  const [modelId, setModelId] = useState('');
  const [cognitiveGrade, setCognitiveGrade] = useState('standard');
  const [executionMethod, setExecutionMethod] = useState('');
  const [multiStage, setMultiStage] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const base: CreateProfilePayload = { type, name, description };

    if (type === 'model') {
      Object.assign(base, {
        vendor,
        modelId: modelId || name,
        supportedTaskTypes: taskTypes.split(',').map((s) => s.trim()).filter(Boolean),
        supportedLoadTiers: loadTiers.split(',').map((s) => s.trim()).filter(Boolean),
        minimumCognitiveGrade: cognitiveGrade,
        localOnly: vendor === 'ollama',
        cloudAllowed: vendor !== 'ollama',
        enabled: true,
      });
    } else {
      Object.assign(base, {
        executionMethod,
        supportedTaskTypes: taskTypes.split(',').map((s) => s.trim()).filter(Boolean),
        supportedLoadTiers: loadTiers.split(',').map((s) => s.trim()).filter(Boolean),
        multiStage,
        requiresStructuredOutput: false,
        enabled: true,
      });
    }

    onSubmit(base);
  }

  const typeOptions = [
    { value: 'model', label: 'Model Profile' },
    { value: 'tactic', label: 'Tactic Profile' },
  ];

  const vendorOptions = [
    { value: 'openai', label: 'OpenAI' },
    { value: 'anthropic', label: 'Anthropic' },
    { value: 'google', label: 'Google' },
    { value: 'ollama', label: 'Ollama (local)' },
    { value: 'apple', label: 'Apple Intelligence (local)' },
  ];

  const gradeOptions = [
    { value: 'basic', label: 'basic' },
    { value: 'standard', label: 'standard' },
    { value: 'enhanced', label: 'enhanced' },
    { value: 'frontier', label: 'frontier' },
    { value: 'specialized', label: 'specialized' },
  ];

  return (
    <form onSubmit={handleSubmit} className="form-panel">
      <h3 className="form-panel__title">New Profile</h3>

      <FormField
        id="profile-type"
        label="Type"
        as="select"
        value={type}
        onChange={(e) => setType(e.target.value as 'model' | 'tactic')}
        options={typeOptions}
      />

      <fieldset className="form-fieldset">
        <legend className="form-legend">Model Configuration</legend>

        <FormField
          id="profile-name"
          label="Name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="off"
        />

        <FormField
          id="profile-description"
          label="Description"
          as="textarea"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </fieldset>

      <fieldset className="form-fieldset">
        <legend className="form-legend">Capabilities</legend>

        <FormField
          id="profile-task-types"
          label="Supported Task Types"
          value={taskTypes}
          onChange={(e) => setTaskTypes(e.target.value)}
          placeholder="completion, chat, embedding"
          helper="Comma-separated list of task types"
        />

        <FormField
          id="profile-load-tiers"
          label="Supported Load Tiers"
          value={loadTiers}
          onChange={(e) => setLoadTiers(e.target.value)}
          placeholder="single_shot, batch, streaming, high_throughput"
          helper="Comma-separated list of load tiers"
        />
      </fieldset>

      {type === 'model' && (
        <fieldset className="form-fieldset">
          <legend className="form-legend">Cost Settings</legend>

          <FormField
            id="profile-vendor"
            label="Vendor"
            as="select"
            value={vendor}
            onChange={(e) => setVendor(e.target.value)}
            options={vendorOptions}
          />

          <FormField
            id="profile-model-id"
            label="Model ID"
            value={modelId}
            onChange={(e) => setModelId(e.target.value)}
            placeholder="e.g. gpt-4.1, claude-sonnet-4-6"
          />

          <FormField
            id="profile-cognitive-grade"
            label="Minimum Cognitive Grade"
            as="select"
            value={cognitiveGrade}
            onChange={(e) => setCognitiveGrade(e.target.value)}
            options={gradeOptions}
          />
        </fieldset>
      )}

      {type === 'tactic' && (
        <fieldset className="form-fieldset">
          <legend className="form-legend">Tactic Settings</legend>

          <FormField
            id="profile-execution-method"
            label="Execution Method"
            required
            value={executionMethod}
            onChange={(e) => setExecutionMethod(e.target.value)}
            placeholder="e.g. chain_of_thought"
          />

          <div className="form-field">
            <label
              className="form-field__label"
              htmlFor="profile-multi-stage"
              style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              <input
                id="profile-multi-stage"
                type="checkbox"
                checked={multiStage}
                onChange={(e) => setMultiStage(e.target.checked)}
              />
              Multi-Stage
            </label>
          </div>
        </fieldset>
      )}

      <div className="form-actions">
        <button
          type="submit"
          className="button button--primary"
          aria-busy={isSubmitting}
          disabled={isSubmitting}
        >
          {isSubmitting ? 'Creating...' : 'Create Profile'}
        </button>
      </div>

      <div aria-live="polite" className="form-status" />
    </form>
  );
}
