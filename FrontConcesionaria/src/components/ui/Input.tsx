import React, { forwardRef, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
    label?: string;
    error?: string;
    hint?: string;
    icon?: React.ReactNode;
    /** Métrica compacta (13px, la de los formularios operativos densos).
     *  Sin `dense`, el control usa la métrica protagónica (15px: auth, usuarios). */
    dense?: boolean;
    /** Clases extra para el wrapper .input-group (p.ej. col-span-2 en grillas). */
    containerClassName?: string;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
    ({ label, error, hint, icon, dense, containerClassName = '', type, className = '', ...props }, ref) => {
        const isPassword = type === 'password';
        const [reveal, setReveal] = useState(false);
        const effectiveType = isPassword ? (reveal ? 'text' : 'password') : type;

        return (
            <div className={`input-group ${dense ? 'input-group--dense' : ''} ${containerClassName}`}>
                {label && <label className="input-label" htmlFor={props.id}>{label}</label>}
                <div className={`input-container ${error ? 'has-error' : ''} ${icon ? 'has-icon' : ''}`}>
                    {icon && <span className="input-icon" aria-hidden="true">{icon}</span>}
                    <input
                        ref={ref}
                        type={effectiveType}
                        className={`input-control ${dense ? 'input-control--dense' : ''} ${className}`}
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
