import React, { forwardRef, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
    label?: string;
    error?: string;
    hint?: string;
    icon?: React.ReactNode;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
    ({ label, error, hint, icon, type, className = '', ...props }, ref) => {
        const isPassword = type === 'password';
        const [reveal, setReveal] = useState(false);
        const effectiveType = isPassword ? (reveal ? 'text' : 'password') : type;

        return (
            <div className="input-group">
                {label && <label className="input-label" htmlFor={props.id}>{label}</label>}
                <div className={`input-container ${error ? 'has-error' : ''} ${icon ? 'has-icon' : ''}`}>
                    {icon && <span className="input-icon" aria-hidden="true">{icon}</span>}
                    <input
                        ref={ref}
                        type={effectiveType}
                        className={`input-control ${className}`}
                        aria-invalid={!!error}
                        {...props}
                    />
                    {isPassword && (
                        <button
                            type="button"
                            className="input-reveal"
                            onClick={() => setReveal(r => !r)}
                            aria-label={reveal ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                            tabIndex={-1}
                        >
                            {reveal ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                    )}
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

Input.displayName = 'Input';
export default Input;
