import { Prisma } from '@prisma/client';
import { IVentaRepository } from '../../../domain/repositories/IVentaRepository';
import { IVehiculoRepository } from '../../../domain/repositories/IVehiculoRepository';
import { BaseException, NotFoundException } from '../../../domain/exceptions/BaseException';
import { withTenantTransaction } from '../../../infrastructure/database/unitOfWork';
import { context } from '../../../infrastructure/security/context';
import { assertMismoTenant } from '../../../infrastructure/security/tenantGuard';
import { resolverReservasParaVenta } from '../../../domain/services/reservaVenta';
import { evaluarPisoDeVenta } from '../../../domain/services/pisoDeVenta';
import { actorEsAdmin, actorUserId } from '../../../infrastructure/security/roles';
import { auditEnTx, detalleConCambio } from '../../../infrastructure/security/auditTx';
import { autorizacionVigente } from '../../services/precioAutorizacion';
import { sincronizarEnSegundoPlano } from '../../services/meliPublicacion';

export class CreateVenta {
    constructor(
        private readonly ventaRepository: IVentaRepository,
        private readonly vehiculoRepository: IVehiculoRepository
    ) { }

    async execute(data: any) {
        const { externos, pagos, canjes, reservaId, presupuestoId, ...ventaData } = data;

        const vehiculo = await this.vehiculoRepository.findById(ventaData.vehiculoId);
        if (!vehiculo) throw new NotFoundException('Vehículo');
        if (vehiculo.estado === 'vendido') {
            throw new BaseException(400, 'El vehículo ya está vendido', 'VEHICULO_VENDIDO');
        }

        // La venta hereda el tenant del vehículo (línea de abajo). El resto de las
        // FKs del body tienen que apuntar a ese mismo tenant: si no, un admin
        // podría vincular un cliente/sucursal/presupuesto ajeno (para el admin la
        // fila ajena da 404; para super_admin salta el chequeo de concesionaria).
        const tenantId = (vehiculo as any).concesionariaId;
        await assertMismoTenant('cliente', ventaData.clienteId, tenantId);
        await assertMismoTenant('sucursal', ventaData.sucursalId, tenantId);
        await assertMismoTenant('usuario', ventaData.vendedorId, tenantId);
        await assertMismoTenant('presupuesto', presupuestoId, tenantId);
        await assertMismoTenant('reserva', reservaId, tenantId);
        // Cada canje trae el vehículo que se toma en parte de pago: también tiene
        // que ser del tenant de la venta (el create anida `canjes` sin lookup).
        for (const canje of Array.isArray(canjes) ? canjes : []) {
            await assertMismoTenant('vehiculo', canje?.vehiculoCanjeId, tenantId);
        }

        // Filtro de tenant EXPLÍCITO para el camino raw: la tx de withTenantTransaction
        // NO pasa por la extensión, así que el aislamiento (que la extensión inyecta
        // en cada op) hay que replicarlo a mano. super_admin no se filtra.
        const isSuper = context.getUser()?.roles?.includes('super_admin') || false;
        const tenantSql = isSuper ? Prisma.empty : Prisma.sql`AND concesionaria_id = ${tenantId}`;
        const tenantWhere = isSuper ? {} : { concesionariaId: tenantId };

        // Unit of Work: la venta + sus subrecursos + el marcado de vehículo/reserva/
        // presupuesto commitean JUNTOS o nada. Antes usaba prisma.$transaction del
        // cliente EXTENDIDO → atomicidad ILUSORIA (cada op re-entraba a la extensión y
        // abría su PROPIA sub-tx): si fallaba el update del vehículo tras crear la
        // venta, quedaba plata cobrada con el auto todavía re-vendible.
        const venta = await withTenantTransaction(async (tx) => {
            // Lock del vehículo acotado al tenant + revalidación bajo lock: serializa
            // dos ventas concurrentes del MISMO auto (la 2da espera el commit de la 1ra,
            // ve 'vendido' y aborta). Cierra la doble venta que un findById sin lock deja.
            const rows = await tx.$queryRaw<Array<{ estado: string; precio_minimo: string | null; moneda: string }>>(Prisma.sql`
                SELECT estado, precio_minimo, moneda FROM vehiculos
                WHERE id = ${ventaData.vehiculoId} AND deleted_at IS NULL ${tenantSql}
                FOR UPDATE`);
            const locked = rows[0];
            if (!locked) throw new NotFoundException('Vehículo');
            if (locked.estado === 'vendido') {
                throw new BaseException(400, 'El vehículo ya está vendido', 'VEHICULO_VENDIDO');
            }

            // PISO DE VENTA (PROC-34), con el piso leído BAJO el lock. Por debajo del
            // mínimo (o en otra moneda) sólo vende el admin o quien tenga una
            // autorización vigente SUYA para esta unidad. `usuarioId` explícito: así
            // `autorizacionVigente` no aplica el atajo de rol y busca la solicitud.
            const pisoFicha = locked.precio_minimo == null ? null : Number(locked.precio_minimo);
            const esAdmin = actorEsAdmin();
            const precioVenta = Number(ventaData.precioVenta);
            const monedaVenta = ventaData.moneda ?? 'ARS';
            const necesitaAutorizacion = pisoFicha !== null && !esAdmin
                && (monedaVenta !== locked.moneda || precioVenta < pisoFicha);
            const autorizacion = necesitaAutorizacion ? await autorizacionVigente(ventaData.vehiculoId, actorUserId()) : null;
            const piso = evaluarPisoDeVenta({
                precioVenta,
                monedaVenta,
                pisoFicha,
                monedaUnidad: locked.moneda,
                esAdmin,
                autorizacion: autorizacion
                    ? { solicitudId: autorizacion.solicitudId, precio: Number(autorizacion.precioMinimo), moneda: autorizacion.moneda }
                    : null,
            });
            if (!piso.ok) throw new BaseException(403, piso.message, 'PRECIO_BAJO_MINIMO');

            // Reservas del auto, decididas BAJO EL LOCK del vehículo (ver resolverReservasParaVenta):
            // la reserva indicada tiene que ser de ESTE auto y estar activa; un auto reservado para
            // OTRO cliente no se vende pisándole la seña; la reserva del mismo cliente se consume sola.
            const reservaSolicitada = reservaId
                ? await tx.reserva.findFirst({
                    where: { id: reservaId, ...tenantWhere, deletedAt: null },
                    select: { id: true, vehiculoId: true, estado: true },
                })
                : null;
            const reservasActivas = await tx.reserva.findMany({
                where: { vehiculoId: ventaData.vehiculoId, estado: 'activa', deletedAt: null, ...tenantWhere },
                select: { id: true, clienteId: true },
            });
            const planReservas = resolverReservasParaVenta({
                estadoVehiculo: locked.estado,
                vehiculoId: ventaData.vehiculoId,
                clienteId: ventaData.clienteId,
                reservaId,
                reservaSolicitada,
                reservasActivas,
            });

            // 1. Crear la venta. El tenant top-level va explícito (no hay trigger);
            //    los subrecursos (extras/pagos/canjes) heredan concesionaria_id por el
            //    trigger derive_concesionaria_* (BEFORE INSERT), igual que con la extensión.
            const venta = await tx.venta.create({
                data: {
                    ...ventaData,
                    concesionariaId: tenantId,
                    presupuestoId,
                    bajoPiso: piso.bajoPiso,
                    extras: { create: externos || [] },
                    pagos: { create: pagos || [] },
                    canjes: { create: canjes || [] }
                }
            });

            // 2. Marcar el vehículo como vendido (acotado al tenant + soft-delete:
            //    el tx raw no auto-filtra deletedAt como la extensión).
            await tx.vehiculo.update({
                where: { id: ventaData.vehiculoId, ...tenantWhere, deletedAt: null },
                data: { estado: 'vendido' }
            });

            // 3. Cerrar la reserva que la venta consume (la indicada o la del mismo cliente) y
            //    cancelar las otras reservas activas del auto: ya no se pueden honrar.
            if (planReservas.consumir) {
                await tx.reserva.update({
                    where: { id: planReservas.consumir, ...tenantWhere, deletedAt: null },
                    data: { estado: 'convertida_en_venta' }
                });
            }
            if (planReservas.cancelar.length > 0) {
                await tx.reserva.updateMany({
                    where: { id: { in: planReservas.cancelar }, ...tenantWhere, deletedAt: null },
                    data: { estado: 'cancelada' }
                });
            }

            // 4. Aceptar el presupuesto si venía de uno.
            if (presupuestoId) {
                await tx.presupuesto.update({
                    where: { id: presupuestoId, ...tenantWhere, deletedAt: null },
                    data: { estado: 'aceptado' }
                });
            }

            // 5. Rastro DENTRO de la transacción: la venta no existe sin él. Va con el
            //    estado del vehículo antes/después y, si la unidad tenía piso, cómo se
            //    pasó el control (el valor del piso sólo lo lee el admin: /auditoria es
            //    authorize('admin')).
            await auditEnTx(tx, {
                concesionariaId: tenantId,
                entidad: 'Venta',
                entidadId: venta.id,
                accion: 'create',
                detalle: detalleConCambio(
                    `Venta ${venta.id} creada${piso.bajoPiso ? ' por debajo del precio mínimo' : ''}`,
                    {
                        venta: {
                            vehiculoId: ventaData.vehiculoId, clienteId: ventaData.clienteId, vendedorId: ventaData.vendedorId,
                            precioVenta, moneda: monedaVenta, formaPago: ventaData.formaPago,
                            presupuestoId: presupuestoId ?? null, reservaId: planReservas.consumir,
                        },
                        antes: { estadoVehiculo: locked.estado },
                        despues: { estadoVehiculo: 'vendido' },
                        ...(pisoFicha !== null ? {
                            piso: {
                                via: piso.via,
                                bajoPiso: piso.bajoPiso,
                                comparable: piso.comparable,
                                pisoFicha,
                                monedaUnidad: locked.moneda,
                                ...(autorizacion ? { solicitudId: autorizacion.solicitudId, precioAutorizado: Number(autorizacion.precioMinimo) } : {}),
                            },
                        } : {}),
                    },
                ),
            });

            return venta;
        });

        // El vehículo quedó 'vendido': el aviso de Mercado Libre se cierra acá,
        // DESPUÉS del commit. Este es el camino REAL por el que un auto se
        // vende (el estado no pasa por UpdateVehiculo), así que sin esto el
        // aviso seguía vivo indefinidamente recibiendo consultas por una unidad
        // que ya no está.
        sincronizarEnSegundoPlano(ventaData.vehiculoId);

        return venta;
    }
}
