import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline';
    size?: 'sm' | 'md' | 'lg';
    loading?: boolean;
}

const Button = ({
    children,
    variant = 'primary',
    size = 'md',
    loading,
    className = '',
    style,
    disabled,
    ...props
}: ButtonProps) => {
    const sizeClass = size === 'md' ? '' : `btn-${size}`;
    const composed = ['btn', `btn-${variant}`, sizeClass, loading ? 'is-loading' : '', className]
        .filter(Boolean)
        .join(' ');

    return (
        <button
            className={composed}
            // `disabled` se desestructura arriba a propósito: dejándolo dentro de
            // props, el spread de abajo pisaba el valor calculado con el crudo, y
            // un botón con loading pero sin disabled explícito quedaba clickeable
            // durante todo el round-trip. En "Publicar en Mercado Libre" eso era
            // un doble clic = dos avisos publicados y cobrados.
            disabled={loading || disabled}
            style={style}
            {...props}
        >
            {loading ? (
                <span className="loader-container">
                    <span className="loader" aria-hidden="true"></span>
                    <span>Cargando...</span>
                </span>
            ) : children}
        </button>
    );
};

export default Button;
