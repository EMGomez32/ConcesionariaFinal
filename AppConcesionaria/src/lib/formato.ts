/**
 * Formatos compartidos por las pantallas: fechas de día, montos que escribe el
 * usuario y links de WhatsApp. Mismo criterio que la web (`utils/fecha.ts` y
 * `utils/whatsapp.ts` de FrontConcesionaria).
 */

/**
 * dd/mm/aaaa de una columna `@db.Date` (fechaCreacion, validoHasta, fechaVenta…).
 * Llegan como medianoche UTC ("2026-10-07T00:00:00.000Z"): pasarlas por
 * `new Date().toLocaleDateString()` las baja a la hora local y en Argentina
 * (UTC-3) muestran el día anterior. Por eso se lee la parte de fecha como texto.
 */
export const fechaDia = (iso?: string | null): string => {
    if (!iso) return '';
    const [y, m, d] = iso.split('T')[0].split('-');
    return d && m && y ? `${d}/${m}/${y}` : iso;
};

/**
 * Formatea un monto MIENTRAS se escribe: deja solo dígitos y una coma decimal
 * (hasta 2 decimales) y agrupa los miles con punto. "1500000" → "1.500.000",
 * "1.500.000,5" → "1.500.000,5". El punto siempre es de miles, como en papel.
 */
export const formatMontoInput = (texto: string): string => {
    const limpio = texto.replace(/[^\d,]/g, '');
    const [entero, ...decimales] = limpio.split(',');
    const agrupado = entero.replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return decimales.length ? `${agrupado},${decimales.join('').slice(0, 2)}` : agrupado;
};

/**
 * Lee un monto escrito en formato argentino ("1.500.000", "12,5").
 * `null` si está vacío; `NaN` si no es un número (la pantalla no deja enviar).
 */
export const parseMonto = (texto: string): number | null => {
    const t = texto.trim();
    if (!t) return null;
    return Number(t.replace(/\./g, '').replace(',', '.'));
};

/** El texto de un campo de monto a partir de un número que vino de la API. */
export const montoATexto = (n: number | null | undefined): string =>
    n == null || !Number.isFinite(n) ? '' : formatMontoInput(String(n).replace('.', ','));

/**
 * Link de WhatsApp con el mensaje ya redactado (no envía nada: abre el chat).
 * Antepone el 54 si falta, como la web; sin un número usable (menos de 8
 * dígitos) abre WhatsApp para que el usuario elija el contacto.
 */
export const waLink = (telefono: string | null | undefined, mensaje: string): string => {
    const d = (telefono ?? '').replace(/\D/g, '');
    const texto = `text=${encodeURIComponent(mensaje)}`;
    if (d.length < 8) return `https://wa.me/?${texto}`;
    return `https://wa.me/${d.startsWith('54') ? d : `54${d}`}?${texto}`;
};

/** Link para COMPARTIR un mensaje por WhatsApp sin destinatario (el usuario elige el chat). */
export const waShareLink = (mensaje: string): string => waLink(null, mensaje);

/** Monto con su moneda: "US$22.300" / "$14.500.000". Sin monto, `vacio`. */
export const formatMoneda = (monto: number | string | null | undefined, moneda?: string | null, vacio = '—'): string => {
    const n = monto === null || monto === undefined || monto === '' ? NaN : Number(monto);
    if (!Number.isFinite(n)) return vacio;
    return `${moneda === 'USD' ? 'US$' : '$'}${n.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`;
};

/** Cantidad con el sustantivo bien flexionado: "1 atención", "3 atenciones". */
export const plural = (n: number, singular: string, enPlural: string): string =>
    `${n} ${n === 1 ? singular : enPlural}`;

const capitalizar = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ') : s);

/** Nombre legible de cada rol (en la base van en minúscula y con guion bajo). */
export const ROL_LABEL: Record<string, string> = {
    super_admin: 'Superadministrador',
    admin: 'Administrador',
    vendedor: 'Vendedor',
    tasador: 'Tasador',
    cobrador: 'Cobrador',
    postventa: 'Postventa',
    lectura: 'Solo lectura',
};
export const rolLegible = (rol: string): string => ROL_LABEL[rol] ?? capitalizar(rol);
export const rolesLegibles = (roles: string[]): string => roles.map(rolLegible).join(', ');

/** Método de un pago (enum MetodoPago del backend). */
export const METODO_PAGO_LABEL: Record<string, string> = {
    efectivo: 'Efectivo',
    transferencia: 'Transferencia',
    tarjeta: 'Tarjeta',
    cheque: 'Cheque',
    otro: 'Otro',
};
export const metodoPagoLegible = (metodo: string | null | undefined): string =>
    metodo ? (METODO_PAGO_LABEL[metodo] ?? capitalizar(metodo)) : 'Sin método';

/** Kilómetros con separador de miles: "45.000 km". */
export const formatKm = (km: number | string | null | undefined): string | null => {
    const n = km === null || km === undefined || km === '' ? NaN : Number(km);
    return Number.isFinite(n) ? `${n.toLocaleString('es-AR')} km` : null;
};

/**
 * Mensaje para ofrecer una unidad por WhatsApp. No lleva el dominio (la patente
 * no se publica) ni ningún dato de compra: lo mismo que se ve en el salón.
 */
export const mensajeUnidad = (v: {
    marca: string; modelo: string; version?: string | null; anio?: number | null;
    kmIngreso?: number | string | null; color?: string | null;
    precioLista?: number | string | null; moneda?: string | null;
}): string => {
    const titulo = [v.marca, v.modelo, v.version, v.anio].filter(Boolean).join(' ');
    const datos = [formatKm(v.kmIngreso), v.color].filter(Boolean).join(' · ');
    const precio = formatMoneda(v.precioLista, v.moneda, '');
    return [
        `¡Hola! Te paso esta unidad: ${titulo}.`,
        datos ? `${datos}.` : null,
        precio ? `Precio: ${precio}.` : 'Precio: consultanos.',
        '¿Te interesa? Escribime y coordinamos para que la veas.',
    ].filter(Boolean).join('\n');
};
