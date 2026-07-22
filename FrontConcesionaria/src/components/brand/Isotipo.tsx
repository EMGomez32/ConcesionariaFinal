// Isotipo de marca AUTENZA — hexágono con la "A" (pico) y nodo superior.
// Paths tomados de marca-autenza/svg/isotipo-*.svg. Reemplaza al ícono genérico
// que se usaba como logo. Por defecto pinta con `color` (útil en blanco sobre la
// caja de gradiente de marca); con `gradient` usa el degradado emerald→cyan→violet.
interface IsotipoProps {
    size?: number;
    /** Color del trazo/nodo cuando gradient=false. Default: currentColor. */
    color?: string;
    /** Usa el gradiente de marca (emerald→cyan→violet) en vez de un color plano. */
    gradient?: boolean;
    className?: string;
    /** Si se pasa, el SVG se anuncia como imagen con este texto; si no, es decorativo. */
    title?: string;
}

const Isotipo = ({ size = 28, color = 'currentColor', gradient = false, className, title }: IsotipoProps) => {
    const stroke = gradient ? 'url(#autenzaIsoGrad)' : color;
    const node = gradient ? '#10b981' : color;
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 56 56"
            fill="none"
            className={className}
            role={title ? 'img' : undefined}
            aria-label={title}
            aria-hidden={title ? undefined : true}
            xmlns="http://www.w3.org/2000/svg"
        >
            {gradient && (
                <defs>
                    <linearGradient id="autenzaIsoGrad" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0" stopColor="#10b981" />
                        <stop offset=".5" stopColor="#06b6d4" />
                        <stop offset="1" stopColor="#8b5cf6" />
                    </linearGradient>
                </defs>
            )}
            <path d="M28 6 L47 17 V39 L28 50 L9 39 V17 Z" stroke={stroke} strokeWidth={2.6} strokeLinejoin="round" />
            <path d="M19 43 L28 21 L37 43" stroke={stroke} strokeWidth={3.4} strokeLinecap="round" strokeLinejoin="round" />
            <path d="M23 34 H33" stroke={stroke} strokeWidth={3.4} strokeLinecap="round" />
            <circle cx="28" cy="6" r="3.2" fill={node} />
        </svg>
    );
};

export default Isotipo;
