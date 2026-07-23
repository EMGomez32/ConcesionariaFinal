import { IVehiculoRepository } from '../../../domain/repositories/IVehiculoRepository';
import { BaseException } from '../../../domain/exceptions/BaseException';
import prisma from '../../../infrastructure/database/prisma';
import { context } from '../../../infrastructure/security/context';
import { assertMismoTenant, resolveTenantDestino } from '../../../infrastructure/security/tenantGuard';

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
        vehiculoData.proveedorCompraId = vehiculoData.proveedorCompraId ? Number(vehiculoData.proveedorCompraId) : null;

        const vehiculo: any = await this.vehiculoRepository.create(vehiculoData);

        // Al ingresar un vehículo se registra automáticamente su ingreso, para que
        // aparezca tanto en Vehículos como en Ingresos con los mismos datos.
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

        await prisma.ingresoVehiculo.create({
            data: {
                concesionariaId: vehiculo.concesionariaId,
                sucursalId: vehiculo.sucursalId,
                vehiculoId: vehiculo.id,
                tipoIngreso: tipoIngreso as any,
                fechaIngreso: vehiculoData.fechaIngreso || new Date(),
                valorTomado,
                proveedorOrigenId: proveedorId,
                clienteOrigenId: clienteId,
                observaciones: vehiculoData.observaciones || null,
                registradoPorId: context.getUser()?.userId ?? null,
            },
        });

        return vehiculo;
    }
}
