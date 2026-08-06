import { Request, Response, NextFunction } from 'express';
import { PrismaVehiculoRepository } from '../../infrastructure/database/repositories/PrismaVehiculoRepository';
import { GetVehiculos } from '../../application/use-cases/vehiculos/GetVehiculos';
import { GetVehiculoById } from '../../application/use-cases/vehiculos/GetVehiculoById';
import { CreateVehiculo } from '../../application/use-cases/vehiculos/CreateVehiculo';
import { UpdateVehiculo } from '../../application/use-cases/vehiculos/UpdateVehiculo';
import { DeleteVehiculo } from '../../application/use-cases/vehiculos/DeleteVehiculo';
import { TransferVehiculo } from '../../application/use-cases/vehiculos/TransferVehiculo';
import { audit } from '../../infrastructure/security/audit';
import { Col, sendCsv } from '../../utils/csv';

const repository = new PrismaVehiculoRepository();
const getVehiculosUC = new GetVehiculos(repository);
const getVehiculoByIdUC = new GetVehiculoById(repository);
const createVehiculoUC = new CreateVehiculo(repository);
const updateVehiculoUC = new UpdateVehiculo(repository);
const deleteVehiculoUC = new DeleteVehiculo(repository);
const transferVehiculoUC = new TransferVehiculo(repository);

export class VehiculoController {
    // Arma el WHERE de Prisma a partir de los query params (compartido por el
    // listado y el export CSV, para que el CSV respete exactamente los mismos
    // filtros que ve el usuario en la grilla).
    private static buildWhere(query: any): any {
        const { search, marca, modelo, dominio, estado, tipo, sucursalId } = query;
        const where: any = {};
        // `search` busca por marca/modelo/dominio (parcial, insensible a mayúsculas).
        const term = (search ?? marca) as string | undefined;
        if (term) {
            where.OR = [
                { marca: { contains: String(term), mode: 'insensitive' } },
                { modelo: { contains: String(term), mode: 'insensitive' } },
                { dominio: { contains: String(term), mode: 'insensitive' } },
            ];
        }
        if (modelo) where.modelo = { contains: String(modelo), mode: 'insensitive' };
        if (dominio) where.dominio = { contains: String(dominio), mode: 'insensitive' };
        // `estado` acepta uno o varios separados por coma (ej: "publicado,preparacion").
        if (estado) {
            const estados = String(estado).split(',').map((e) => e.trim()).filter(Boolean);
            where.estado = estados.length > 1 ? { in: estados } : estados[0];
        }
        if (tipo) where.tipo = tipo;
        if (sucursalId) where.sucursalId = Number(sucursalId); // query param llega como string
        return where;
    }

    static async getAll(req: Request, res: Response, next: NextFunction) {
        try {
            const { limit, page, sortBy, sortOrder } = req.query;
            const where = VehiculoController.buildWhere(req.query);
            const result = await getVehiculosUC.execute(where, { limit, page, sortBy, sortOrder } as any);
            res.json(result);
        } catch (error) {
            next(error);
        }
    }

    // Export CSV del stock con los MISMOS filtros del listado. Tope defensivo de
    // 5000 unidades (holgado para cualquier concesionaria) para no volcar el
    // catálogo entero en memoria; se ordena por antigüedad de ingreso.
    static async exportCsv(req: Request, res: Response, next: NextFunction) {
        try {
            const CAP = 5000;
            const where = VehiculoController.buildWhere(req.query);
            const result: any = await getVehiculosUC.execute(
                where,
                { limit: CAP, page: 1, sortBy: 'fechaIngreso', sortOrder: 'desc' } as any,
            );

            // Si el resultado supera el tope, el CSV sale con las primeras CAP filas:
            // avisamos por un header (el front lo toastea) y por log — no truncar en
            // silencio con el total ya calculado y descartado.
            if (Number(result.totalResults) > CAP) {
                res.setHeader('X-Export-Truncated', String(result.totalResults));
                console.warn(`[export] stock CSV truncado: ${result.totalResults} > ${CAP}`);
            }

            const toDia = (d: any) =>
                d instanceof Date ? d.toISOString().slice(0, 10) : d ? String(d).slice(0, 10) : '';

            const cols: Col[] = [
                { key: 'dominio', header: 'Dominio' },
                { key: 'marca', header: 'Marca' },
                { key: 'modelo', header: 'Modelo' },
                { key: 'version', header: 'Versión' },
                { key: 'anio', header: 'Año' },
                { key: 'km', header: 'Km' },
                { key: 'color', header: 'Color' },
                { key: 'estado', header: 'Estado' },
                { key: 'precioLista', header: 'Precio lista' },
                { key: 'moneda', header: 'Moneda' },
                { key: 'sucursal', header: 'Sucursal' },
                { key: 'fechaIngreso', header: 'Fecha ingreso' },
                { key: 'vtv', header: 'Vence VTV' },
                { key: 'seguro', header: 'Vence seguro' },
                { key: 'vin', header: 'VIN' },
            ];

            const rows = (result.results as any[]).map((v) => ({
                dominio: v.dominio,
                marca: v.marca,
                modelo: v.modelo,
                version: v.version,
                anio: v.anio,
                km: v.kmIngreso,
                color: v.color,
                estado: v.estado,
                precioLista: v.precioLista == null ? '' : Number(v.precioLista),
                moneda: v.moneda,
                sucursal: v.sucursal?.nombre,
                fechaIngreso: toDia(v.fechaIngreso),
                vtv: toDia(v.vencimientoVtv),
                seguro: toDia(v.vencimientoSeguro),
                vin: v.vin,
            }));

            sendCsv(res, 'stock-vehiculos', cols, rows);
        } catch (error) {
            next(error);
        }
    }

    static async getById(req: Request, res: Response, next: NextFunction) {
        try {
            const id = parseInt(req.params.id as string, 10);
            const result = await getVehiculoByIdUC.execute(id);
            res.json(result);
        } catch (error) {
            next(error);
        }
    }

    static async create(req: Request, res: Response, next: NextFunction) {
        try {
            const result = await createVehiculoUC.execute(req.body);
            const label = (result as any)?.patente ?? (result as any)?.marca ?? (result as any)?.id;
            await audit({
                entidad: 'Vehiculo',
                accion: 'create',
                entidadId: (result as any)?.id,
                detalle: `Vehiculo ${label} creado`,
            });
            res.status(201).json(result);
        } catch (error) {
            next(error);
        }
    }

    static async update(req: Request, res: Response, next: NextFunction) {
        try {
            const id = parseInt(req.params.id as string, 10);
            const result = await updateVehiculoUC.execute(id, req.body);
            await audit({
                entidad: 'Vehiculo',
                accion: 'update',
                entidadId: id,
                detalle: `Vehiculo ${id} actualizado`,
            });
            res.json(result);
        } catch (error) {
            next(error);
        }
    }

    static async delete(req: Request, res: Response, next: NextFunction) {
        try {
            const id = parseInt(req.params.id as string, 10);
            await deleteVehiculoUC.execute(id);
            await audit({
                entidad: 'Vehiculo',
                accion: 'delete_soft',
                entidadId: id,
                detalle: `Vehiculo ${id} eliminado`,
            });
            res.status(204).send();
        } catch (error) {
            next(error);
        }
    }

    static async transferir(req: Request, res: Response, next: NextFunction) {
        try {
            const id = parseInt(req.params.id as string, 10);
            const { sucursalDestinoId, motivo } = req.body;
            const result = await transferVehiculoUC.execute(id, Number(sucursalDestinoId), motivo);
            await audit({
                entidad: 'Vehiculo',
                accion: 'update',
                entidadId: id,
                detalle: `Vehículo transferido a sucursal ${sucursalDestinoId}`,
            });
            res.json(result);
        } catch (error) {
            next(error);
        }
    }
}
