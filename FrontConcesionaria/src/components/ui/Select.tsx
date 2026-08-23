import React, { forwardRef } from 'react';
import { ChevronDown } from 'lucide-react';

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
    label?: string;
    error?: string;
    hint?: string;
    /** Opciones planas. Para <optgroup> u opciones con lógica, usar `children`
     *  (tienen prioridad sobre `options`). */
    options?: { value: string | number; label: string }[];
    /** Texto de la opción vacía inicial. En modo `options` hay una por defecto;
     *  con `children` sólo se agrega si se pasa explícitamente. */
    placeholder?: string;
    /** Métrica compacta (13px, formularios operativos densos). */
    dense?: boolean;
    /** Clases extra para el wrapper .input-group (p.ej. col-span-2 en grillas). */
    containerClassName?: string;
    children?: React.ReactNode;
}

const Select = forwardRef<HTMLSelectElement, SelectProps>(
    ({ label, error, hint, options, placeholder, dense, containerClassName = '', className = '', children, ...props }, ref) => {
        const conChildren = children != null;
        // Modo options: conserva el placeholder por defecto histórico del componente.
        const placeholderFinal = conChildren ? placeholder : (placeholder ?? 'Seleccione una opción…');
        return (
            <div className={`input-group ${dense ? 'input-group--dense' : ''} ${containerClassName}`}>
                {label && <label className="input-label" htmlFor={props.id}>{label}</label>}
                <div className={`input-container input-select-wrapper ${error ? 'has-error' : ''}`}>
                    <select
                        ref={ref}
                        className={`input-control ${dense ? 'input-control--dense' : ''} input-select ${className}`}
                        aria-invalid={!!error}
                        {...props}
                    >
                        {placeholderFinal != null && <option value="">{placeholderFinal}</option>}
                        {conChildren
                            ? children
                            : options?.map((opt) => (
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
