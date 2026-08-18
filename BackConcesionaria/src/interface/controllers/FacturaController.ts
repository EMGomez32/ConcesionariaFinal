import { Request, Response, NextFunction } from 'express';
import prisma from '../../infrastructure/database/prisma';
import { NotFoundException } from '../../domain/exceptions/BaseException';
import { PrismaComprobanteAfipRepository } from '../../infrastructure/database/repositories/PrismaComprobanteAfipRepository';
import { EmitirFacturaAfip } from '../../application/use-cases/afip/EmitirFacturaAfip';
import { audit } from '../../infrastructure/security/audit';
import { resolveBranding } from './pdf/branding';
import { renderFacturaAfip, nuevaFacturaDoc, FacturaPdfData } from './pdf/facturaAfip';
import { CBTE_CODE } from '../../domain/services/afip/fiscal';
import type { TipoComprobanteAfip } from '@prisma/client';

const comprobanteRepo = new PrismaComprobanteAfipRepository();
const emitirFacturaUC = new EmitirFacturaAfip(comprobanteRepo);

// Las rutas son planas (/:id sin restricción a dígitos): un id no numérico
// (/ventas/abc/factura) llegaría como NaN a Prisma y reventaría en un 500. Se
// valida acá y se responde 404 como cualquier venta inexistente.
function parseVentaId(raw: string | string[] | undefined): number {
    const id = Number(raw);
    if (!Number.isInteger(id) || id <= 0) throw new NotFoundException('Venta');
    return id;
}

// Datos de marca + fiscales del emisor que el PDF necesita de la concesionaria.
const emisorSelect = {
    nombre: true, razonSocial: true, cuit: true, email: true, telefono: true, direccion: true,
    condicionIva: true, puntoVenta: true, afipEntorno: true,
    logoStorageKey: true, colorPrimario: true, colorSecundario: true, pdfPie: true, sitioWeb: true,
} as const;

// Etiqueta legible del tipo de documento del receptor a partir del código AFIP.
const docLabel = (code: number): string => {
    switch (code) {
        case 80: return 'CUIT';
        case 86: return 'CUIL';
        case 96: return 'DNI';
        default: return 'Doc';
    }
};

export class FacturaController {
    // POST /api/ventas/:id/factura → emite la factura electrónica (CAE) de la venta.
    static async emitir(req: Request, res: Response, next: NextFunction) {
        try {
            const id = parseVentaId(req.params.id);
            const comprobante = await emitirFacturaUC.execute(id);
            await audit({
                entidad: 'ComprobanteAfip',
                accion: 'create',
                entidadId: comprobante.id,
                detalle: `Factura ${comprobante.tipoComprobante} ${String(comprobante.puntoVenta).padStart(4, '0')}-${String(comprobante.numero).padStart(8, '0')} emitida (venta ${id}, CAE ${comprobante.cae})`,
            });
            res.status(201).json(comprobante);
        } catch (error) {
            next(error);
        }
    }

    // GET /api/ventas/:id/factura → comprobante fiscal de la venta (o 404 si no hay).
    static async getByVenta(req: Request, res: Response, next: NextFunction) {
        try {
            const id = parseVentaId(req.params.id);
            const comprobante = await comprobanteRepo.findByVenta(id);
            if (!comprobante) throw new NotFoundException('Comprobante fiscal');
            res.json(comprobante);
        } catch (error) {
            next(error);
        }
    }

    // GET /api/ventas/:id/factura/pdf → PDF de la factura electrónica (con CAE + QR).
    static async pdf(req: Request, res: Response, next: NextFunction) {
        try {
            const id = parseVentaId(req.params.id);
            const comprobante = await comprobanteRepo.findByVenta(id);
            if (!comprobante) throw new NotFoundException('Comprobante fiscal');

            const venta = await prisma.venta.findFirst({
                where: { id },
                include: {
                    cliente: true,
                    vehiculo: true,
                    concesionaria: { select: emisorSelect },
                },
            }) as any;
            if (!venta) throw new NotFoundException('Venta');

            const conc = venta.concesionaria;
            const v = venta.vehiculo;
            const detalle = [
                `${v?.marca || ''} ${v?.modelo || ''}`.trim(),
                v?.version || '',
                v?.anio ? `Año ${v.anio}` : '',
                v?.dominio ? `Dominio ${v.dominio}` : '',
            ].filter(Boolean).join(' · ') || 'Vehículo';

            const data: FacturaPdfData = {
                tipoComprobante: comprobante.tipoComprobante as TipoComprobanteAfip,
                codigoAfip: CBTE_CODE[comprobante.tipoComprobante],
                puntoVenta: comprobante.puntoVenta,
                numero: comprobante.numero,
                fechaComprobante: comprobante.fechaComprobante,
                emisorNombre: conc?.razonSocial || conc?.nombre || 'AUTENZA',
                emisorRazonSocial: conc?.razonSocial ?? null,
                emisorCuit: conc?.cuit ?? null,
                emisorCondIva: conc?.condicionIva ?? null,
                emisorDireccion: conc?.direccion ?? null,
                receptorNombre: comprobante.receptorNombre,
                receptorDocLabel: docLabel(comprobante.receptorDocTipo),
                receptorDocNro: comprobante.receptorDocNro,
                receptorCondIva: comprobante.receptorCondIva,
                receptorDireccion: venta.cliente?.direccion ?? null,
                detalle,
                moneda: comprobante.moneda,
                neto: comprobante.neto,
                alicuotaIva: comprobante.alicuotaIva,
                iva: comprobante.iva,
                total: comprobante.total,
                cae: comprobante.cae || '—',
                caeVencimiento: comprobante.caeVencimiento,
                qrUrl: comprobante.qrData || '',
                esMock: comprobante.entorno === 'mock',
            };

            const letra = data.tipoComprobante.replace('factura_', '').toUpperCase();
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader(
                'Content-Disposition',
                `attachment; filename="factura-${letra}-${String(comprobante.puntoVenta).padStart(4, '0')}-${String(comprobante.numero).padStart(8, '0')}.pdf"`,
            );

            const brand = await resolveBranding(conc);
            const doc = nuevaFacturaDoc();
            doc.pipe(res);
            await renderFacturaAfip(doc, data, brand);
            doc.end();
        } catch (error) {
            next(error);
        }
    }
}
