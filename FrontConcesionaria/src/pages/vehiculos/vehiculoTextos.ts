import type { EstadoVehiculo, TipoVehiculo, Vehiculo } from '../../types/vehiculo.types';
import type { BadgeVariant } from '../../components/ui/Badge';

/** Estados del vehículo como los lee una persona (nunca el valor crudo de la base). */
export const ESTADO_VEHICULO: Record<EstadoVehiculo, { label: string; variant: BadgeVariant }> = {
    preparacion: { label: 'En preparación', variant: 'warning' },
    publicado: { label: 'Publicado', variant: 'success' },
    reservado: { label: 'Reservado', variant: 'info' },
    vendido: { label: 'Vendido', variant: 'default' },
    devuelto: { label: 'Devuelto', variant: 'danger' },
};

export const estadoVehiculoLabel = (estado?: string | null): string =>
    (estado && ESTADO_VEHICULO[estado as EstadoVehiculo]?.label) || 'Sin estado';

/** Transiciones de estado permitidas desde el listado. */
export const NEXT_ESTADOS: Record<EstadoVehiculo, EstadoVehiculo[]> = {
    preparacion: ['publicado'],
    publicado: ['preparacion', 'reservado'],
    reservado: ['publicado', 'vendido'],
    vendido: ['devuelto'],
    devuelto: ['preparacion', 'publicado'],
};

/**
 * Qué cuenta como "en stock": la unidad está en la concesionaria (en
 * preparación, publicada o reservada). La usan el listado de Vehículos (filtro
 * por defecto) y el Inicio ("Vehículos en stock" y "Distribución de stock"), para
 * que los dos números digan lo mismo.
 */
export const EN_STOCK: EstadoVehiculo[] = ['preparacion', 'publicado', 'reservado'];

/** Días desde el ingreso a stock (fechaIngreso llega como ISO/'YYYY-MM-DD'). */
export const diasEnStock = (fechaIngreso: string, ahora: number = Date.now()): number => {
    const ingreso = new Date(fechaIngreso);
    if (isNaN(ingreso.getTime())) return 0;
    return Math.max(0, Math.floor((ahora - ingreso.getTime()) / 86400000));
};

/** Color según antigüedad: verde fresco → rojo estancado. */
export const antiguedadVariant = (dias: number): 'success' | 'info' | 'warning' | 'danger' =>
    dias > 90 ? 'danger' : dias > 60 ? 'warning' : dias > 30 ? 'info' : 'success';

/** "61.000 km" (es-AR). Un 0 km sin kilometraje cargado se muestra "0 km"; un usado sin dato, nada. */
export const formatKm = (km?: number | null, tipo?: TipoVehiculo): string | null => {
    if (km == null || Number.isNaN(Number(km))) return tipo === 'CERO_KM' ? '0 km' : null;
    return `${Number(km).toLocaleString('es-AR')} km`;
};

/**
 * Segunda línea de una unidad: "AB123CD · XEI 2.0". Sólo junta lo que
 * existe, así no queda un guion colgando cuando falta la versión.
 */
export const descripcionVehiculo = (v: Pick<Vehiculo, 'dominio' | 'version'>): string =>
    [v.dominio || 'Sin dominio', v.version]
        .filter((p): p is string => !!p && p.trim() !== '')
        .join(' · ');
