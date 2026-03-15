import React, { useState } from 'react';
import type { CreateProfilePayload } from '../../features/profiles/profilesApi';

interface ProfileFormProps {
  onSubmit: (data: CreateProfilePayload) => void;
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

export function ProfileForm({ onSubmit, isSubmitting }: ProfileFormProps) {
  const [type, setType] = useState<'model' | 'tactic'>('model');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [taskTypes, setTaskTypes] = useState('');
  const [loadTiers, setLoadTiers] = useState('');
  const [cognitiveGrade, setCognitiveGrade] = useState('standard');
  const [executionMethod, setExecutionMethod] = useState('');
  const [multiStage, setMultiStage] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const base: CreateProfilePayload = { type, name, description };

    if (type === 'model') {
      Object.assign(base, {
        supportedTaskTypes: taskTypes.split(',').map((s) => s.trim()).filter(Boolean),
        supportedLoadTiers: loadTiers.split(',').map((s) => s.trim()).filter(Boolean),
        minimumCognitiveGrade: cognitiveGrade,
        localOnly: false,
        cloudAllowed: true,
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
      <h3 style={{ margin: '0 0 16px', fontSize: '16px', fontWeight: 600 }}>New Profile</h3>

      <div style={fieldStyle}>
        <label style={labelElStyle}>Type</label>
        <select style={inputStyle} value={type} onChange={(e) => setType(e.target.value as 'model' | 'tactic')}>
          <option value="model">Model Profile</option>
          <option value="tactic">Tactic Profile</option>
        </select>
      </div>

      <div style={fieldStyle}>
        <label style={labelElStyle}>Name</label>
        <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} required />
      </div>

      <div style={fieldStyle}>
        <label style={labelElStyle}>Description</label>
        <textarea
          style={{ ...inputStyle, minHeight: '60px' }}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      <div style={fieldStyle}>
        <label style={labelElStyle}>Supported Task Types (comma-separated)</label>
        <input
          style={inputStyle}
          value={taskTypes}
          onChange={(e) => setTaskTypes(e.target.value)}
          placeholder="completion, chat, embedding"
        />
      </div>

      <div style={fieldStyle}>
        <label style={labelElStyle}>Supported Load Tiers (comma-separated)</label>
        <input
          style={inputStyle}
          value={loadTiers}
          onChange={(e) => setLoadTiers(e.target.value)}
          placeholder="single_shot, batch, streaming, high_throughput"
        />
      </div>

      {type === 'model' && (
        <div style={fieldStyle}>
          <label style={labelElStyle}>Minimum Cognitive Grade</label>
          <select style={inputStyle} value={cognitiveGrade} onChange={(e) => setCognitiveGrade(e.target.value)}>
            <option value="basic">basic</option>
            <option value="standard">standard</option>
            <option value="enhanced">enhanced</option>
            <option value="frontier">frontier</option>
            <option value="specialized">specialized</option>
          </select>
        </div>
      )}

      {type === 'tactic' && (
        <>
          <div style={fieldStyle}>
            <label style={labelElStyle}>Execution Method</label>
            <input
              style={inputStyle}
              value={executionMethod}
              onChange={(e) => setExecutionMethod(e.target.value)}
              placeholder="e.g. chain_of_thought"
              required
            />
          </div>
          <div style={fieldStyle}>
            <label style={{ ...labelElStyle, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="checkbox"
                checked={multiStage}
                onChange={(e) => setMultiStage(e.target.checked)}
              />
              Multi-Stage
            </label>
          </div>
        </>
      )}

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
        {isSubmitting ? 'Creating...' : 'Create Profile'}
      </button>
    </form>
  );
}
