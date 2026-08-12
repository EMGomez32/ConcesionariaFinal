import { IVehiculoRepository } from '../../../domain/repositories/IVehiculoRepository';
import { BaseException } from '../../../domain/exceptions/BaseException';
import { withTenantTransaction } from '../../../infrastructure/database/unitOfWork';
import { context } from '../../../infrastructure/security/context';
import { assertMismoTenant, resolveTenantDestino } from '../../../infrastructure/security/tenantGuard';
import { recordPrecioVehiculo } from '../../../infrastructure/pricing/recordPrecioVehiculo';

export class CreateVehiculo {
    constructor(private readonly vehiculoRepository: IVehiculoRepository) { }

    async execute(data: any) {
        if (!data.marca || !data.modelo) {
            throw new BaseException(400, 'Marca y modelo son obligatorios', 'VALIDATION_ERROR');
        }

        // clienteOrigenId es dato del INGRESO, no del vehículo: se separa para no
        // pasarlo a prisma.vehiculo.create (que lo rechazaría).
        const { clienteOrigenId, ...vehiculoData } = data;

        // Sucursal/proveedor/cliente de origen tienen que ser del tenant destino
        // (token para el admin, body.concesionariaId para super_admin): una fila
        // ajena da 404 para el admin y rechazo para super_admin.
        const tenantId = resolveTenantDestino(vehiculoData.concesionariaId);
        await assertMismoTenant('sucursal', vehiculoData.sucursalId, tenantId);
        await assertMismoTenant('proveedor', vehiculoData.proveedorCompraId, tenantId);
        await assertMismoTenant('cliente', clienteOrigenId, tenantId);

        // Los inputs type="date" mandan "YYYY-MM-DD" y los selects mandan strings;
        // Prisma 7 exige Date/ISO para @db.Date y number para las FK.
        if (vehiculoData.fechaIngreso) vehiculoData.fechaIngreso = new Date(vehiculoData.fechaIngreso);
        if (vehiculoData.fechaCompra) vehiculoData.fechaCompra = new Date(vehiculoData.fechaCompra);
        // Fechas opcionales: el <input type="date"> vacío manda '' (no undefined) y
        // Prisma rechaza '' en un @db.Date con un 500 → '' se mapea a null (igual que
        // venceEl en CreateReserva). El if(x) simple dejaba el '' y reventaba el alta.
        vehiculoData.vencimientoVtv = vehiculoData.vencimientoVtv ? new Date(vehiculoData.vencimientoVtv) : null;
        vehiculoData.vencimientoSeguro = vehiculoData.vencimientoSeguro ? new Date(vehiculoData.vencimientoSeguro) : null;
        vehiculoData.proveedorCompraId = vehiculoData.proveedorCompraId ? Number(vehiculoData.proveedorCompraId) : null;

        // Datos del ingreso (derivados del vehículo) — se calculan antes de la tx.
        const proveedorId = vehiculoData.proveedorCompraId;
        const clienteId = clienteOrigenId ? Number(clienteOrigenId) : null;
        const origen = String(vehiculoData.origen || 'compra');

        let tipoIngreso: string;
        if (origen === 'permuta') tipoIngreso = 'permuta';
        else if (origen === 'consignacion') tipoIngreso = 'consignacion';
        else if (origen === 'otro') tipoIngreso = 'otro';
        else tipoIngreso = clienteId && !proveedorId ? 'compra_particular' : 'compra_proveedor';

        const valorTomado =
            vehiculoData.precioCompra !== undefined && vehiculoData.precioCompra !== null && vehiculoData.precioCompra !== ''
                ? Number(vehiculoData.precioCompra)
                : null;

        // Unit of Work: el vehículo y su ingreso automático NACEN JUNTOS o no nacen.
        // Antes NO había transacción alguna (repo.create suelto + ingreso suelto): si
        // fallaba el ingreso, quedaba el vehículo sin su registro de compra (contabilidad
        // incompleta). El tenant va explícito (top-level, sin trigger; y el tx raw no
        // pasa por la extensión que lo inyectaría).
        const created: any = await withTenantTransaction(async (tx) => {
            const v = await tx.vehiculo.create({ data: { ...vehiculoData, concesionariaId: tenantId } });
            await tx.ingresoVehiculo.create({
                data: {
                    concesionariaId: v.concesionariaId,
                    sucursalId: v.sucursalId,
                    vehiculoId: v.id,
                    tipoIngreso: tipoIngreso as any,
                    fechaIngreso: vehiculoData.fechaIngreso || new Date(),
                    valorTomado,
                    proveedorOrigenId: proveedorId,
                    clienteOrigenId: clienteId,
                    observaciones: vehiculoData.observaciones || null,
                    registradoPorId: context.getUser()?.userId ?? null,
                },
            });
            return v;
        });

        // Precio de lista inicial en el historial (log append-only, best-effort): a
        // propósito FUERA de la tx — un fallo del log no debe revertir el alta.
        const precioInicial =
            vehiculoData.precioLista !== undefined && vehiculoData.precioLista !== null && vehiculoData.precioLista !== ''
                ? Number(vehiculoData.precioLista)
                : null;
        if (precioInicial != null && !Number.isNaN(precioInicial)) {
            await recordPrecioVehiculo({
                concesionariaId: created.concesionariaId,
                vehiculoId: created.id,
                precioAnterior: null,
                precioNuevo: precioInicial,
                moneda: created.moneda,
                motivo: 'Precio inicial',
            });
        }

        // Devuelvo la entidad mapeada (misma forma que antes: repo.create → mapToEntity).
        // findById siempre encuentra el vehículo recién creado (mismo tenant); el throw
        // cubre lo imposible y evita devolver el objeto crudo del tx (forma distinta).
        const entity = await this.vehiculoRepository.findById(created.id);
        if (!entity) throw new BaseException(500, 'El vehículo se creó pero no pudo recuperarse', 'INTERNAL_ERROR');
        return entity;
    }
}
