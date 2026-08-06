import { Request, Response, NextFunction } from 'express';
import { PrismaVehiculoPrecioHistorialRepository } from '../../infrastructure/database/repositories/PrismaVehiculoPrecioHistorialRepository';
import { BaseException } from '../../domain/exceptions/BaseException';

const repository = new PrismaVehiculoPrecioHistorialRepository();

// Valida un id de path numérico (NaN → 400 limpio en vez de un 500 de Prisma).
function parseId(raw: unknown, label: string): number {
    const n = parseInt(String(raw), 10);
    if (!Number.isInteger(n) || n <= 0) {
        throw new BaseException(400, `${label} inválido`, 'INVALID_ID');
    }
    return n;
}

export class VehiculoPrecioHistorialController {
    static async getByVehiculo(req: Request, res: Response, next: NextFunction) {
        try {
            const vehiculoId = parseId(req.params.vehiculoId, 'vehiculoId');
            const result = await repository.findByVehiculo(vehiculoId);
            res.json(result);
        } catch (error) {
            next(error);
        }
    }
}
