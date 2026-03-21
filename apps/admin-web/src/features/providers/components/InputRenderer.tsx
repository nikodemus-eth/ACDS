import { useState, useRef, useCallback } from 'react';
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
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onload = () => {
          setFileDataUri(reader.result as string);
          setFileName('recording.webm');
        };
        reader.readAsDataURL(blob);
        if (timerRef.current) clearInterval(timerRef.current);
        setRecordingDuration(0);
      };

      mediaRecorderRef.current = recorder;
      recorder.start(250); // collect data every 250ms
      setIsRecording(true);
      setRecordingDuration(0);
      timerRef.current = setInterval(() => setRecordingDuration((d) => d + 1), 1000);
    } catch {
      // Microphone permission denied or not available
      setFileName('');
      setFileDataUri('');
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

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
            <div className="input-renderer__audio-controls">
              <div className="input-renderer__record-group">
                {!isRecording ? (
                  <button
                    type="button"
                    onClick={startRecording}
                    className="button button--record"
                    disabled={isPending}
                  >
                    Record
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={stopRecording}
                    className="button button--stop-record"
                  >
                    Stop ({recordingDuration}s)
                  </button>
                )}
                <span className="input-renderer__or-divider">or</span>
                <label className="input-renderer__file-label input-renderer__file-label--inline">
                  Upload file
                  <input
                    ref={fileRef}
                    type="file"
                    accept="audio/*"
                    onChange={handleFileChange}
                    className="input-renderer__file-input"
                  />
                </label>
              </div>
            </div>
            {fileName && (
              <span className="input-renderer__file-name">{fileName}</span>
            )}
            {fileDataUri && (
              <audio controls src={fileDataUri} className="input-renderer__audio-preview" />
            )}
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
