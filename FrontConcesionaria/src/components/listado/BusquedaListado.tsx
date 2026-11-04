import { Search, X } from 'lucide-react';

interface BusquedaListadoProps {
    valor: string;
    onChange: (valor: string) => void;
    placeholder?: string;
    /** Nombre accesible del campo (por defecto, el placeholder). */
    etiqueta?: string;
}

/** Caja de búsqueda de `<Listado>`: siempre visible, con botón para borrar. */
const BusquedaListado = ({ valor, onChange, placeholder = 'Buscar…', etiqueta }: BusquedaListadoProps) => (
    <div className="search-box listado-search">
        <Search size={16} className="text-muted" aria-hidden="true" />
        <input
            type="search"
            value={valor}
            placeholder={placeholder}
            aria-label={etiqueta ?? placeholder}
            onChange={(e) => onChange(e.target.value)}
        />
        {valor && (
            <button type="button" className="listado-search-borrar" onClick={() => onChange('')} aria-label="Borrar búsqueda">
                <X size={14} aria-hidden="true" />
            </button>
        )}
    </div>
);

export default BusquedaListado;
