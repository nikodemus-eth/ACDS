import { useState, useRef } from 'react';
import type { InputMode } from '@acds/core-types';

interface InputRendererProps {
  inputMode: InputMode;
  onExecute: (input: Record<string, unknown>, settings?: Record<string, unknown>) => void;
  isPending: boolean;
}

export function InputRenderer({ inputMode, onExecute, isPending }: InputRendererProps) {
  const [prompt, setPrompt] = useState('');
  const [temperature, setTemperature] = useState(0.7);
  const [fileName, setFileName] = useState('');
  const [fileDataUri, setFileDataUri] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      setFileDataUri(reader.result as string);
    };
    reader.readAsDataURL(file);
  }

  function handleSubmit() {
    const input: Record<string, unknown> = {};
    const settings: Record<string, unknown> = { temperature };

    if (fileDataUri) {
      input.file = fileDataUri;
      input.fileName = fileName;
    }
    if (prompt.trim()) {
      input.prompt = prompt;
      input.text = prompt;
    }

    onExecute(input, settings);
  }

  const hasInput = prompt.trim() || fileDataUri;

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
        disabled={isPending || !hasInput}
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
      case 'image_upload':
        return (
          <div className="input-renderer__file-group">
            <label className="input-renderer__file-label">
              Upload an image for analysis:
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="input-renderer__file-input"
              />
            </label>
            {fileName && (
              <span className="input-renderer__file-name">{fileName}</span>
            )}
            {fileDataUri && (
              <img
                src={fileDataUri}
                alt="Preview"
                className="input-renderer__image-preview"
              />
            )}
            <textarea
              className="input-renderer__textarea"
              placeholder="Optional: additional instructions (e.g., 'extract all text', 'describe scene')..."
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={2}
            />
          </div>
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
            <label className="input-renderer__file-label">
              Upload an audio file:
              <input
                ref={fileRef}
                type="file"
                accept="audio/*"
                onChange={handleFileChange}
                className="input-renderer__file-input"
              />
            </label>
            {fileName && (
              <span className="input-renderer__file-name">{fileName}</span>
            )}
            {fileDataUri && (
              <audio controls src={fileDataUri} className="input-renderer__audio-preview" />
            )}
            <textarea
              className="input-renderer__textarea"
              placeholder="Optional: additional context or instructions..."
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={2}
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
