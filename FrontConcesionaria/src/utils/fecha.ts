/**
 * Formatea una fecha que viene del backend como dd/mm/aaaa.
 *
 * Las columnas `@db.Date` de Prisma (fecha de gasto, de reserva, etc.) se
 * serializan a medianoche UTC ("2026-07-16T00:00:00.000Z"). Usar
 * `new Date(valor).toLocaleDateString()` las interpreta como un instante UTC y
 * las baja a la hora local, con lo que en zonas horarias negativas (Argentina
 * es UTC-3) muestran el día anterior. Por eso parseamos la parte de fecha del
 * ISO como texto, sin convertir de zona.
 */
export const formatFecha = (value?: string | null): string => {
    if (!value) return '-';
    const [y, m, d] = value.split('T')[0].split('-');
    return d && m && y ? `${d}/${m}/${y}` : value;
};

/**
 * La fecha de hoy como "aaaa-mm-dd" en la hora LOCAL, para el valor por defecto
 * de un `<input type="date">`. `new Date().toISOString().slice(0, 10)` da la
 * fecha en UTC: en Argentina, después de las 21 h ya es "mañana".
 */
export const hoyLocal = (ahora: Date = new Date()): string => {
    const dos = (n: number) => String(n).padStart(2, '0');
    return `${ahora.getFullYear()}-${dos(ahora.getMonth() + 1)}-${dos(ahora.getDate())}`;
};
