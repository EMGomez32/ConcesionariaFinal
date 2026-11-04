/**
 * ¿Qué impide ANULAR una venta? (PROC-30)
 *
 * Anular es la maniobra típica para tapar un desvío: se borra la venta y queda
 * un cobro, un contrato o una factura colgando de una operación que "no existió".
 * Por eso la anulación no limpia nada por su cuenta: exige que cada cosa con plata
 * o con efecto fiscal se revierta ANTES, por su propio camino (que es de admin y
 * deja su propio rastro), y recién ahí deja anular. Así cada reversa queda
 * auditada por separado y nadie hace desaparecer tres cosas con un solo click.
 *
 * Qué bloquea:
 *   - Pagos de la venta (VentaPago) sin quitar: es plata cobrada. Se quitan desde
 *     los pagos de la venta (DELETE /ventas/:id/pagos/:pagoId, admin).
 *   - Financiación viva (activa o en mora): quedaría un contrato generando cuotas
 *     y mora sobre una venta anulada.
 *   - Financiación con cobros de cuota registrados, en CUALQUIER estado (una
 *     cancelada o refinanciada también): son cuotas cobradas. Se anula el contrato
 *     (DELETE /financiaciones/:id, admin) y los cobros quedan en su historial.
 *   - Factura informada a AFIP (entorno real, emitida o en curso): no se borra,
 *     se compensa con una nota de crédito. En modo `mock` el CAE es simulado y no
 *     hay nada fiscal que revertir, así que no bloquea.
 *
 * Función PURA: el caso de uso junta los datos bajo lock y decide con esto.
 */

export interface DatosParaAnular {
    ventaId: number;
    /** Pagos de la venta NO borrados. */
    pagos: ReadonlyArray<{ id: number }>;
    /** Financiaciones de la venta NO borradas, con la cantidad de cobros de cuota vigentes. */
    financiaciones: ReadonlyArray<{ id: number; estado: string; cobros: number }>;
    /** Comprobante AFIP NO borrado de la venta, si hay. */
    comprobante: {
        id: number;
        tipoComprobante: string;
        puntoVenta: number;
        numero: number;
        entorno: string;
        estado: string;
    } | null;
}

export interface BloqueoAnulacion {
    tipo: 'pagos' | 'financiacion' | 'comprobante_afip';
    /** Ids de lo que hay que revertir (pagos, contrato o comprobante). */
    ids: number[];
    /** Qué hay que hacer, para mostrarle al usuario tal cual. */
    mensaje: string;
}

/** Estados de una financiación que siguen generando deuda. */
const FINANCIACION_VIVA = new Set(['activa', 'en_mora']);
/** Un comprobante así ya llegó (o está llegando) a AFIP. `error` no tiene CAE. */
const COMPROBANTE_INFORMADO = new Set(['emitida', 'pendiente']);

const plural = (n: number, uno: string, varios: string) => (n === 1 ? uno : varios);

/** Mismo formato de número que muestra el front (N° 000012). */
export const nroOperacion = (id: number) => String(id).padStart(6, '0');

const ESTADO_LEGIBLE: Record<string, string> = {
    activa: 'activa',
    en_mora: 'en mora',
    cancelada: 'cancelada',
    refinanciada: 'refinanciada',
};

export function bloqueosDeAnulacion(datos: DatosParaAnular): BloqueoAnulacion[] {
    const bloqueos: BloqueoAnulacion[] = [];

    if (datos.pagos.length > 0) {
        const ids = datos.pagos.map((p) => p.id);
        bloqueos.push({
            tipo: 'pagos',
            ids,
            mensaje: `tiene ${ids.length} ${plural(ids.length, 'pago registrado', 'pagos registrados')}: `
                + `${plural(ids.length, 'quitalo', 'quitalos')} desde los pagos de la venta`,
        });
    }

    for (const f of datos.financiaciones) {
        const viva = FINANCIACION_VIVA.has(f.estado);
        if (!viva && f.cobros <= 0) continue;
        const porque = [
            viva ? `está ${ESTADO_LEGIBLE[f.estado] ?? f.estado}` : null,
            f.cobros > 0 ? `tiene ${f.cobros} ${plural(f.cobros, 'cuota cobrada', 'cuotas cobradas')}` : null,
        ].filter(Boolean).join(' y ');
        bloqueos.push({
            tipo: 'financiacion',
            ids: [f.id],
            mensaje: `la financiación N° ${nroOperacion(f.id)} ${porque}: anulá ese contrato primero`,
        });
    }

    const c = datos.comprobante;
    if (c && c.entorno !== 'mock' && COMPROBANTE_INFORMADO.has(c.estado)) {
        const nro = `${String(c.puntoVenta).padStart(4, '0')}-${String(c.numero).padStart(8, '0')}`;
        bloqueos.push({
            tipo: 'comprobante_afip',
            ids: [c.id],
            mensaje: `la factura ${c.tipoComprobante.replace('factura_', '').toUpperCase()} ${nro} ya se informó a AFIP: `
                + 'una factura no se borra, se compensa con una nota de crédito (todavía no disponible en el sistema)',
        });
    }

    return bloqueos;
}

/** El mensaje completo del error, con todo lo que hay que revertir de una vez. */
export function mensajeDeBloqueo(ventaId: number, bloqueos: ReadonlyArray<BloqueoAnulacion>): string {
    return `No se puede anular la venta N° ${nroOperacion(ventaId)} todavía: ${bloqueos.map((b) => b.mensaje).join('; ')}.`;
}
