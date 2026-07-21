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
