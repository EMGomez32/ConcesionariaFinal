import React, { forwardRef } from 'react';
import { ChevronDown } from 'lucide-react';

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
    label?: string;
    error?: string;
    hint?: string;
    options: { value: string | number; label: string }[];
    placeholder?: string;
}

const Select = forwardRef<HTMLSelectElement, SelectProps>(
    ({ label, error, hint, options, placeholder = 'Seleccione una opción…', className = '', ...props }, ref) => {
        return (
            <div className="input-group">
                {label && <label className="input-label" htmlFor={props.id}>{label}</label>}
                <div className={`input-container input-select-wrapper ${error ? 'has-error' : ''}`}>
                    <select
                        ref={ref}
                        className={`input-control input-select ${className}`}
                        aria-invalid={!!error}
                        {...props}
                    >
                        <option value="">{placeholder}</option>
                        {options?.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                                {opt.label}
                            </option>
                        ))}
                    </select>
                    <ChevronDown size={16} className="input-select-chevron" aria-hidden="true" />
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

Select.displayName = 'Select';
export default Select;
