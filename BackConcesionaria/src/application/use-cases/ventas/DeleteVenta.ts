import { Prisma } from '@prisma/client';
import { IVentaRepository } from '../../../domain/repositories/IVentaRepository';
import { BaseException, NotFoundException } from '../../../domain/exceptions/BaseException';
import { bloqueosDeAnulacion, mensajeDeBloqueo } from '../../../domain/services/anulacionVenta';
import { withTenantTransaction } from '../../../infrastructure/database/unitOfWork';
import { context } from '../../../infrastructure/security/context';
import { auditEnTx, detalleConCambio } from '../../../infrastructure/security/auditTx';
import { sincronizarEnSegundoPlano } from '../../services/meliPublicacion';

/**
 * ANULAR una venta (DELETE /ventas/:id, sólo admin).
 *
 * Sigue siendo un soft-delete que devuelve la unidad a `publicado`, pero con tres
 * controles que antes no tenía (PROC-30):
 *   1. Motivo obligatorio (lo exige el schema) guardado en la fila y en el rastro.
 *   2. No anula si queda plata o algo fiscal colgando: pagos sin quitar, un
 *      contrato vivo o con cuotas cobradas, una factura informada a AFIP. Ver
 *      `bloqueosDeAnulacion`: cada cosa se revierte antes por su camino.
 *   3. La auditoría se escribe DENTRO de la misma transacción, con el antes y el
 *      después: no puede quedar una anulación sin rastro.
 */
export class DeleteVenta {
    constructor(private readonly ventaRepository: IVentaRepository) { }

    async execute(id: number, datos: { motivo: string }) {
        const current: any = await this.ventaRepository.findById(id);
        if (!current) throw new NotFoundException('Venta');

        const motivo = String(datos?.motivo ?? '').trim();
        const tenantId = current.concesionariaId;
        const actor = context.getUser();
        const isSuper = actor?.roles?.includes('super_admin') || false;
        const tenantWhere = isSuper ? {} : { concesionariaId: tenantId };
        const tenantSql = isSuper ? Prisma.empty : Prisma.sql`AND concesionaria_id = ${tenantId}`;

        // Unit of Work: liberar el vehículo, borrar (soft) la venta y dejar el rastro
        // commitean JUNTOS. Antes era prisma.$transaction del cliente EXTENDIDO
        // (atomicidad ilusoria): si fallaba el borrado tras liberar el auto, quedaba el
        // vehículo re-vendible con la venta viva → doble venta.
        const venta = await withTenantTransaction(async (tx) => {
            // Locks en el orden de CreateVenta: VEHÍCULO y después la venta. El lock de
            // la venta además frena a quien quiera colgarle un pago, un contrato o una
            // factura mientras se decide: esos INSERT chequean la FK contra esta fila
            // (FOR KEY SHARE), que choca con el FOR UPDATE y espera al commit.
            // Vehículo sin filtro de deleted_at (como antes): si estuviera soft-deleted,
            // igual se libera en vez de abortar la anulación.
            const veh = (await tx.$queryRaw<Array<{ estado: string }>>(Prisma.sql`
                SELECT estado FROM vehiculos
                WHERE id = ${current.vehiculoId} ${tenantSql}
                FOR UPDATE`))[0];
            const viva = (await tx.$queryRaw<Array<{ id: number }>>(Prisma.sql`
                SELECT id FROM ventas
                WHERE id = ${id} AND deleted_at IS NULL ${tenantSql}
                FOR UPDATE`))[0];
            if (!viva) throw new NotFoundException('Venta');

            // Lo que cuelga de la venta, leído BAJO el lock. Los sub-recursos se filtran
            // por ventaId de una venta ya verificada como del tenant (y la RLS acompaña).
            // En serie y no con Promise.all: es UNA conexión transaccional.
            const pagos = await tx.ventaPago.findMany({
                where: { ventaId: id, deletedAt: null },
                select: { id: true },
            });
            const financiaciones = await tx.financiacion.findMany({
                where: { ventaId: id, deletedAt: null, ...tenantWhere },
                select: { id: true, estado: true },
            });
            const conCobros: Array<{ id: number; estado: string; cobros: number }> = [];
            for (const f of financiaciones) {
                const cobros = await tx.pagoCuota.count({
                    where: { deletedAt: null, cuota: { financiacionId: f.id, deletedAt: null } },
                });
                conCobros.push({ ...f, cobros });
            }
            const comprobante = await tx.comprobanteAfip.findFirst({
                where: { ventaId: id, deletedAt: null },
                select: { id: true, tipoComprobante: true, puntoVenta: true, numero: true, entorno: true, estado: true },
            });

            const bloqueos = bloqueosDeAnulacion({ ventaId: id, pagos, financiaciones: conCobros, comprobante });
            if (bloqueos.length > 0) {
                const err = new BaseException(409, mensajeDeBloqueo(id, bloqueos), 'ANULACION_BLOQUEADA');
                err.details = { bloqueos };
                throw err;
            }

            await tx.vehiculo.update({
                where: { id: current.vehiculoId, ...tenantWhere },
                data: { estado: 'publicado' },
            });

            // TRAMPA: bajo el tx raw, tx.venta.delete() sería un HARD delete real (la
            // reescritura delete→soft-delete la hace la extensión, que aquí NO corre).
            // Por eso el soft-delete se hace a mano.
            const anulada = await tx.venta.update({
                where: { id, ...tenantWhere, deletedAt: null },
                data: { deletedAt: new Date(), motivoAnulacion: motivo, anuladaPorId: actor?.userId ?? null },
            });

            await auditEnTx(tx, {
                concesionariaId: tenantId,
                entidad: 'Venta',
                entidadId: id,
                accion: 'delete_soft',
                detalle: detalleConCambio(`Venta ${id} anulada. Motivo: ${motivo}`, {
                    motivo,
                    venta: {
                        vehiculoId: current.vehiculoId,
                        clienteId: current.clienteId,
                        vendedorId: current.vendedorId,
                        precioVenta: current.precioVenta,
                        moneda: current.moneda,
                        fechaVenta: current.fechaVenta,
                        estadoEntrega: current.estadoEntrega,
                    },
                    antes: { anulada: false, estadoVehiculo: veh?.estado ?? null },
                    despues: { anulada: true, estadoVehiculo: 'publicado', anuladaEn: anulada.deletedAt },
                }),
            });

            return anulada;
        });

        // El vehículo volvió a 'publicado': si la publicación de Mercado Libre
        // había quedado pausada, se reactiva. (Una CERRADA no vuelve: en ML el
        // cierre es definitivo y hay que publicar de nuevo.)
        sincronizarEnSegundoPlano(current.vehiculoId);

        return venta;
    }
}
