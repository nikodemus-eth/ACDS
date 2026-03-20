import type { OutputMode } from '@acds/core-types';

interface OutputRendererProps {
  type: OutputMode;
  value: unknown;
}

export function OutputRenderer({ type, value }: OutputRendererProps) {
  switch (type) {
    case 'text':
      return (
        <div className="output-renderer output-renderer--text">
          <pre className="output-renderer__text">{String(value)}</pre>
          <button
            className="button button--ghost button--sm"
            onClick={() => navigator.clipboard.writeText(String(value))}
          >
            Copy
          </button>
        </div>
      );
    case 'image':
      return (
        <div className="output-renderer output-renderer--image">
          {typeof value === 'string' && value.startsWith('data:') ? (
            <img src={value} alt="Generated output" className="output-renderer__image" />
          ) : (
            <pre className="output-renderer__text">{JSON.stringify(value, null, 2)}</pre>
          )}
        </div>
      );
    case 'audio':
      return (
        <div className="output-renderer output-renderer--audio">
          {typeof value === 'string' && value.startsWith('data:') ? (
            <audio controls src={value} className="output-renderer__audio" />
          ) : (
            <pre className="output-renderer__text">{JSON.stringify(value, null, 2)}</pre>
          )}
        </div>
      );
    case 'json':
      return (
        <div className="output-renderer output-renderer--json">
          <pre className="output-renderer__text">
            {typeof value === 'string' ? value : JSON.stringify(value, null, 2)}
          </pre>
        </div>
      );
    case 'error':
      return (
        <div className="output-renderer output-renderer--error">
          <pre className="output-renderer__text output-renderer__text--error">
            {typeof value === 'string' ? value : JSON.stringify(value, null, 2)}
          </pre>
        </div>
      );
    default:
      return (
        <div className="output-renderer">
          <pre className="output-renderer__text">{JSON.stringify(value, null, 2)}</pre>
        </div>
      );
  }
}
