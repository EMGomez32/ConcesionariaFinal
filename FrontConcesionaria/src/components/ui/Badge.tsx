import React from 'react';

export type BadgeVariant =
    | 'success'
    | 'warning'
    | 'danger'
    | 'info'
    | 'violet'
    | 'cyan'
    | 'default';

interface BadgeProps {
    children: React.ReactNode;
    variant?: BadgeVariant;
    className?: string;
    /** Tooltip nativo: un rótulo de una palabra a veces necesita explicar por qué está. */
    title?: string;
}

const VARIANT_TO_CLASS: Record<BadgeVariant, string> = {
    success: 'badge-emerald',
    info: 'badge-cyan',
    cyan: 'badge-cyan',
    violet: 'badge-violet',
    warning: 'badge-warning',
    danger: 'badge-danger',
    default: 'badge-navy',
};

const Badge = ({ children, variant = 'default', className = '', title }: BadgeProps) => {
    return (
        <span className={`badge ${VARIANT_TO_CLASS[variant]} ${className}`.trim()} title={title}>
            {children}
        </span>
    );
};

export default Badge;
