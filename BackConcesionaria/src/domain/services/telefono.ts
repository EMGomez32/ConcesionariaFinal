/**
 * Normalización de teléfonos ARGENTINOS — módulo PURO (sin prisma, sin env, sin
 * I/O) para que sus tests corran sin base.
 *
 * POR QUÉ EXISTE: el mismo número llega escrito distinto según la puerta por la
 * que entra. Meta manda "+54 9 261 555-1234", Mercado Libre "5492615551234", el
 * vendedor en el mostrador tipea "2615551234" y la casilla de DeRuedas trae
 * "0261 15 555-1234". Comparando el texto tal cual, esas cuatro son cuatro
 * personas distintas y el CRM termina con cuatro fichas del mismo interesado.
 * El dedupe compara la forma CANÓNICA que devuelve este módulo, no el texto.
 *
 * QUÉ DEVUELVE: el NÚMERO NACIONAL SIGNIFICATIVO (NSN) argentino — código de
 * área + abonado, SIEMPRE 10 dígitos — sin país, sin el 0 de larga distancia y
 * sin el 15 de celular. Es la forma que identifica la línea sin importar desde
 * dónde se la disque.
 *
 * REGLAS, en el orden en que se aplican:
 *   1. Se queda con los DÍGITOS. Espacios, guiones, puntos, paréntesis, barras y
 *      el "+" se descartan:      "(0261) 15 555-1234" → "0261155551234"
 *   2. "00" inicial (prefijo de salida internacional) → fuera: "0054…" → "54…"
 *   3. "54" inicial (código de país) → fuera, PERO sólo si quedan más de 10
 *      dígitos. El corte por largo protege a un NSN de 10 que empiece con 54
 *      (no hay áreas argentinas que arranquen con 5, pero la guarda es gratis).
 *   4. "9" inicial (marca de celular del formato internacional +54 9 …) → fuera,
 *      sólo con largo 11 (9 + NSN) o 13 (9 + NSN + un 15 redundante).
 *   5. "0" inicial (larga distancia nacional, 0261 …) → fuera, mismos largos.
 *   6. "15" (marca de celular del formato nacional) → fuera. Va PEGADO al código
 *      de área y el área mide 2, 3 o 4 dígitos (11 / 261 / 2966), así que se lo
 *      busca en las posiciones 2, 3 y 4 y se saca el primero que aparezca. Sólo
 *      se intenta con largo 12, que es exactamente NSN(10) + los dos dígitos
 *      del 15: así un fijo de 10 dígitos nunca se toca aunque contenga "15".
 *   7. Lo que queda son 10 dígitos: área + abonado. Esa es la forma canónica.
 *
 * POR ESO son el MISMO número:
 *   "+54 9 261 555-1234" · "+5492615551234" · "0261 15 555-1234" ·
 *   "(0261) 15-5551234"  · "261 555 1234"   · "2615551234"       → "2615551234"
 *   El 9 internacional y el 15 nacional son la MISMA marca de celular escrita
 *   según desde dónde se llame; el 0 sólo hace falta para discar de otra área.
 *   Ninguno de los tres pertenece al número: son prefijos de discado.
 *
 * Y NO son el mismo:
 *   "2615551234" vs "3415551234"  → distinta área (Mendoza / Rosario)
 *   "2615551234" vs "2615551235"  → distinto abonado
 *   "2615551234" vs "5551234"     → el segundo no trae área y NO se puede
 *                                   inventar: la concesionaria no tiene su área
 *                                   guardada en ningún lado. Ver LIMITACIONES.
 *
 * LIMITACIONES CONOCIDAS (a propósito, para no fabricar falsos positivos):
 *   - Un número local sin área ("555-1234") o con 15 pero sin área
 *     ("15 555-1234") NO matchea contra su forma completa. Adivinar el área
 *     fusionaría fichas de dos personas distintas, que es peor que duplicar.
 *   - Números de OTROS países se limpian pero no se interpretan: se comparan
 *     por sus dígitos. Dos escrituras iguales matchean, dos distintas no.
 */

/** Largo del sufijo que se usa para acotar candidatos en la base (ver dedupeContacto). */
export const LARGO_SUFIJO_TELEFONO = 4;

/**
 * Mínimo de dígitos para considerar que hay un teléfono. El abonado argentino
 * más corto tiene 6 dígitos; por debajo de eso es un interno, un "0", un "15"
 * suelto o basura, y deduplicar con eso fusionaría clientes que no tienen nada
 * que ver.
 */
const LARGO_MINIMO = 6;

/** Largo del número nacional significativo argentino: área + abonado. */
const LARGO_NSN = 10;

/** Deja sólo los dígitos: se van "+", espacios, guiones, puntos y paréntesis. */
export const soloDigitos = (valor?: string | null): string => (valor ?? '').replace(/\D+/g, '');

/**
 * Saca el "15" de celular del formato nacional de un string de 12 dígitos
 * (área + 15 + abonado). El área mide 2, 3 o 4 dígitos, así que el 15 arranca
 * en la posición 2, 3 o 4: se toma la primera que matchee.
 *   "1115"41234567 → 11 + 41234567   (área 11,   Buenos Aires)
 *   261"15"5551234 → 261 + 5551234   (área 261,  Mendoza)
 *   2966"15"421234 → 2966 + 421234   (área 2966, Río Gallegos)
 */
const sacarQuince = (digitos: string): string => {
    for (const i of [2, 3, 4]) {
        if (digitos.slice(i, i + 2) === '15') return digitos.slice(0, i) + digitos.slice(i + 2);
    }
    return digitos;
};

/**
 * Forma canónica comparable de un teléfono, o null si no hay número suficiente.
 * Ver el bloque de arriba para las reglas y los ejemplos.
 */
export function normalizarTelefono(valor?: string | null): string | null {
    let d = soloDigitos(valor);
    if (!d) return null;

    if (d.startsWith('00')) d = d.slice(2);
    if (d.length > LARGO_NSN && d.startsWith('54')) d = d.slice(2);
    if ((d.length === 11 || d.length === 13) && d.startsWith('9')) d = d.slice(1);
    if ((d.length === 11 || d.length === 13) && d.startsWith('0')) d = d.slice(1);
    if (d.length === 12) d = sacarQuince(d);

    // Con menos de LARGO_MINIMO no se deduplica: devolver "0" o "15" como forma
    // canónica haría matchear entre sí a todos los que tengan basura cargada.
    return d.length >= LARGO_MINIMO ? d : null;
}

/**
 * ¿Los dos textos son el mismo teléfono? Dos números no normalizables (basura,
 * "s/d", un interno) NO matchean acá: eso lo resuelve el criterio literal del
 * dedupe, que es lo que se venía haciendo. Ver dedupeContacto.mismoTelefonoOLiteral.
 */
export function mismoTelefono(a?: string | null, b?: string | null): boolean {
    const na = normalizarTelefono(a);
    const nb = normalizarTelefono(b);
    return na !== null && na === nb;
}

/**
 * Últimos dígitos de la forma canónica, para acotar la búsqueda de candidatos en
 * la base con un LIKE '%1234%' antes de comparar en memoria.
 *
 * POR QUÉ LOS ÚLTIMOS: los separadores que mete la gente caen entre el área y el
 * abonado o dentro del abonado ("261 555-1234", "(261) 555 1234", "261.555.1234"),
 * pero los últimos 4 dígitos quedan pegados en todas las escrituras reales. Son
 * además la parte más discriminante: acotan ~1 de cada 10.000 fichas.
 */
export function sufijoTelefono(valor?: string | null): string | null {
    const canonico = normalizarTelefono(valor);
    return canonico ? canonico.slice(-LARGO_SUFIJO_TELEFONO) : null;
}
