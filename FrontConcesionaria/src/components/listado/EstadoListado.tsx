import type { ReactNode } from 'react';
import { AlertTriangle, Inbox, SearchX } from 'lucide-react';
import './listado.css';

export type EstadoListadoProps =
    | {
        /** Falló la consulta: no es lo mismo que "no hay datos". */
        tipo: 'error';
        mensaje?: string;
        onReintentar?: () => void;
    }
    | {
        /** Hay filtros o búsqueda aplicados y no devuelven nada. */
        tipo: 'sin-resultados';
        onLimpiarFiltros?: () => void;
    }
    | {
        /** Todavía no hay nada cargado: se explica y se ofrece la acción para empezar. */
        tipo: 'vacio';
        titulo: string;
        descripcion?: ReactNode;
        accion?: ReactNode;
        icono?: ReactNode;
    };

/**
 * Los tres estados de un listado sin filas. Lo usa `<ListadoTabla>` y también
 * las páginas que muestran tarjetas en vez de tabla (p.ej. Tasaciones).
 */
const EstadoListado = (props: EstadoListadoProps) => {
    if (props.tipo === 'error') {
        return (
            <div className="listado-estado" role="alert">
                <span className="listado-estado-icono is-error"><AlertTriangle size={32} aria-hidden="true" /></span>
                <p className="listado-estado-titulo">{props.mensaje ?? 'No se pudieron cargar los datos'}</p>
                <p className="listado-estado-texto">
                    Es un problema al consultar el servidor, no que falten datos. Probá de nuevo en unos segundos.
                </p>
                {props.onReintentar && (
                    <button type="button" className="btn btn-secondary btn-sm" onClick={props.onReintentar}>
                        Reintentar
                    </button>
                )}
            </div>
        );
    }

    if (props.tipo === 'sin-resultados') {
        return (
            <div className="listado-estado" role="status">
                <span className="listado-estado-icono"><SearchX size={32} aria-hidden="true" /></span>
                <p className="listado-estado-titulo">Ningún resultado con estos filtros</p>
                <p className="listado-estado-texto">Probá con otra búsqueda o sacá algún filtro.</p>
                {props.onLimpiarFiltros && (
                    <button type="button" className="btn btn-secondary btn-sm" onClick={props.onLimpiarFiltros}>
                        Limpiar filtros
                    </button>
                )}
            </div>
        );
    }

    return (
        <div className="listado-estado" role="status">
            <span className="listado-estado-icono">{props.icono ?? <Inbox size={32} aria-hidden="true" />}</span>
            <p className="listado-estado-titulo">{props.titulo}</p>
            {props.descripcion && <p className="listado-estado-texto">{props.descripcion}</p>}
            {props.accion}
        </div>
    );
};

export default EstadoListado;
