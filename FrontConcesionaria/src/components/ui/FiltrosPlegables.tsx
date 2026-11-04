import { useId, useState, type ReactNode } from 'react';
import { SlidersHorizontal } from 'lucide-react';

interface FiltrosPlegablesProps {
    /** Los controles de filtro (lo que hoy va dentro de la `.filters-bar`). */
    children: ReactNode;
    /** Cuántos filtros hay aplicados: se muestra en el botón plegado. */
    activos?: number;
    /** Si se pasa y hay filtros activos, aparece "Limpiar filtros" junto al botón. */
    onLimpiar?: () => void;
    /** Texto del botón. */
    titulo?: string;
    /** Clases del contenedor de los filtros. Por defecto, la barra del sistema. */
    className?: string;
    /** Arranca desplegado también en móvil. */
    defaultAbierto?: boolean;
    /** Ancla del tour, si la página la tenía en la barra de filtros. */
    'data-tour'?: string;
}

/**
 * Barra de filtros plegable: en escritorio se ve siempre (como hoy); en tablet y
 * teléfono arranca plegada detrás de un botón "Filtros (n)" para que la tabla
 * quede arriba sin scrollear cuatro selects. Ver la convención en index.css
 * ("Filtros plegables").
 *
 *   <FiltrosPlegables activos={n} onLimpiar={limpiar} data-tour="ventas-filtros">
 *     <div className="filter-group">…</div>
 *   </FiltrosPlegables>
 */
const FiltrosPlegables = ({
    children,
    activos = 0,
    onLimpiar,
    titulo = 'Filtros',
    className = 'filters-bar',
    defaultAbierto = false,
    'data-tour': dataTour,
}: FiltrosPlegablesProps) => {
    const [abierto, setAbierto] = useState(defaultAbierto);
    const cuerpoId = useId();

    return (
        <div className={`filtros-plegables ${abierto ? 'is-abierto' : ''}`}>
            <div className="filtros-plegables-barra">
                <button
                    type="button"
                    className="filtros-plegables-toggle"
                    aria-expanded={abierto}
                    aria-controls={cuerpoId}
                    onClick={() => setAbierto((a) => !a)}
                >
                    <SlidersHorizontal size={16} aria-hidden="true" />
                    {titulo}
                    {activos > 0 && (
                        <span className="filtros-plegables-cuenta">
                            {activos}
                            <span className="sr-only">{activos === 1 ? ' activo' : ' activos'}</span>
                        </span>
                    )}
                </button>
                {onLimpiar && activos > 0 && (
                    <button type="button" className="filtros-plegables-limpiar" onClick={onLimpiar}>
                        Limpiar filtros
                    </button>
                )}
            </div>
            <div id={cuerpoId} className={`filtros-plegables-cuerpo ${className}`} data-tour={dataTour}>
                {children}
            </div>
        </div>
    );
};

export default FiltrosPlegables;
