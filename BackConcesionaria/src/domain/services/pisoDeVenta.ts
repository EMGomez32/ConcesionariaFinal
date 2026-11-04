/**
 * PISO DE VENTA (PROC-34): el circuito del precio mínimo controlaba quién VE el
 * piso, no a cuánto se VENDE. CreateVenta (y ConvertPresupuestoToVenta, que pasa
 * por ahí) aceptaban cualquier `precioVenta`, así que el vendedor podía cerrar por
 * debajo del mínimo sin pedir nada.
 *
 * La regla, para una unidad con `precioMinimo` cargado en la ficha:
 *   - Por encima o igual al piso (misma moneda): pasa, como siempre.
 *   - Por debajo, o en OTRA moneda (no hay contra qué comparar sin inventar una
 *     cotización): el admin pasa por su rol; cualquier otro necesita una
 *     autorización de precio mínimo VIGENTE, suya, para esa unidad
 *     (precioAutorizacion.ts). Con la autorización, el piso que vale es el
 *     autorizado (el admin puede autorizar uno puntual para ESTE negocio): vender
 *     por debajo de ESE tampoco se puede.
 *   - Sin piso cargado no hay nada que controlar.
 *
 * `bajoPiso` marca la venta que quedó por debajo del piso de la ficha (misma
 * moneda): es el dato del reporte de descuentos. Lo que no se pudo comparar va
 * a la auditoría (`comparable: false`), no a la marca.
 *
 * Los mensajes NO dicen el valor del piso: es el dato que el vendedor no ve.
 */
export interface DatosPisoDeVenta {
    precioVenta: number;
    monedaVenta: string;
    /** `Vehiculo.precioMinimo`; null = sin piso. */
    pisoFicha: number | null;
    monedaUnidad: string;
    esAdmin: boolean;
    /** Autorización vigente del actor para la unidad, si la hay. */
    autorizacion: { solicitudId: number | null; precio: number; moneda: string } | null;
}

export type ViaPiso = 'sin_piso' | 'sobre_piso' | 'admin' | 'autorizacion';

export type ResultadoPisoDeVenta =
    | { ok: true; bajoPiso: boolean; via: ViaPiso; comparable: boolean }
    | { ok: false; message: string };

export function evaluarPisoDeVenta(d: DatosPisoDeVenta): ResultadoPisoDeVenta {
    if (d.pisoFicha === null || !Number.isFinite(d.pisoFicha)) {
        return { ok: true, bajoPiso: false, via: 'sin_piso', comparable: true };
    }
    const comparable = d.monedaVenta === d.monedaUnidad;
    const debajo = comparable && d.precioVenta < d.pisoFicha;
    if (comparable && !debajo) return { ok: true, bajoPiso: false, via: 'sobre_piso', comparable };

    if (d.esAdmin) return { ok: true, bajoPiso: debajo, via: 'admin', comparable };

    if (!d.autorizacion) {
        return {
            ok: false,
            message: comparable
                ? 'El precio de venta está por debajo del precio mínimo de esta unidad. Pedí la autorización del precio mínimo, o que la venta la registre un administrador.'
                : 'La venta va en otra moneda que la unidad y no se puede comparar con su precio mínimo. Pedí la autorización del precio mínimo, o que la venta la registre un administrador.',
        };
    }
    if (d.autorizacion.moneda === d.monedaVenta && d.precioVenta < d.autorizacion.precio) {
        return {
            ok: false,
            message: 'El precio de venta está por debajo incluso del precio mínimo que te autorizaron para esta unidad. Pedí una nueva autorización.',
        };
    }
    return { ok: true, bajoPiso: debajo, via: 'autorizacion', comparable };
}
