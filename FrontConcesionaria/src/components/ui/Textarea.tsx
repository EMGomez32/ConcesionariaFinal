import React, { forwardRef } from 'react';
import { useCampoIds } from './useCampoIds';

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
    label?: string;
    error?: string;
    hint?: string;
    /** Métrica compacta (13px, formularios operativos densos). */
    dense?: boolean;
    /** Clases extra para el wrapper .input-group (p.ej. col-span-2 en grillas). */
    containerClassName?: string;
}

const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
    ({ label, error, hint, dense, containerClassName = '', className = '', rows = 4, id, 'aria-describedby': describedBy, ...props }, ref) => {
        const { campoId, mensajeId, descripcion } = useCampoIds(id, describedBy, !!(error || hint));
        return (
            <div className={`input-group ${dense ? 'input-group--dense' : ''} ${containerClassName}`}>
                {label && <label className="input-label" htmlFor={campoId}>{label}</label>}
                <div className={`input-container ${error ? 'has-error' : ''}`}>
                    <textarea
                        ref={ref}
                        id={campoId}
                        rows={rows}
                        className={`input-control ${dense ? 'input-control--dense' : ''} input-textarea ${className}`}
                        aria-invalid={error ? true : undefined}
                        aria-describedby={descripcion}
                        {...props}
                    />
                </div>
                {error
                    ? <span id={mensajeId} className="input-feedback input-feedback-error">{error}</span>
                    : hint
                        ? <span id={mensajeId} className="input-feedback">{hint}</span>
                        : null}
            </div>
        );
    }
);

Textarea.displayName = 'Textarea';
export default Textarea;
