/**
 * Piezas PURAS del rastro de privacidad (sin base ni Express), para que se puedan
 * probar en el job de unit tests: el deduplicador de accesos de soporte, la extracción
 * de los tenants que aparecen en una respuesta y el enmascarado de filtros con PII.
 */

/**
 * "A lo sumo un registro por clave cada `ventanaMs`". Ventana FIJA desde el último
 * registro (no deslizante): si el soporte navega una ficha durante tres horas, quedan
 * seis registros de media hora, no uno solo al principio.
 */
export class Deduplicador {
    private readonly ultimo = new Map<string, number>();

    constructor(
        private readonly ventanaMs: number,
        private readonly maxClaves = 5_000,
        private readonly ahora: () => number = Date.now,
    ) { }

    /** true = hay que registrar (y queda anotado); false = ya se registró en la ventana. */
    debeRegistrar(clave: string): boolean {
        const t = this.ahora();
        const previo = this.ultimo.get(clave);
        if (previo !== undefined && t - previo < this.ventanaMs) return false;
        this.ultimo.set(clave, t);
        if (this.ultimo.size > this.maxClaves) {
            for (const [k, v] of this.ultimo) {
                if (t - v >= this.ventanaMs) this.ultimo.delete(k);
            }
            while (this.ultimo.size > this.maxClaves) {
                const primera = this.ultimo.keys().next().value;
                if (primera === undefined) break;
                this.ultimo.delete(primera);
            }
        }
        return true;
    }
}

/**
 * Concesionarias cuyos datos aparecen en el cuerpo de una respuesta. Mira el objeto de
 * arriba, las listas (`[...]`, `results`, `items`, `data`) y un nivel de anidamiento:
 * alcanza para fichas, listados paginados y detalles con relaciones, sin recorrer
 * respuestas enormes enteras (tope de filas por lista).
 */
export function tenantsEnRespuesta(body: unknown, maxFilas = 500): Set<number> {
    const tenants = new Set<number>();
    const visitar = (v: unknown, profundidad: number): void => {
        if (!v || typeof v !== 'object' || profundidad > 3) return;
        if (Array.isArray(v)) {
            for (const fila of v.slice(0, maxFilas)) visitar(fila, profundidad + 1);
            return;
        }
        const o = v as Record<string, unknown>;
        if (Number.isInteger(o.concesionariaId) && (o.concesionariaId as number) > 0) {
            tenants.add(o.concesionariaId as number);
        }
        for (const clave of ['results', 'items', 'data']) {
            if (Array.isArray(o[clave])) visitar(o[clave], profundidad + 1);
        }
    };
    visitar(body, 0);
    return tenants;
}

/**
 * Filtros de búsqueda que pueden ser datos personales (un DNI, un teléfono, un email
 * tipeado en el buscador). En el rastro de una exportación se deja constancia de QUE se
 * filtró por eso, no del valor: si no, la auditoría pasaría a ser otra copia de la PII.
 */
const FILTROS_CON_PII = new Set(['search', 'q', 'dni', 'telefono', 'email', 'nombre', 'apellido', 'cuit']);
/** Parámetros técnicos que no aportan nada al rastro. */
const FILTROS_IGNORADOS = new Set(['format', 'page', 'limit', 'sortBy', 'sortOrder', 'exp', 'sig']);

export function describirFiltros(query: Record<string, unknown>): string {
    const partes: string[] = [];
    for (const [k, v] of Object.entries(query ?? {})) {
        if (FILTROS_IGNORADOS.has(k) || v === undefined || v === '') continue;
        const valor = Array.isArray(v) ? v.join('|') : String(v);
        if (FILTROS_CON_PII.has(k)) partes.push(`${k}=[${valor.length} caracteres]`);
        else partes.push(`${k}=${valor.slice(0, 60)}`);
    }
    return partes.length ? partes.join(', ') : 'sin filtros';
}

/**
 * Exportaciones que llevan datos personales (de clientes o del equipo). Se marca en el
 * rastro para que el admin las encuentre sin abrir cada registro. Se compara contra el
 * comienzo del nombre del archivo que arma `sendCsv`.
 */
const EXPORTS_CON_PII = [
    'clientes', 'reporte-mora', 'reporte-proximos-vencimientos', 'reporte-ventas', 'postventa-casos',
    'reporte-postventa', 'audit-log', 'reporte-comisiones', 'reporte-ranking-vendedores',
];

export function exportConDatosPersonales(nombreArchivo: string): boolean {
    return EXPORTS_CON_PII.some((p) => nombreArchivo.startsWith(p));
}
