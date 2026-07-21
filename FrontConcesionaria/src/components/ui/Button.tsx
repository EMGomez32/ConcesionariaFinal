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
    ...props
}: ButtonProps) => {
    const sizeClass = size === 'md' ? '' : `btn-${size}`;
    const composed = ['btn', `btn-${variant}`, sizeClass, loading ? 'is-loading' : '', className]
        .filter(Boolean)
        .join(' ');

    return (
        <button
            className={composed}
            disabled={loading || props.disabled}
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
