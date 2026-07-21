import { useRef, useState } from 'react';
import { Upload, X, FileText, AlertCircle, CheckCircle2 } from 'lucide-react';
import client from '../../api/client';

interface FileUploaderProps {
    /** Endpoint POST multipart. The component will append the field `file` to the FormData. */
    endpoint: string;
    /** Extra form fields sent alongside the file (e.g. vehiculoId, tipo, descripcion). */
    extraFields?: Record<string, string | number | undefined>;
    /** Called after a successful upload with the response body. */
    onUploaded?: (result: unknown) => void;
    /** MIME types accepted by the file input. */
    accept?: string;
    /** Max bytes; default 25 MB (matches backend). */
    maxBytes?: number;
    /** Label shown above the dropzone. */
    label?: string;
    /** Disable the uploader (e.g. while a parent form is loading). */
    disabled?: boolean;
}

const DEFAULT_MAX = 25 * 1024 * 1024;

const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

export function FileUploader({
    endpoint,
    extraFields = {},
    onUploaded,
    accept,
    maxBytes = DEFAULT_MAX,
    label = 'Subir archivo',
    disabled = false,
}: FileUploaderProps) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [file, setFile] = useState<File | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [uploading, setUploading] = useState(false);
    const [progress, setProgress] = useState(0);
    const [dragOver, setDragOver] = useState(false);

    const reset = () => {
        setFile(null);
        setError(null);
        setProgress(0);
        if (inputRef.current) inputRef.current.value = '';
    };

    const handleFiles = (f: File | undefined) => {
        if (!f) return;
        if (f.size > maxBytes) {
            setError(`El archivo supera el máximo de ${formatSize(maxBytes)}`);
            return;
        }
        setFile(f);
        setError(null);
    };

    const handleSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        handleFiles(e.target.files?.[0]);
    };

    const handleDrop = (e: React.DragEvent<HTMLButtonElement>) => {
        e.preventDefault();
        setDragOver(false);
        handleFiles(e.dataTransfer.files?.[0]);
    };

    const handleUpload = async () => {
        if (!file) return;
        setError(null);
        setUploading(true);
        setProgress(0);

        try {
            const formData = new FormData();
            formData.append('file', file);
            for (const [key, value] of Object.entries(extraFields)) {
                if (value !== undefined && value !== null && value !== '') {
                    formData.append(key, String(value));
                }
            }

            const result = await client.post<unknown>(endpoint, formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
                onUploadProgress: (event) => {
                    if (event.total) {
                        setProgress(Math.round((event.loaded / event.total) * 100));
                    }
                },
            });

            onUploaded?.(result);
            reset();
        } catch (err: unknown) {
            const e = err as { error?: { message?: string }; message?: string };
            setError(e?.error?.message || e?.message || 'Error al subir el archivo');
        } finally {
            setUploading(false);
        }
    };

    return (
        <div className="uploader">
            {label && <label className="input-label">{label}</label>}

            {!file && (
                <button
                    type="button"
                    className={`uploader-zone ${dragOver ? 'is-drag' : ''}`}
                    onClick={() => inputRef.current?.click()}
                    onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={handleDrop}
                    disabled={disabled}
                >
                    <span className="uploader-zone-icon">
                        <Upload size={20} />
                    </span>
                    <span className="uploader-zone-text">
                        <strong>Arrastrá un archivo</strong>
                        <span>o hacé click para elegir</span>
                    </span>
                    {accept && <small className="uploader-zone-hint">Acepta: {accept}</small>}
                    <small className="uploader-zone-hint">Máx. {formatSize(maxBytes)}</small>
                </button>
            )}

            {file && (
                <div className="uploader-file">
                    <span className="uploader-file-icon">
                        <FileText size={18} />
                    </span>
                    <div className="uploader-file-info">
                        <span className="uploader-filename">{file.name}</span>
                        <small>{formatSize(file.size)}</small>
                    </div>
                    {!uploading && (
                        <button type="button" onClick={reset} className="uploader-clear" aria-label="Quitar archivo">
                            <X size={14} />
                        </button>
                    )}
                </div>
            )}

            {uploading && (
                <div className="uploader-progress" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
                    <div className="uploader-progress-track">
                        <div className="uploader-progress-fill" style={{ width: `${progress}%` }} />
                    </div>
                    <small>{progress}%</small>
                </div>
            )}

            {error && (
                <div className="uploader-alert uploader-alert-error" role="alert">
                    <AlertCircle size={14} />
                    <span>{error}</span>
                </div>
            )}

            <input
                ref={inputRef}
                type="file"
                accept={accept}
                onChange={handleSelect}
                disabled={disabled || uploading}
                style={{ display: 'none' }}
            />

            {file && !uploading && (
                <button
                    type="button"
                    onClick={handleUpload}
                    disabled={disabled}
                    className="btn btn-primary btn-sm uploader-submit"
                >
                    <CheckCircle2 size={14} />
                    Subir archivo
                </button>
            )}

            <style>{`
                .uploader {
                    display: flex;
                    flex-direction: column;
                    gap: var(--space-3);
                }

                .uploader-zone {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: var(--space-2);
                    padding: var(--space-6) var(--space-4);
                    border: 1.5px dashed var(--border-strong);
                    border-radius: var(--radius-lg);
                    background: var(--bg-secondary);
                    color: var(--text-secondary);
                    cursor: pointer;
                    text-align: center;
                    transition: border-color var(--duration-base) var(--easing-soft),
                                background var(--duration-base) var(--easing-soft),
                                color var(--duration-base) var(--easing-soft);
                }

                .uploader-zone:hover:not(:disabled),
                .uploader-zone.is-drag {
                    border-color: var(--accent);
                    background: var(--accent-light);
                    color: var(--accent);
                }

                .uploader-zone:disabled { opacity: 0.5; cursor: not-allowed; }

                .uploader-zone-icon {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    width: 44px;
                    height: 44px;
                    border-radius: var(--radius-md);
                    background: var(--bg-card);
                    border: 1px solid var(--border);
                    color: inherit;
                }

                .uploader-zone-text {
                    display: flex;
                    flex-direction: column;
                    gap: 2px;
                    font-size: var(--text-sm);
                }

                .uploader-zone-text strong {
                    font-family: var(--font-display);
                    font-size: var(--text-base);
                    color: var(--text-primary);
                    font-weight: 600;
                }

                .uploader-zone:hover:not(:disabled) .uploader-zone-text strong,
                .uploader-zone.is-drag .uploader-zone-text strong {
                    color: var(--accent);
                }

                .uploader-zone-hint {
                    font-size: var(--text-xs);
                    color: var(--text-muted);
                }

                .uploader-file {
                    display: flex;
                    align-items: center;
                    gap: var(--space-3);
                    padding: var(--space-3) var(--space-4);
                    border: 1px solid var(--border);
                    border-radius: var(--radius-md);
                    background: var(--bg-card);
                }

                .uploader-file-icon {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    width: 36px;
                    height: 36px;
                    border-radius: var(--radius-sm);
                    background: var(--accent-light);
                    color: var(--accent);
                }

                .uploader-file-info {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    min-width: 0;
                }

                .uploader-filename {
                    font-size: var(--text-sm);
                    font-weight: 500;
                    color: var(--text-primary);
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }

                .uploader-file-info small {
                    font-size: var(--text-xs);
                    color: var(--text-muted);
                }

                .uploader-clear {
                    background: transparent;
                    color: var(--text-muted);
                    border: 1px solid transparent;
                    padding: 0.35rem;
                    border-radius: var(--radius-sm);
                    cursor: pointer;
                    transition: background var(--duration-base) var(--easing-soft),
                                color var(--duration-base) var(--easing-soft),
                                border-color var(--duration-base) var(--easing-soft);
                }

                .uploader-clear:hover {
                    background: rgba(239, 68, 68, 0.10);
                    border-color: rgba(239, 68, 68, 0.25);
                    color: var(--danger);
                }

                .uploader-progress {
                    display: flex;
                    align-items: center;
                    gap: var(--space-3);
                    font-family: var(--font-display);
                    font-variant-numeric: tabular-nums;
                    font-size: var(--text-xs);
                    color: var(--text-secondary);
                }

                .uploader-progress-track {
                    flex: 1;
                    height: 6px;
                    background: var(--bg-secondary);
                    border-radius: var(--radius-pill);
                    overflow: hidden;
                }

                .uploader-progress-fill {
                    height: 100%;
                    border-radius: var(--radius-pill);
                    background: var(--accent-gradient);
                    transition: width 0.18s var(--easing-soft);
                    box-shadow: 0 0 8px rgba(var(--accent-rgb), 0.5);
                }

                .uploader-alert {
                    display: flex;
                    align-items: center;
                    gap: var(--space-2);
                    padding: var(--space-2) var(--space-3);
                    border-radius: var(--radius-sm);
                    font-size: var(--text-xs);
                    font-weight: 500;
                }

                .uploader-alert-error {
                    background: rgba(239, 68, 68, 0.10);
                    border: 1px solid rgba(239, 68, 68, 0.25);
                    color: var(--danger);
                }

                .uploader-submit {
                    align-self: flex-start;
                }
            `}</style>
        </div>
    );
}
