import { IFinanciacionRepository } from '../../../domain/repositories/IFinanciacionRepository';
import { BaseException, NotFoundException } from '../../../domain/exceptions/BaseException';
import prisma from '../../../infrastructure/database/prisma';

// Estados de cuota que admiten cobro. Una cuota 'pagada' (saldo 0) o
// 'refinanciada' (su deuda ya se trasladó a otro contrato) NO se puede cobrar:
// hacerlo duplicaría el ingreso o corrompería la cadena de refinanciación.
const COBRABLES = ['pendiente', 'parcial', 'vencida'];

// Las columnas de dinero son Decimal(12,2). Se opera y compara con el monto ya
// redondeado a centavos para que lo validado sea EXACTAMENTE lo que se persiste
// (un monto con >2 decimales redondearía distinto en el INSERT/decrement).
const aCentavos = (n: number): number => Math.round(n * 100) / 100;

export class RegistrarPagoCuota {
    constructor(private readonly repository: IFinanciacionRepository) { }

    async execute(cuotaId: number, data: { monto: number; metodo: string; fechaPago?: string }) {
        // Lookup top-level: pasa por la extensión (inyecta el tenant), así una cuota
        // ajena da 404. Sirve además para validar estado/saldo con mensajes claros
        // antes de tocar dinero. El candado real contra carreras es el updateMany
        // condicionado de abajo, no esta lectura.
        const cuota = await prisma.cuota.findUnique({ where: { id: cuotaId } });
        if (!cuota) throw new NotFoundException('Cuota');

        // Validaciones de dinero — server-side, NO delegadas al front (un request
        // armado a mano saltea el guard de la UI):
        if (!COBRABLES.includes(cuota.estado as string)) {
            throw new BaseException(
                422,
                `La cuota no admite cobros (estado: ${cuota.estado})`,
                'CUOTA_NO_COBRABLE',
            );
        }
        const saldo = aCentavos(Number(cuota.saldoCuota));
        if (saldo <= 0) {
            throw new BaseException(422, 'La cuota ya está saldada', 'CUOTA_SALDADA');
        }
        const monto = aCentavos(Number(data.monto));
        if (!(monto > 0)) {
            throw new BaseException(400, 'El importe del pago debe ser mayor a 0', 'VALIDATION_ERROR');
        }
        if (monto > saldo) {
            throw new BaseException(
                422,
                'El importe no puede superar el saldo de la cuota',
                'MONTO_EXCEDE_SALDO',
            );
        }

        // Decremento ATÓMICO y condicionado: el WHERE re-chequea, sobre la fila que
        // el propio UPDATE bloquea, que la cuota siga cobrable y con saldo
        // suficiente. Así la SUMA de cobros nunca supera el saldo y dos pagos
        // TOTALES concurrentes (o un re-click) no pueden pasar ambos (el segundo da
        // count 0 → 409). NO se setea `estado` acá: se deriva del saldo REAL
        // post-decremento más abajo, para que un pago que satura la cuota bajo
        // concurrencia no quede marcado 'parcial' por una lectura vieja.
        //
        // LIMITACIÓN CONOCIDA (idempotencia, va con el Unit of Work del roadmap):
        // dos cobros PARCIALES iguales reenviados (doble-submit/retry de red)
        // registran dos PagoCuota (recaudación duplicada, pero SIN superar el saldo
        // de la cuota). La UI lo mitiga deshabilitando el botón mientras cobra; la
        // idempotencia dura exige una clave de request y una tx cruda única.
        const upd = await prisma.cuota.updateMany({
            where: {
                id: cuotaId,
                estado: { in: COBRABLES as any },
                saldoCuota: { gte: monto },
            },
            data: { saldoCuota: { decrement: monto } },
        });
        if (upd.count === 0) {
            throw new BaseException(
                409,
                'El estado de la cuota cambió; recargá e intentá de nuevo',
                'CUOTA_CONFLICTO',
            );
        }

        // Comprobante del pago. Orden intencional (decrementar → registrar): si algo
        // fallara entre medio quedaría un saldo reducido sin recibo (a favor del
        // cliente, reconciliable) en vez de un cobro de más. La atomicidad dura del
        // par va con el Unit of Work del roadmap (la extensión RLS re-despacha cada
        // operación a su propia sub-transacción).
        await prisma.pagoCuota.create({
            data: {
                cuotaId,
                monto,
                metodo: data.metodo as any,
                fechaPago: data.fechaPago ? new Date(data.fechaPago) : new Date(),
            },
        });

        // Estado derivado del saldo REAL post-decremento (no de la lectura vieja):
        // así una cuota que quedó en 0 SIEMPRE termina 'pagada' con fechaPagoCompleto,
        // aun si el saldo lo llevó a 0 un pago parcial concurrente.
        const fresca = await prisma.cuota.findUnique({ where: { id: cuotaId } });
        if (!fresca) throw new NotFoundException('Cuota');
        const saldada = aCentavos(Number(fresca.saldoCuota)) <= 0;
        const estadoCorrecto = saldada ? 'pagada' : 'parcial';
        const necesitaFecha = saldada && !fresca.fechaPagoCompleto;
        if ((fresca.estado as string) !== estadoCorrecto || necesitaFecha) {
            return prisma.cuota.update({
                where: { id: cuotaId },
                data: {
                    estado: estadoCorrecto as any,
                    ...(necesitaFecha ? { fechaPagoCompleto: new Date() } : {}),
                },
            });
        }
        return fresca;
    }
}
