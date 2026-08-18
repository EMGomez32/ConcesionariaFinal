import { BaseException, NotFoundException } from '../../../domain/exceptions/BaseException';
import { IComprobanteAfipRepository } from '../../../domain/repositories/IComprobanteAfipRepository';
import { ComprobanteAfip } from '../../../domain/entities/ComprobanteAfip';
import { mapToEntity } from '../../../infrastructure/database/repositories/PrismaComprobanteAfipRepository';
import { withTenantTransaction } from '../../../infrastructure/database/unitOfWork';
import { afipServiceFor } from '../../../infrastructure/afip/AfipServiceFactory';
import prisma from '../../../infrastructure/database/prisma';
import {
    ALICUOTA_IVA_DEFAULT,
    CBTE_CODE,
    buildAfipQrUrl,
    condIvaReceptorId,
    descomponerImporte,
    determinarTipoComprobante,
    docCodeFor,
    monedaAfip,
} from '../../../domain/services/afip/fiscal';

/**
 * Emite la factura electrónica AFIP de una venta:
 *   1. Valida datos fiscales del emisor (concesionaria) y del receptor (cliente).
 *   2. Determina el tipo (A si receptor RI, B si consumidor final; C si el emisor
 *      no es RI) y descompone neto + IVA a partir del precio de venta.
 *   3. Numera de forma gapless (lock por punto de venta + tipo), pide el CAE al
 *      servicio AFIP (mock en Corte 1) y persiste el comprobante — todo atómico.
 *
 * La venta ↔ comprobante es 1:1 (unique en ventaId): una venta se factura una vez.
 */
export class EmitirFacturaAfip {
    constructor(private readonly comprobanteRepo: IComprobanteAfipRepository) { }

    async execute(ventaId: number): Promise<ComprobanteAfip> {
        // Lectura tenant-scoped (cliente extendido): trae la venta con el receptor
        // (cliente) y el emisor (concesionaria con sus datos fiscales).
        const venta = await prisma.venta.findFirst({
            where: { id: ventaId },
            include: { cliente: true, concesionaria: true },
        }) as any;
        if (!venta) throw new NotFoundException('Venta');

        // Ya facturada → 409 (el unique en ventaId también lo blinda a nivel DB).
        const yaEmitido = await this.comprobanteRepo.findByVenta(ventaId);
        if (yaEmitido) {
            throw new BaseException(409, 'La venta ya tiene un comprobante fiscal emitido', 'COMPROBANTE_YA_EMITIDO');
        }

        const emisor = venta.concesionaria;
        const receptorCliente = venta.cliente;

        // ── Validación de datos fiscales del EMISOR ───────────────────────────
        const cuitEmisor = Number(String(emisor?.cuit ?? '').replace(/\D/g, ''));
        if (!cuitEmisor) {
            throw new BaseException(422, 'La concesionaria no tiene CUIT cargado para facturar', 'EMISOR_SIN_CUIT');
        }
        if (!emisor?.condicionIva) {
            throw new BaseException(422, 'Configurá la condición frente al IVA de la concesionaria', 'EMISOR_SIN_CONDICION_IVA');
        }
        if (!emisor?.puntoVenta) {
            throw new BaseException(422, 'Configurá el punto de venta de la concesionaria', 'EMISOR_SIN_PUNTO_VENTA');
        }

        // ── Entorno: en Corte 1 sólo se factura en modo mock ──────────────────
        // Todavía no hay adapter real (WSAA/WSFEv1 llegan en el Corte 2). Si el
        // tenant quedó marcado en homologación/producción, se corta acá para NO
        // emitir un CAE simulado haciéndolo pasar por real.
        if (emisor.afipEntorno !== 'mock') {
            throw new BaseException(
                422,
                'La facturación electrónica real todavía no está habilitada (falta el certificado AFIP). La concesionaria debe estar en modo mock.',
                'AFIP_ENTORNO_NO_DISPONIBLE',
            );
        }
        const afip = afipServiceFor(emisor.afipEntorno);

        // ── Moneda: en Corte 1 sólo se factura en ARS ─────────────────────────
        // USD es una moneda de primera clase en la venta (venta.schema acepta
        // 'USD'), pero AFIP exige la cotización oficial del día para una factura en
        // moneda extranjera. Como todavía se emite con cotización 1 (fija), se corta
        // acá para no emitir un comprobante con cotización incorrecta. La cotización
        // real del día llega en el Corte 2.
        if ((venta.moneda ?? 'ARS') !== 'ARS') {
            throw new BaseException(
                422,
                'La facturación en moneda extranjera todavía no está disponible (falta la cotización oficial AFIP). Emití la venta en ARS.',
                'AFIP_MONEDA_NO_DISPONIBLE',
            );
        }

        // ── Receptor + tipo de comprobante ────────────────────────────────────
        const receptorCond = receptorCliente?.condicionIva ?? 'consumidor_final';
        const tipo = determinarTipoComprobante(emisor.condicionIva, receptorCond);
        const docTipo = docCodeFor(receptorCliente?.tipoDoc);
        const docNroStr = String(receptorCliente?.dni ?? '').replace(/\D/g, '');
        const docNro = docNroStr ? Number(docNroStr) : 0;

        // Factura A exige que el receptor sea RI e identificado con CUIT.
        if (tipo === 'factura_a' && (docTipo !== 80 || !docNro)) {
            throw new BaseException(
                422,
                'Para Factura A el cliente debe estar identificado con CUIT',
                'RECEPTOR_SIN_CUIT',
            );
        }

        // ── Importes (el precio de venta se toma como bruto, IVA incluido) ────
        const { neto, iva, total, alicuota } = descomponerImporte(
            Number(venta.precioVenta),
            ALICUOTA_IVA_DEFAULT,
            tipo,
        );
        const moneda = monedaAfip(venta.moneda);
        // NOTA: para ventas en USD, AFIP requiere la cotización a ARS del día. En
        // Corte 1 se emite con cotización 1 (el grueso de las ventas es en ARS);
        // la cotización multi-moneda queda para el Corte 2.
        const cotizacion = 1;

        const tenantId: number = venta.concesionariaId;
        const puntoVenta: number = emisor.puntoVenta;
        const tipoCbte = CBTE_CODE[tipo];
        // Fecha del comprobante normalizada a medianoche UTC: la columna es @db.Date
        // (Prisma trunca en UTC) y la fecha que se manda a AFIP (FchCbte) se deriva de
        // los MISMOS componentes UTC. Así la fecha persistida, la del CAE y la del QR
        // coinciden siempre, sin depender de la zona horaria del proceso.
        const ahora = new Date();
        const fechaComprobante = new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), ahora.getUTCDate()));
        const fechaAfip = yyyymmdd(fechaComprobante);

        // ── Numeración + emisión + persistencia (atómico) ─────────────────────
        // El lock por (tenant, punto de venta, tipo) serializa emisiones concurrentes
        // para que la numeración sea correlativa y sin huecos (requisito de AFIP).
        // El servicio mock resuelve el CAE en memoria (sin I/O de red), así que no
        // hay una llamada externa lenta bloqueando la transacción.
        try {
            return await withTenantTransaction(async (tx) => {
                await tx.$executeRaw`SELECT pg_advisory_xact_lock(${tenantId}::int, ${puntoVenta * 100 + tipoCbte}::int)`;

                // Último número de este (tenant, tipo, punto de venta). El tx raw NO
                // pasa por la extensión → se filtra tenant + soft-delete a mano.
                const agg = await tx.comprobanteAfip.aggregate({
                    _max: { numero: true },
                    where: { concesionariaId: tenantId, tipoComprobante: tipo, puntoVenta, deletedAt: null },
                });
                const numero = (agg._max.numero ?? 0) + 1;

                const emision = await afip.emitirCae({
                    cuit: cuitEmisor,
                    puntoVenta,
                    tipoCbte,
                    concepto: 1,
                    docTipo,
                    docNro,
                    condIvaReceptorId: condIvaReceptorId(receptorCond),
                    numero,
                    fecha: fechaAfip,
                    neto,
                    iva,
                    total,
                    alicuota,
                    moneda,
                    cotizacion,
                });
                if (!emision.ok || !emision.cae) {
                    // En Corte 2 (AFIP real) esto persistirá el comprobante en estado
                    // 'error' para reintentar; en mock nunca ocurre.
                    throw new BaseException(502, emision.error || 'AFIP rechazó la emisión del comprobante', 'AFIP_RECHAZO');
                }

                const caeVto = emision.caeVencimiento ? parseYyyymmdd(emision.caeVencimiento) : null;
                const qrUrl = buildAfipQrUrl({
                    ver: 1,
                    fecha: `${fechaAfip.slice(0, 4)}-${fechaAfip.slice(4, 6)}-${fechaAfip.slice(6, 8)}`,
                    cuit: cuitEmisor,
                    ptoVta: puntoVenta,
                    tipoCmp: tipoCbte,
                    nroCmp: numero,
                    importe: total,
                    moneda,
                    ctz: cotizacion,
                    tipoDocRec: docTipo,
                    nroDocRec: docNro,
                    tipoCodAut: 'E',
                    codAut: Number(emision.cae),
                });

                const creado = await tx.comprobanteAfip.create({
                    data: {
                        concesionariaId: tenantId,
                        ventaId,
                        tipoComprobante: tipo,
                        puntoVenta,
                        numero,
                        concepto: 1,
                        fechaComprobante,
                        receptorNombre: receptorCliente?.nombre ?? 'Consumidor final',
                        receptorDocTipo: docTipo,
                        receptorDocNro: docNroStr || '0',
                        receptorCondIva: receptorCond,
                        moneda,
                        cotizacion,
                        neto,
                        alicuotaIva: alicuota,
                        iva,
                        total,
                        estado: 'emitida',
                        entorno: afip.entorno(),
                        cae: emision.cae,
                        caeVencimiento: caeVto,
                        qrData: qrUrl,
                    },
                });

                return mapToEntity(creado);
            });
        } catch (e: any) {
            // Carrera perdida por el unique (ventaId o número): friendly 409.
            if (e?.code === 'P2002') {
                throw new BaseException(409, 'La venta ya tiene un comprobante fiscal emitido', 'COMPROBANTE_YA_EMITIDO');
            }
            throw e;
        }
    }
}

/** Date → 'YYYYMMDD' (componentes UTC, TZ-independiente). */
function yyyymmdd(d: Date): string {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}${m}${day}`;
}

/** 'YYYYMMDD' → Date (medianoche UTC, para columna @db.Date). */
function parseYyyymmdd(s: string): Date {
    return new Date(Date.UTC(Number(s.slice(0, 4)), Number(s.slice(4, 6)) - 1, Number(s.slice(6, 8))));
}
