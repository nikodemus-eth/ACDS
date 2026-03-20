import { useState } from 'react';
import type { InputMode } from '@acds/core-types';

interface InputRendererProps {
  inputMode: InputMode;
  onExecute: (input: Record<string, unknown>, settings?: Record<string, unknown>) => void;
  isPending: boolean;
}

export function InputRenderer({ inputMode, onExecute, isPending }: InputRendererProps) {
  const [prompt, setPrompt] = useState('');
  const [temperature, setTemperature] = useState(0.7);

  function handleSubmit() {
    const input: Record<string, unknown> = { prompt };
    const settings: Record<string, unknown> = { temperature };
    onExecute(input, settings);
  }

  return (
    <div className="input-renderer">
      {renderInput()}
      <div className="input-renderer__settings">
        <label className="input-renderer__label">
          Temperature: {temperature}
          <input
            type="range"
            min={0}
            max={2}
            step={0.1}
            value={temperature}
            onChange={(e) => setTemperature(Number(e.target.value))}
            className="input-renderer__slider"
          />
        </label>
      </div>
      <button
        onClick={handleSubmit}
        disabled={isPending || !prompt.trim()}
        className="button button--primary"
      >
        {isPending ? 'Executing...' : 'Execute'}
      </button>
    </div>
  );

  function renderInput() {
    switch (inputMode) {
      case 'text_prompt':
        return (
          <textarea
            className="input-renderer__textarea"
            placeholder="Enter your prompt..."
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={4}
          />
        );
      case 'long_text':
        return (
          <textarea
            className="input-renderer__textarea input-renderer__textarea--large"
            placeholder="Paste your text for processing..."
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={10}
          />
        );
      case 'image_prompt':
        return (
          <textarea
            className="input-renderer__textarea"
            placeholder="Describe the image to generate..."
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={3}
          />
        );
      case 'tts_prompt':
        return (
          <textarea
            className="input-renderer__textarea"
            placeholder="Enter text to speak..."
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={3}
          />
        );
      case 'audio_input':
        return (
          <div className="input-renderer__file-group">
            <p className="input-renderer__hint">Audio input capabilities require file upload</p>
            <textarea
              className="input-renderer__textarea"
              placeholder="Or enter text to simulate audio input..."
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={3}
            />
          </div>
        );
      case 'structured_options':
        return (
          <textarea
            className="input-renderer__textarea"
            placeholder='Enter JSON options, e.g. {"key": "value"}'
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={5}
          />
        );
      default:
        return (
          <textarea
            className="input-renderer__textarea"
            placeholder="Enter input..."
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={4}
          />
        );
    }
  }
}
