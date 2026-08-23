import React, { forwardRef } from 'react';

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
    ({ label, error, hint, dense, containerClassName = '', className = '', rows = 4, ...props }, ref) => {
        return (
            <div className={`input-group ${dense ? 'input-group--dense' : ''} ${containerClassName}`}>
                {label && <label className="input-label" htmlFor={props.id}>{label}</label>}
                <div className={`input-container ${error ? 'has-error' : ''}`}>
                    <textarea
                        ref={ref}
                        rows={rows}
                        className={`input-control ${dense ? 'input-control--dense' : ''} input-textarea ${className}`}
                        aria-invalid={!!error}
                        {...props}
                    />
                </div>
                {error
                    ? <span className="input-feedback input-feedback-error">{error}</span>
                    : hint
                        ? <span className="input-feedback">{hint}</span>
                        : null}
            </div>
        );
    }
);

Textarea.displayName = 'Textarea';
export default Textarea;
