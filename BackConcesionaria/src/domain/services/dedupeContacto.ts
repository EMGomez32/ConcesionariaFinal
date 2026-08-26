import { mismoTelefono, normalizarTelefono } from './telefono';

/**
 * Resolución del dedupe de clientes — módulo PURO (sin prisma, sin env).
 *
 * POR QUÉ ACÁ Y NO EN consultaIngest: el criterio de aceptación 2 ("un cliente
 * que ya consultó por redes NO se duplica al venir presencialmente") vive en el
 * ORDEN DE PRIORIDAD y en la comparación de cada campo. Eso tiene que poder
 * testearse sin base — y `consultaIngest` importa prisma, que en el job de unit
 * tests arrastra la validación de env y mata el proceso en el import.
 * Así, la infraestructura sólo TRAE candidatos; quién gana se decide acá.
 *
 * PRIORIDAD: TELÉFONO → DNI → EMAIL. El primero que matchea gana y no se sigue
 * mirando (no se mezclan criterios). Dentro de un mismo criterio gana el cliente
 * de menor id, que es la ficha más vieja: el mismo desempate que tenía el
 * `orderBy: { id: 'asc' }` del dedupe anterior.
 *
 * POR QUÉ ESE ORDEN: el teléfono es el único dato que están OBLIGADOS a dar los
 * cuatro canales de ingesta y el mostrador (la apertura de atención pide nombre
 * y teléfono), así que es el que más veces identifica. El DNI es el más fuerte
 * cuando está, pero aparece recién en el enriquecimiento. El email es el más
 * flojo: se comparte entre familiares y se tipea mal.
 */

export type CampoDedupe = 'telefono' | 'dni' | 'email';

/** El orden es el criterio: NO reordenar sin cambiar el encargo. */
export const PRIORIDAD_DEDUPE: readonly CampoDedupe[] = ['telefono', 'dni', 'email'] as const;

export interface ContactoDedupe {
    telefono?: string | null;
    dni?: string | null;
    email?: string | null;
}

/** Lo mínimo que necesita saberse de un candidato traído de la base. */
export interface CandidatoDedupe extends ContactoDedupe {
    id: number;
}

export interface MatchDedupe<T extends CandidatoDedupe> {
    cliente: T;
    /** Por qué campo matcheó. Sirve para loguear y para el aviso de la pantalla. */
    campo: CampoDedupe;
}

/**
 * DNI comparable: sólo dígitos y sin ceros a la izquierda, así "30.123.456",
 * "30 123 456" y "30123456" son el mismo documento, y el "07.123.456" que
 * escribió alguien padeando a 8 dígitos matchea con "7123456".
 *
 * OJO: un CUIT ("20-30123456-9" → 11 dígitos) NO matchea con el DNI que lleva
 * adentro, y está bien: son campos distintos y recortar el CUIT a mano para
 * compararlo fusionaría un monotributista con otra persona en los pocos casos
 * en que el prefijo no fuera el esperado.
 */
export function normalizarDni(valor?: string | null): string | null {
    const digitos = (valor ?? '').replace(/\D+/g, '').replace(/^0+/, '');
    // Un documento argentino tiene 7 u 8 dígitos (los viejos, 6). Menos que eso
    // es basura y no se deduplica con basura.
    return digitos.length >= 6 ? digitos : null;
}

/** Email comparable: trim + minúsculas, lo mismo que ya hacía la ingesta. */
export function normalizarEmail(valor?: string | null): string | null {
    return valor?.trim().toLowerCase() || null;
}

/**
 * Escrituras plausibles de un DNI, para poder BUSCARLO en la base sin una
 * columna normalizada (el `@@index([dni])` de clientes es sobre el texto tal
 * cual se guardó). Cubre lo que se ve en la práctica: pelado, con puntos y con
 * espacios, más la variante padeada a 8 dígitos con el cero adelante.
 *   "30123456" → ["30123456", "30.123.456", "30 123 456"]
 *   "7123456"  → ["7123456", "7.123.456", "7 123 456", "07123456", ...]
 */
export function variantesDni(dniNormalizado: string): string[] {
    const conSeparador = (sep: string): string => {
        const grupos: string[] = [];
        for (let fin = dniNormalizado.length; fin > 0; fin -= 3) {
            grupos.unshift(dniNormalizado.slice(Math.max(0, fin - 3), fin));
        }
        return grupos.join(sep);
    };
    const base = [dniNormalizado, conSeparador('.'), conSeparador(' ')];
    // El padeo a 8 dígitos es la otra forma en que aparece un documento viejo.
    if (dniNormalizado.length === 7) {
        const padeado = `0${dniNormalizado}`;
        base.push(padeado, `${padeado.slice(0, 2)}.${padeado.slice(2, 5)}.${padeado.slice(5)}`);
    }
    return [...new Set(base)];
}

/**
 * ¿Mismo teléfono? Con la forma canónica cuando los dos lados son un número
 * argentino reconocible; si NINGUNO de los dos lo es (un interno, un "s/d", el
 * texto que dejó una importación vieja), se cae a la igualdad literal, que es
 * exactamente el criterio que tenía el dedupe antes de este módulo: no se pierde
 * ningún match que hoy funcione.
 *
 * Un número reconocible NUNCA matchea contra basura, aunque el texto coincida.
 */
export function mismoTelefonoOLiteral(a?: string | null, b?: string | null): boolean {
    const na = normalizarTelefono(a);
    const nb = normalizarTelefono(b);
    if (na || nb) return mismoTelefono(a, b);
    const la = a?.trim();
    return !!la && la === b?.trim();
}

const COMPARADORES: Record<CampoDedupe, (a?: string | null, b?: string | null) => boolean> = {
    telefono: mismoTelefonoOLiteral,
    dni: (a, b) => {
        const na = normalizarDni(a);
        return na !== null && na === normalizarDni(b);
    },
    email: (a, b) => {
        const na = normalizarEmail(a);
        return na !== null && na === normalizarEmail(b);
    },
};

/**
 * Elige el cliente que corresponde al contacto buscado entre los candidatos ya
 * traídos de la base, aplicando TELÉFONO → DNI → EMAIL y, dentro de cada
 * criterio, el id más chico (la ficha más vieja).
 *
 * Los candidatos NO tienen por qué venir filtrados ni ordenados: acá se resuelve
 * todo. Devuelve null si ninguno matchea.
 */
export function elegirPorPrioridad<T extends CandidatoDedupe>(
    buscado: ContactoDedupe,
    candidatos: readonly T[],
): MatchDedupe<T> | null {
    for (const campo of PRIORIDAD_DEDUPE) {
        const buscadoEnCampo = buscado[campo];
        if (!buscadoEnCampo?.trim()) continue;
        const comparar = COMPARADORES[campo];
        let ganador: T | null = null;
        for (const candidato of candidatos) {
            if (!comparar(buscadoEnCampo, candidato[campo])) continue;
            if (ganador === null || candidato.id < ganador.id) ganador = candidato;
        }
        if (ganador) return { cliente: ganador, campo };
    }
    return null;
}
