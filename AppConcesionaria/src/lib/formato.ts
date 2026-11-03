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
