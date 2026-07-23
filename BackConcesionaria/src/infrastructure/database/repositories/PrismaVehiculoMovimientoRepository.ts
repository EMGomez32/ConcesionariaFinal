import { IVehiculoMovimientoRepository } from '../../../domain/repositories/IVehiculoMovimientoRepository';
import { VehiculoMovimiento } from '../../../domain/entities/VehiculoMovimiento';
import prisma from '../prisma';
import { coerceFilter } from '../queryFilter';
import { QueryOptions, PaginatedResponse } from '../../../types/common';
import { BaseException, NotFoundException } from '../../../domain/exceptions/BaseException';
import { assertMismoTenant } from '../../security/tenantGuard';

export class PrismaVehiculoMovimientoRepository implements IVehiculoMovimientoRepository {
    async findAll(filter: any = {}, options: QueryOptions = {}): Promise<PaginatedResponse<VehiculoMovimiento>> {
        const { limit = 20, page = 1, sortBy = 'createdAt', sortOrder = 'desc' } = options;
        const limitNum = Number(limit);
        const pageNum = Number(page);
        const where = coerceFilter(filter);

        const results = await prisma.vehiculoMovimiento.findMany({
            where,
            take: limitNum,
            skip: (pageNum - 1) * limitNum,
            orderBy: { [sortBy as string]: sortOrder },
            include: {
                vehiculo: true,
                desdeSucursal: true,
                hastaSucursal: true,
                proveedorDestino: true,
                registradoPor: { select: { nombre: true, email: true } }
            }
        });

        const total = await prisma.vehiculoMovimiento.count({ where });

        return {
            results: results.map(this.mapToEntity),
            page: pageNum,
            limit: limitNum,
            totalPages: Math.ceil(total / limitNum),
            totalResults: total,
        };
    }

    async findById(id: number): Promise<VehiculoMovimiento | null> {
        const m = await prisma.vehiculoMovimiento.findUnique({
            where: { id },
            include: {
                vehiculo: true,
                desdeSucursal: true,
                hastaSucursal: true,
                proveedorDestino: true,
                registradoPor: { select: { nombre: true, email: true } }
            }
        });
        return m ? this.mapToEntity(m) : null;
    }

    async create(data: any): Promise<VehiculoMovimiento> {
        const { vehiculoId, hastaSucursalId, registradoPorId, motivo, fechaMovimiento, tipo, proveedorDestinoId } = data;

        const v = await prisma.vehiculo.findUnique({ where: { id: vehiculoId } });
        if (!v) throw new NotFoundException('Vehículo');

        const desdeSucursalId = v.sucursalId;
        // Dos modalidades: traslado a otra sucursal (mueve el vehículo) o envío a
        // preparación, donde la unidad va a un proveedor externo (mecánico,
        // lavadero, chapa y pintura...) y sólo se registra a dónde fue.
        const esTraslado = (tipo ?? 'traslado') === 'traslado';

        if (esTraslado) {
            if (!hastaSucursalId) {
                throw new BaseException(400, 'Seleccioná la sucursal de destino', 'DEST_REQUERIDO');
            }
            if (desdeSucursalId === Number(hastaSucursalId)) {
                throw new BaseException(400, 'La sucursal de destino debe ser diferente a la de origen', 'SAME_SUCURSAL');
            }
            // La sucursal destino tiene que ser del tenant del vehículo: sin esto un
            // admin podría trasladar la unidad a una sucursal de otra concesionaria
            // (para el admin la ajena da 404; para super_admin se rechaza el cruce).
            await assertMismoTenant('sucursal', hastaSucursalId, v.concesionariaId);
        } else {
            if (!proveedorDestinoId) {
                throw new BaseException(400, 'Seleccioná el proveedor de destino', 'DESTINO_REQUERIDO');
            }
            // El proveedor destino tiene que ser del mismo tenant que el vehículo.
            const prov: any = await assertMismoTenant('proveedor', proveedorDestinoId, v.concesionariaId);
            if (!prov.activo) {
                throw new BaseException(400, `El proveedor "${prov.nombre}" está inactivo`, 'PROVEEDOR_INACTIVO');
            }
        }

        return prisma.$transaction(async (tx) => {
            const m = await tx.vehiculoMovimiento.create({
                data: {
                    vehiculoId,
                    desdeSucursalId,
                    hastaSucursalId: esTraslado ? Number(hastaSucursalId) : null,
                    proveedorDestinoId: esTraslado ? null : Number(proveedorDestinoId),
                    registradoPorId,
                    tipo: esTraslado ? 'traslado' : 'preparacion',
                    motivo,
                    ...(fechaMovimiento ? { fecha: new Date(fechaMovimiento) } : {}),
                    concesionariaId: v.concesionariaId
                }
            });

            // Solo el traslado cambia la sucursal física del vehículo.
            if (esTraslado) {
                await tx.vehiculo.update({
                    where: { id: vehiculoId },
                    data: { sucursalId: Number(hastaSucursalId) }
                });
            }

            return this.mapToEntity(m);
        });
    }

    private mapToEntity(m: any): VehiculoMovimiento {
        return new VehiculoMovimiento(
            m.id,
            m.concesionariaId,
            m.vehiculoId,
            m.registradoPorId,
            m.desdeSucursalId,
            m.hastaSucursalId,
            m.tipo,
            m.fecha,
            m.motivo,
            m.createdAt,
            m.updatedAt,
            m.deletedAt,
            m.vehiculo,
            m.desdeSucursal,
            m.hastaSucursal,
            m.registradoPor,
            m.destino ?? null,
            m.fechaRetorno ?? null,
            m.proveedorDestinoId ?? null,
            m.proveedorDestino ?? null
        );
    }

    async marcarRetorno(id: number, fecha?: string): Promise<VehiculoMovimiento> {
        const m = await prisma.vehiculoMovimiento.findUnique({ where: { id } });
        if (!m) throw new NotFoundException('Movimiento');
        if (m.tipo !== 'preparacion') {
            throw new BaseException(400, 'Solo los envíos a preparación pueden marcarse como retornados', 'NO_PREPARACION');
        }
        const actualizado = await prisma.vehiculoMovimiento.update({
            where: { id },
            data: { fechaRetorno: fecha ? new Date(fecha) : new Date() },
            include: {
                vehiculo: true,
                desdeSucursal: true,
                hastaSucursal: true,
                proveedorDestino: true,
                registradoPor: { select: { nombre: true, email: true } },
            },
        });
        return this.mapToEntity(actualizado);
    }
}
