import { IComprobanteAfipRepository } from '../../../domain/repositories/IComprobanteAfipRepository';
import { ComprobanteAfip } from '../../../domain/entities/ComprobanteAfip';
import prisma from '../prisma';

/**
 * Lecturas de comprobantes AFIP. Van por el cliente EXTENDIDO de Prisma, así que
 * ya quedan filtradas por tenant + soft-delete automáticamente. La ESCRITURA
 * (numeración + emisión + persistencia atómica) NO vive acá: la hace
 * EmitirFacturaAfip dentro de withTenantTransaction, porque necesita numerar y
 * pedir el CAE en una sola transacción.
 */
export class PrismaComprobanteAfipRepository implements IComprobanteAfipRepository {
    async findByVenta(ventaId: number): Promise<ComprobanteAfip | null> {
        const c = await prisma.comprobanteAfip.findFirst({ where: { ventaId } });
        return c ? mapToEntity(c) : null;
    }
}

export function mapToEntity(c: any): ComprobanteAfip {
    return new ComprobanteAfip(
        c.id,
        c.concesionariaId,
        c.ventaId,
        c.tipoComprobante,
        c.puntoVenta,
        c.numero,
        c.concepto,
        c.fechaComprobante,
        c.receptorNombre,
        c.receptorDocTipo,
        c.receptorDocNro,
        c.receptorCondIva,
        c.moneda,
        Number(c.cotizacion),
        Number(c.neto),
        Number(c.alicuotaIva),
        Number(c.iva),
        Number(c.total),
        c.estado,
        c.entorno,
        c.cae ?? null,
        c.caeVencimiento ?? null,
        c.qrData ?? null,
        c.errorMsg ?? null,
        c.createdAt,
        c.updatedAt,
    );
}
