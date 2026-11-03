import type { ReactNode } from 'react';

interface CampoFiltroProps {
    /** Rótulo visible del filtro ("Estado", "Sucursal"…). */
    etiqueta: string;
    /** El control: un `<select>`, `<input>`, etc. El `<label>` lo envuelve y queda asociado. */
    children: ReactNode;
}

/** Un filtro con su rótulo, para el panel de filtros de `<Listado>`. */
const CampoFiltro = ({ etiqueta, children }: CampoFiltroProps) => (
    <label className="filter-group listado-campo">
        <span className="filter-label">{etiqueta}</span>
        {children}
    </label>
);

export default CampoFiltro;
