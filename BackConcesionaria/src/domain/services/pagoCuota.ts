/**
 * Lógica PURA del cobro de una cuota: validación de negocio + cálculo del nuevo
 * saldo/estado. Sin I/O ni dependencias de infraestructura, para poder testearla
 * con unit tests (la matemática de dinero no debería depender de la DB).
 *
 * El use-case RegistrarPagoCuota lee la cuota BAJO LOCK (SELECT ... FOR UPDATE) y
 * pasa el saldo/estado reales acá: como está lockeada, el saldo es autoritativo y
 * el nuevo estado se deriva sin riesgo de carrera.
 */

// Estados de cuota que admiten cobro. 'pagada' (saldo 0) o 'refinanciada' (deuda
// ya trasladada a otro contrato) NO se cobran.
export const CUOTA_COBRABLE = ['pendiente', 'parcial', 'vencida'] as const;

// Las columnas de dinero son Decimal(12,2): se redondea a centavos para que lo
// validado y comparado sea EXACTAMENTE lo que se persiste.
export const aCentavos = (n: number): number => Math.round(n * 100) / 100;

export type EvaluacionPago =
    | { ok: false; status: number; code: string; message: string }
    | { ok: true; monto: number; nuevoSaldo: number; nuevoEstado: 'pagada' | 'parcial'; saldada: boolean };

export function evaluarPagoCuota(input: {
    estado: string;
    saldoCuota: number;
    monto: number;
}): EvaluacionPago {
    if (!(CUOTA_COBRABLE as readonly string[]).includes(input.estado)) {
        return { ok: false, status: 422, code: 'CUOTA_NO_COBRABLE', message: `La cuota no admite cobros (estado: ${input.estado})` };
    }

    const saldo = aCentavos(Number(input.saldoCuota));
    if (!(saldo > 0)) {
        return { ok: false, status: 422, code: 'CUOTA_SALDADA', message: 'La cuota ya está saldada' };
    }

    const monto = aCentavos(Number(input.monto));
    if (!(monto > 0)) {
        return { ok: false, status: 400, code: 'VALIDATION_ERROR', message: 'El importe del pago debe ser mayor a 0' };
    }
    if (monto > saldo) {
        return { ok: false, status: 422, code: 'MONTO_EXCEDE_SALDO', message: 'El importe no puede superar el saldo de la cuota' };
    }

    const saldada = monto >= saldo;
    return {
        ok: true,
        monto,
        nuevoSaldo: saldada ? 0 : aCentavos(saldo - monto),
        nuevoEstado: saldada ? 'pagada' : 'parcial',
        saldada,
    };
}
