import { IFinanciacionRepository } from '../../../domain/repositories/IFinanciacionRepository';
import { Financiacion, Cuota } from '../../../domain/entities/Financiacion';
import prisma from '../prisma';
import { coerceFilter } from '../queryFilter';
import { BaseException, NotFoundException } from '../../../domain/exceptions/BaseException';
import { QueryOptions, PaginatedResponse } from '../../../types/common';
import { assertMismoTenant } from '../../security/tenantGuard';

/**
 * Vencimiento de la cuota nro `i` (1-based) contando desde la fecha de inicio.
 *
 * Todo se calcula en UTC y con Date.UTC() a propósito:
 *
 * - `new Date('2026-08-01')` es medianoche UTC, que en UTC-3 es el 31/07 local.
 *   Usar getMonth()/setDate() sobre eso arrancaba el conteo un mes corrido y
 *   guardaba las cuotas un día después del que correspondía.
 * - `setMonth()` sobre un día 31 desborda (Sep 31 no existe → salta al 1/10),
 *   con lo que dos cuotas seguidas caían en la misma fecha. Date.UTC() con el
 *   día ya calculado no tiene ese problema y maneja bien el cambio de año.
 * - Si el día de vencimiento no existe en el mes destino (31 en febrero), se
 *   usa el último día de ese mes.
 */
function vencimientoDeCuota(fechaInicio: string | Date, diaVencimiento: number, i: number): Date {
    const inicio = new Date(fechaInicio);
    const anio = inicio.getUTCFullYear();
    const mes = inicio.getUTCMonth() + i;

    // Día 0 del mes siguiente = último día del mes destino.
    const ultimoDia = new Date(Date.UTC(anio, mes + 1, 0)).getUTCDate();
    const dia = Math.min(Number(diaVencimiento), ultimoDia);

    return new Date(Date.UTC(anio, mes, dia));
}

/**
 * Arma el plan de cuotas de un capital.
 *
 * Con `tasaMensual` se usa el sistema francés (cuota fija), que es el estándar
 * local: cuota = C · i / (1 - (1+i)^-n). Sin tasa, es el capital prorrateado.
 *
 * El total a pagar se reparte en centavos y el sobrante se distribuye de a uno
 * en las primeras cuotas: dividir y redondear cada cuota por separado dejaba una
 * diferencia contra el total del contrato.
 */
export function planDeCuotas(
    capital: number,
    n: number,
    tasaMensual: number | null | undefined,
    fechaInicio: string | Date,
    diaVencimiento: number,
) {
    const i = Number(tasaMensual ?? 0) / 100;
    const cuotaBruta = i > 0
        ? (capital * i) / (1 - Math.pow(1 + i, -n))
        : capital / n;

    const totalCentavos = Math.round(cuotaBruta * n * 100);
    const baseCentavos = Math.floor(totalCentavos / n);
    const resto = totalCentavos - baseCentavos * n;

    const cuotas = [];
    for (let k = 1; k <= n; k++) {
        const montoCuota = (baseCentavos + (k <= resto ? 1 : 0)) / 100;
        cuotas.push({
            nroCuota: k,
            montoCuota,
            saldoCuota: montoCuota,
            vencimiento: vencimientoDeCuota(fechaInicio, diaVencimiento, k),
            estado: 'pendiente' as any,
        });
    }
    return cuotas;
}

export class PrismaFinanciacionRepository implements IFinanciacionRepository {
    async findAll(filter: any = {}, options: QueryOptions = {}): Promise<PaginatedResponse<Financiacion>> {
        const { limit = 20, page = 1, sortBy = 'createdAt', sortOrder = 'desc' } = options;
        const limitNum = Number(limit);
        const pageNum = Number(page);

        const where = coerceFilter(filter);


        const results = await prisma.financiacion.findMany({
            where,
            take: limitNum,
            skip: (pageNum - 1) * limitNum,
            orderBy: { [sortBy as string]: sortOrder },
            include: {
                venta: { include: { vehiculo: true } },
                cliente: true,
                cuotasPlan: { where: { deletedAt: null }, orderBy: { nroCuota: 'asc' } }
            }
        });

        const total = await prisma.financiacion.count({ where });

        return {
            results: results.map(this.mapToEntity),
            page: pageNum,
            limit: limitNum,
            totalPages: Math.ceil(total / limitNum),
            totalResults: total,
        };
    }

    async findById(id: number): Promise<Financiacion | null> {
        const f = await prisma.financiacion.findUnique({
            where: { id },
            // El detalle identifica el contrato por el vehículo de la venta, y
            // linkea con el contrato que refinancia / que lo refinanció.
            include: {
                cuotasPlan: { where: { deletedAt: null }, orderBy: { nroCuota: 'asc' } },
                venta: { include: { vehiculo: true } },
                cliente: true,
                refinanciaA: { select: { id: true, estado: true, montoFinanciado: true, moneda: true } },
                refinanciadaPor: { where: { deletedAt: null }, select: { id: true, estado: true, montoFinanciado: true, moneda: true, cuotas: true } },
            }
        });
        return f ? this.mapToEntity(f) : null;
    }

    async update(id: number, data: any): Promise<Financiacion> {
        const f = await prisma.financiacion.update({
            where: { id },
            data,
            // El detalle identifica el contrato por el vehículo de la venta, y
            // linkea con el contrato que refinancia / que lo refinanció.
            include: {
                cuotasPlan: { where: { deletedAt: null }, orderBy: { nroCuota: 'asc' } },
                venta: { include: { vehiculo: true } },
                cliente: true,
                refinanciaA: { select: { id: true, estado: true, montoFinanciado: true, moneda: true } },
                refinanciadaPor: { where: { deletedAt: null }, select: { id: true, estado: true, montoFinanciado: true, moneda: true, cuotas: true } },
            },
        });
        return this.mapToEntity(f);
    }

    async findCuotaById(id: number): Promise<Cuota | null> {
        const c = await prisma.cuota.findUnique({ where: { id } });
        return c ? this.mapCuotaToEntity(c) : null;
    }

    async updateCuota(id: number, data: any): Promise<Cuota> {
        const c = await prisma.cuota.update({
            where: { id },
            data,
        });
        return this.mapCuotaToEntity(c);
    }

    async createPagoCuota(data: any): Promise<void> {
        await prisma.pagoCuota.create({ data });
    }

    async create(data: any): Promise<Financiacion> {
        const {
            ventaId, clienteId, cobradorId, montoFinanciado, cuotas: cuotasCount,
            diaVencimiento, fechaInicio, concesionariaId, sucursalId, moneda,
            tasaMensual, observaciones,
        } = data;

        const total = parseFloat(montoFinanciado);
        const n = parseInt(cuotasCount, 10);

        return prisma.$transaction(async (tx) => {
            const f = await tx.financiacion.create({
                data: {
                    ventaId,
                    clienteId,
                    cobradorId,
                    montoFinanciado,
                    cuotas: cuotasCount,
                    diaVencimiento,
                    fechaInicio: new Date(fechaInicio),
                    concesionariaId,
                    ...(sucursalId !== undefined ? { sucursalId } : {}),
                    ...(moneda !== undefined ? { moneda } : {}),
                    ...(tasaMensual !== undefined && tasaMensual !== null && tasaMensual !== '' ? { tasaMensual } : {}),
                    ...(observaciones !== undefined ? { observaciones } : {}),
                }
            });

            const cuotasData = planDeCuotas(total, n, tasaMensual, fechaInicio, diaVencimiento)
                .map(c => ({ ...c, financiacionId: f.id }));

            await tx.cuota.createMany({ data: cuotasData });

            const fComplete = await tx.financiacion.findUnique({
                where: { id: f.id },
                include: { cuotasPlan: { where: { deletedAt: null } } }
            });
            return this.mapToEntity(fComplete);
        });
    }

    /**
     * Refinancia el saldo pendiente de un contrato en uno nuevo.
     *
     * Todo pasa en una transacción: o queda el contrato viejo cerrado Y el nuevo
     * creado, o no pasa nada. Un fallo a mitad dejaría la deuda duplicada o
     * desaparecida.
     */
    async refinanciar(id: number, data: any): Promise<Financiacion> {
        const original = await prisma.financiacion.findUnique({
            where: { id },
            // El `where: { deletedAt: null }` es OBLIGATORIO acá: la extensión sólo
            // filtra los borrados en el where de primer nivel, no dentro de un
            // include. Sin esto, una cuota borrada cuenta como impaga y se
            // refinancia un capital que no se debe.
            include: { cuotasPlan: { where: { deletedAt: null } } },
        });
        if (!original) throw new NotFoundException('Financiación');

        // El contrato refinanciado hereda el tenant del original: si viene un
        // cobrador nuevo en el body, tiene que ser de esa misma concesionaria.
        await assertMismoTenant('usuario', data?.cobradorId, original.concesionariaId);

        if (original.estado !== 'activa' && original.estado !== 'en_mora') {
            throw new BaseException(
                422,
                `Sólo se puede refinanciar un contrato activo o en mora (actual: '${original.estado}')`,
                'INVALID_STATE',
            );
        }

        // Un contrato se refinancia una sola vez. Lo valida el use-case porque el
        // modelo no puede llevar el índice único (ver el comentario del schema).
        const yaRefinanciado = await prisma.financiacion.findFirst({
            where: { refinanciaAId: id },
        });
        if (yaRefinanciado) {
            throw new BaseException(
                422,
                `Este contrato ya fue refinanciado en el contrato #${yaRefinanciado.id}`,
                'YA_REFINANCIADO',
            );
        }

        // La deuda a refinanciar es el saldo de lo NO cobrado. Se usa saldoCuota
        // y no montoCuota para respetar los pagos parciales.
        const impagas = original.cuotasPlan.filter(
            (c: any) => c.estado !== 'pagada' && c.estado !== 'refinanciada',
        );
        const saldo = impagas.reduce((s: number, c: any) => s + Number(c.saldoCuota), 0);

        if (saldo <= 0) {
            throw new BaseException(422, 'El contrato no tiene saldo pendiente para refinanciar', 'SIN_SALDO');
        }

        const n = parseInt(data.cuotas, 10);
        const fechaInicio = data.fechaInicio ?? new Date().toISOString().slice(0, 10);
        const diaVencimiento = data.diaVencimiento ?? original.diaVencimiento;
        const tasaMensual = data.tasaMensual !== undefined && data.tasaMensual !== null && data.tasaMensual !== ''
            ? data.tasaMensual
            : null;

        return prisma.$transaction(async (tx) => {
            const nueva = await tx.financiacion.create({
                data: {
                    ventaId: original.ventaId,
                    clienteId: original.clienteId,
                    cobradorId: data.cobradorId ?? original.cobradorId,
                    sucursalId: original.sucursalId,
                    montoFinanciado: saldo,
                    // La refinanciación hereda la moneda: el saldo es esa deuda.
                    moneda: original.moneda,
                    cuotas: n,
                    diaVencimiento,
                    fechaInicio: new Date(fechaInicio),
                    ...(tasaMensual !== null ? { tasaMensual } : {}),
                    observaciones: data.observaciones ?? `Refinanciación del contrato #${original.id}`,
                    refinanciaAId: original.id,
                    concesionariaId: original.concesionariaId,
                },
            });

            await tx.cuota.createMany({
                data: planDeCuotas(saldo, n, tasaMensual, fechaInicio, diaVencimiento)
                    .map(c => ({ ...c, financiacionId: nueva.id })),
            });

            // Las cuotas viejas impagas no se cobraron: su saldo se mudó al
            // contrato nuevo. Marcarlas 'pagada' inflaría la cobranza, y dejarlas
            // pendientes contaría la deuda dos veces.
            await tx.cuota.updateMany({
                where: { id: { in: impagas.map((c: any) => c.id) } },
                data: { estado: 'refinanciada' as any, saldoCuota: 0 },
            });

            await tx.financiacion.update({
                where: { id: original.id },
                data: { estado: 'refinanciada' },
            });

            const completa = await tx.financiacion.findUnique({
                where: { id: nueva.id },
                include: { cuotasPlan: { where: { deletedAt: null }, orderBy: { nroCuota: 'asc' } }, venta: { include: { vehiculo: true } }, cliente: true },
            });
            return this.mapToEntity(completa);
        });
    }

    private mapToEntity(f: any): Financiacion {
        return new Financiacion(
            f.id,
            f.concesionariaId,
            f.sucursalId ?? null,
            f.ventaId,
            f.clienteId,
            f.cobradorId,
            Number(f.montoFinanciado),
            f.moneda ?? 'ARS',
            f.cuotas,
            f.diaVencimiento,
            f.tasaMensual !== null && f.tasaMensual !== undefined ? Number(f.tasaMensual) : null,
            f.fechaInicio,
            f.estado,
            f.observaciones ?? null,
            f.refinanciaAId ?? null,
            f.createdAt,
            f.updatedAt,
            f.deletedAt,
            f.venta,
            f.cliente,
            f.cuotasPlan,
            f.refinanciaA ?? null,
            // La relación es una lista por la limitación del schema, pero el
            // use-case garantiza a lo sumo una: se expone como objeto.
            Array.isArray(f.refinanciadaPor) ? (f.refinanciadaPor[0] ?? null) : (f.refinanciadaPor ?? null)
        );
    }

    private mapCuotaToEntity(c: any): Cuota {
        return new Cuota(
            c.id,
            c.financiacionId,
            c.nroCuota,
            Number(c.montoCuota),
            Number(c.saldoCuota),
            c.vencimiento,
            c.estado,
            c.createdAt,
            c.updatedAt
        );
    }
}
