interface RawResponseViewerProps {
  data: Record<string, unknown>;
}

export function RawResponseViewer({ data }: RawResponseViewerProps) {
  return (
    <details className="raw-response-viewer">
      <summary className="raw-response-viewer__summary">Raw Response</summary>
      <pre className="raw-response-viewer__content">
        {JSON.stringify(data, null, 2)}
      </pre>
    </details>
  );
}
