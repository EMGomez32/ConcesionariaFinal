/**
 * Tipos de proveedor. Se definen en un solo lugar porque los consumen el
 * formulario de alta, el filtro de la lista, los colores de la ficha y el
 * selector de destino de Movimientos: tenerlos duplicados los desincroniza.
 */
export interface TipoProveedor {
    value: string;
    label: string;
    /** true si es un lugar al que se puede enviar una unidad a preparación. */
    esDestinoDePreparacion: boolean;
}

export const TIPOS_PROVEEDOR: TipoProveedor[] = [
    { value: 'mecanico', label: 'Mecánico', esDestinoDePreparacion: true },
    { value: 'taller', label: 'Taller', esDestinoDePreparacion: true },
    { value: 'chapa_pintura', label: 'Chapa y pintura', esDestinoDePreparacion: true },
    { value: 'lavadero', label: 'Lavadero', esDestinoDePreparacion: true },
    { value: 'electricista', label: 'Electricista', esDestinoDePreparacion: true },
    { value: 'gomeria', label: 'Gomería', esDestinoDePreparacion: true },
    { value: 'importadora', label: 'Importadora', esDestinoDePreparacion: false },
    { value: 'particular', label: 'Particular', esDestinoDePreparacion: false },
    { value: 'financiera', label: 'Financiera', esDestinoDePreparacion: false },
    { value: 'otro', label: 'Otro', esDestinoDePreparacion: true },
];

/** Tipos a los que se puede mandar un auto (excluye importadora/financiera/particular). */
export const TIPOS_DESTINO_PREPARACION = TIPOS_PROVEEDOR
    .filter(t => t.esDestinoDePreparacion)
    .map(t => t.value);

export const labelTipoProveedor = (value?: string | null): string =>
    TIPOS_PROVEEDOR.find(t => t.value === value)?.label ?? (value || '-');
