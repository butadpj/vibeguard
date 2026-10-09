import { useState, useRef, type ChangeEvent } from 'react';

export type SetupStatus = 'Ready' | 'Setup incomplete' | 'Unsupported setup' | null;

interface ProjectPickerProps {
  onProjectReady?: (previewUrl: string) => void;
}

export function ProjectPicker({ onProjectReady }: ProjectPickerProps) {
  const [status, setStatus] = useState<SetupStatus>(null);
  const [stack, setStack] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);

  async function handleProjectIngestion(files: FileList | null) {
    if (!files || files.length === 0) return;

    setLoading(true);
    setErrorMessage(null);
    setStatus(null);

    const formData = new FormData();
    for (let i = 0; i < files.length; i++) {
      formData.append('files', files[i]);
    }

    try {
      const response = await fetch('/api/projects/ingest', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Failed to process project archive or folder.');
      }

      const data = await response.json();
      // Expected response schema from runner contract:
      // { status: SetupStatus, stack: string, previewUrl?: string, message?: string }
      setStatus(data.status);
      setStack(data.stack ?? 'Unknown Stack');

      if (data.status === 'Ready' && data.previewUrl) {
        setPreviewUrl(data.previewUrl);
        if (onProjectReady) {
          onProjectReady(data.previewUrl);
        }
      }
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'An error occurred during project ingestion.',
      );
      setStatus('Unsupported setup');
    } finally {
      setLoading(false);
    }
  }

  function handleZipChange(e: ChangeEvent<HTMLInputElement>) {
    handleProjectIngestion(e.target.files);
  }

  function handleFolderChange(e: ChangeEvent<HTMLInputElement>) {
    handleProjectIngestion(e.target.files);
  }

  return (
    <div style={{ border: '1px solid var(--color-border, #ccc)', padding: '1.5rem', borderRadius: '8px', margin: '1rem 0' }}>
      <h2>Project Setup & Ingestion</h2>
      <p>Upload a project ZIP file or select a project folder to auto-detect stack and provision environment.</p>

      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
        <button
          type="button"
          onClick={() => folderInputRef.current?.click()}
          disabled={loading}
        >
          {loading ? 'Analyzing...' : 'Choose Folder'}
        </button>
        <input
          type="file"
          ref={folderInputRef}
          onChange={handleFolderChange}
          style={{ display: 'none' }}
          /* @ts-expect-error webkitdirectory is standard in browser environments */
          webkitdirectory=""
          directory=""
        />

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={loading}
        >
          {loading ? 'Analyzing...' : 'Upload ZIP'}
        </button>
        <input
          type="file"
          ref={fileInputRef}
          accept=".zip"
          onChange={handleZipChange}
          style={{ display: 'none' }}
        />
      </div>

      {loading && <p role="status">Detecting stack and provisioning environment…</p>}

      {errorMessage && (
        <p style={{ color: 'red' }} role="alert">
          {errorMessage}
        </p>
      )}

      {status && (
        <div style={{ padding: '1rem', borderRadius: '6px', background: '#f5f5f5' }}>
          <h3>Status: <strong>{status}</strong></h3>
          {stack && <p><strong>Detected Stack:</strong> {stack}</p>}

          {status === 'Ready' && previewUrl && (
            <div>
              <p style={{ color: 'green' }}>✓ Project is provisioned and ready!</p>
              <a
                href={previewUrl}
                target="_blank"
                rel="noreferrer"
                style={{
                  display: 'inline-block',
                  padding: '0.5rem 1rem',
                  backgroundColor: '#0066cc',
                  color: '#fff',
                  borderRadius: '4px',
                  textDecoration: 'none',
                }}
              >
                Open Test App Preview
              </a>
            </div>
          )}

          {status === 'Setup incomplete' && (
            <p style={{ color: '#d97706' }}>
              ⚠️ Missing configuration or dependencies. Check project files and try again.
            </p>
          )}

          {status === 'Unsupported setup' && (
            <p style={{ color: '#dc2626' }}>
              ✕ Unsupported framework or structure detected.
            </p>
          )}
        </div>
      )}
    </div>
  );
}