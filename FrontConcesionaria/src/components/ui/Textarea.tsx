import React, { forwardRef } from 'react';

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
    label?: string;
    error?: string;
    hint?: string;
}

const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
    ({ label, error, hint, className = '', rows = 4, ...props }, ref) => {
        return (
            <div className="input-group">
                {label && <label className="input-label" htmlFor={props.id}>{label}</label>}
                <div className={`input-container ${error ? 'has-error' : ''}`}>
                    <textarea
                        ref={ref}
                        rows={rows}
                        className={`input-control input-textarea ${className}`}
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
