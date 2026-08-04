import { Request, Response, NextFunction } from 'express';
import PDFDocument from 'pdfkit';
import prisma from '../../infrastructure/database/prisma';
import { NotFoundException, BaseException } from '../../domain/exceptions/BaseException';
import { resolveBranding, drawEncabezado, drawPie } from './pdf/branding';
import { renderEstadoCuenta, EstadoCuentaData, FinanciacionLinea } from './pdf/estadoCuenta';
import { renderLiquidacionComisiones, LiquidacionData, LiquidacionLinea, LiquidacionTotal } from './pdf/liquidacionComisiones';
import { storage } from '../../infrastructure/storage/LocalStorageAdapter';
import { sniffImageType } from '../middlewares/upload.middleware';
import { drawTopBand } from './pdf/branding';
import { context } from '../../infrastructure/security/context';

// Campos de marca que cada PDF necesita de su concesionaria (logo/colores/pie).
const marcaSelect = {
    nombre: true, cuit: true, email: true, telefono: true,
    logoStorageKey: true, colorPrimario: true, colorSecundario: true, pdfPie: true, sitioWeb: true,
} as const;

const money = (n: unknown, moneda = 'ARS') => {
    const simbolo = moneda === 'USD' ? 'US$' : '$';
    return `${simbolo}${Number(n ?? 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const fecha = (d: Date | string | null | undefined) =>
    d ? new Date(d).toLocaleDateString('es-AR') : '—';

// Convierte un valor de enum (estado/método) en una etiqueta legible:
// 'convertida_en_venta' -> 'Convertida en venta', 'transferencia' -> 'Transferencia'.
const prettyEnum = (s: unknown) => {
    const t = String(s ?? '').trim();
    if (!t) return '—';
    return t.charAt(0).toUpperCase() + t.slice(1).replace(/_/g, ' ');
};

export class ComprobanteController {
    // GET /api/vehiculos/catalogo/pdf → catálogo de vehículos en PDF (grilla).
    // De cara al cliente: marca del tenant, foto principal, specs y precio de cada
    // unidad. Acepta los MISMOS filtros que el listado (search/estado/tipo/sucursal)
    // para exportar "lo que se está viendo". No muestra datos internos.
    static async catalogoPdf(req: Request, res: Response, next: NextFunction) {
        try {
            // ── WHERE: misma semántica que VehiculoController.getAll ───────────────
            const { search, marca, modelo, dominio, estado, tipo, sucursalId, sortBy, sortOrder } = req.query;
            const where: any = {};
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
            if (estado) {
                const estados = String(estado).split(',').map((e) => e.trim()).filter(Boolean);
                where.estado = estados.length > 1 ? { in: estados } : estados[0];
            }
            if (tipo) where.tipo = tipo;
            if (sucursalId) where.sucursalId = Number(sucursalId);

            const SORTABLE = ['createdAt', 'fechaIngreso', 'precioLista', 'anio', 'kmIngreso', 'marca', 'modelo'];
            const orderKey = SORTABLE.includes(String(sortBy)) ? String(sortBy) : 'createdAt';
            const orderDir = sortOrder === 'asc' ? 'asc' : 'desc';

            // Tope defensivo: un catálogo gigante no tiene sentido y evita leer miles
            // de fotos. Se muestran las primeras CAP según el orden pedido.
            const CAP = 60;
            const total = await prisma.vehiculo.count({ where });
            const vehiculos = await prisma.vehiculo.findMany({
                where,
                orderBy: [{ [orderKey]: orderDir }, { id: 'asc' }],
                take: CAP,
                include: {
                    concesionaria: { select: marcaSelect },
                    archivos: {
                        where: { deletedAt: null, tipo: 'foto' },
                        orderBy: [{ esPrincipal: 'desc' }, { createdAt: 'asc' }, { id: 'asc' }],
                        // La ficha (1 vehículo) lee TODAS las fotos hasta la primera
                        // legible; el catálogo lo aproxima con un tope generoso: acota
                        // las lecturas a lo largo de hasta 60 unidades sin caer en el
                        // caso raro de mostrar "Sin foto" por 4 fotos no-embebibles
                        // (webp/heic) al inicio teniendo un JPEG más atrás.
                        take: 12,
                        select: { storageKey: true },
                    },
                },
            }) as any[];

            // Foto principal legible (PNG/JPEG) por vehículo, pre-leída antes de dibujar.
            const fotos = new Map<number, Buffer>();
            for (const v of vehiculos) {
                for (const a of (v.archivos ?? [])) {
                    if (!a.storageKey) continue;
                    try {
                        const buf = await storage.read(a.storageKey);
                        if (sniffImageType(buf)) { fotos.set(v.id, buf); break; }
                    } catch { /* ilegible: probar la siguiente */ }
                }
            }

            // Marca: la del primer vehículo (todos son del mismo tenant salvo super_admin);
            // si no hay vehículos, la del tenant del actor; si tampoco, AUTENZA.
            const tenantId = context.getUser()?.concesionariaId ?? null;
            const conc = vehiculos[0]?.concesionaria
                ?? (tenantId ? await prisma.concesionaria.findFirst({ where: { id: tenantId }, select: marcaSelect }) : null);
            const brand = await resolveBranding(conc);
            const accent = brand.accent;
            const muted = brand.muted;

            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', 'attachment; filename="catalogo-vehiculos.pdf"');
            const doc = new PDFDocument({ size: 'A4', margin: 40 });
            doc.pipe(res);

            const hoyStr = new Date().toLocaleDateString('es-AR');
            const totalPages = Math.max(1, Math.ceil(vehiculos.length / 6));

            // Encabezado compacto (todas las páginas): banda + logo/nombre + título.
            const drawHeader = () => {
                drawTopBand(doc, brand);
                if (brand.logo) {
                    try { doc.image(brand.logo, 40, 20, { fit: [130, 30] }); } catch { /* buffer inválido */ }
                } else {
                    doc.fillColor(accent).fontSize(15).font('Helvetica-Bold')
                        .text(brand.nombre, 40, 24, { width: 300, height: 20, lineBreak: false, ellipsis: true });
                }
                doc.fillColor('#111827').fontSize(13).font('Helvetica-Bold')
                    .text('CATÁLOGO DE VEHÍCULOS', 255, 26, { width: 300, align: 'right' });
                doc.moveTo(40, 58).lineTo(555, 58).strokeColor('#e5e7eb').stroke();
            };

            // Pie compacto (todas las páginas): tenant · resumen · página x/y.
            // OJO con la Y: el borde inferior imprimible es 841.89 - margin(40) = 801.89.
            // Un texto por debajo de eso dispara un salto de página automático en pdfkit
            // (cada línea del pie caería en su propia página fantasma). Por eso va en 782/788.
            const drawFooter = (page: number) => {
                doc.moveTo(40, 782).lineTo(555, 782).strokeColor('#e5e7eb').stroke();
                doc.fillColor(muted).fontSize(8).font('Helvetica');
                // `height` en las tres: sin él, un nombre de tenant largo envuelve a 2
                // líneas (lineBreak:false no alcanza para el ellipsis) y la 2ª línea
                // cruza el margen → página fantasma. Con height quedan en una sola línea.
                doc.text(brand.branded ? brand.nombre : 'AUTENZA', 40, 788, { width: 200, height: 10, lineBreak: false, ellipsis: true });
                const resumen = total > CAP ? `${vehiculos.length} de ${total} unidades · ${hoyStr}` : `${total} ${total === 1 ? 'unidad' : 'unidades'} · ${hoyStr}`;
                doc.text(resumen, 197, 788, { width: 200, height: 10, align: 'center', lineBreak: false });
                doc.text(`Página ${page} de ${totalPages}`, 355, 788, { width: 200, height: 10, align: 'right', lineBreak: false });
            };

            // Una tarjeta de vehículo en (cx, cy). Ancho 250, alto visual 210.
            const drawCard = (v: any, foto: Buffer | null, cx: number, cy: number) => {
                doc.roundedRect(cx, cy, 250, 210, 6).lineWidth(0.8).strokeColor('#e5e7eb').stroke();
                // Foto (o placeholder).
                const px = cx + 10, py = cy + 10, pw = 230, ph = 125;
                if (foto) {
                    try { doc.image(foto, px, py, { fit: [pw, ph], align: 'center', valign: 'center' }); }
                    catch { doc.save().rect(px, py, pw, ph).fill('#f3f4f6').restore(); }
                } else {
                    doc.save().rect(px, py, pw, ph).fill('#f3f4f6').restore();
                    doc.fillColor(muted).fontSize(9).font('Helvetica').text('Sin foto', px, py + ph / 2 - 5, { width: pw, align: 'center' });
                }
                const tx = cx + 12, tw = 226;
                const titulo = `${v.marca || ''} ${v.modelo || ''}`.trim() || 'Vehículo';
                doc.fillColor('#111827').fontSize(12).font('Helvetica-Bold')
                    .text(titulo, tx, cy + 144, { width: tw, height: 15, lineBreak: false, ellipsis: true });
                const sub = [v.version, v.anio ? String(v.anio) : ''].filter(Boolean).join('  ·  ');
                doc.fillColor(muted).fontSize(8.5).font('Helvetica')
                    .text(sub || (v.tipo === 'CERO_KM' ? '0 km' : 'Usado'), tx, cy + 161, { width: tw, height: 12, lineBreak: false, ellipsis: true });
                const specs = [
                    v.kmIngreso != null ? `${Number(v.kmIngreso).toLocaleString('es-AR')} km` : null,
                    v.color || null,
                ].filter(Boolean).join('  ·  ');
                if (specs) {
                    doc.fillColor(muted).fontSize(8).font('Helvetica')
                        .text(specs, tx, cy + 176, { width: tw, height: 11, lineBreak: false, ellipsis: true });
                }
                doc.fillColor(accent).fontSize(13).font('Helvetica-Bold')
                    .text(v.precioLista ? money(v.precioLista, v.moneda || 'ARS') : 'Consultar', tx, cy + 190, { width: tw, height: 16, lineBreak: false, ellipsis: true });
            };

            drawHeader();
            if (vehiculos.length === 0) {
                doc.fillColor(muted).fontSize(12).font('Helvetica')
                    .text('No hay vehículos que coincidan con los filtros seleccionados.', 40, 120, { width: 515, align: 'center' });
            }
            const colX = [40, 305];
            for (let i = 0; i < vehiculos.length; i++) {
                if (i > 0 && i % 6 === 0) {
                    drawFooter(i / 6);
                    doc.addPage();
                    drawHeader();
                }
                const pos = i % 6;
                drawCard(vehiculos[i], fotos.get(vehiculos[i].id) ?? null, colX[pos % 2], 72 + Math.floor(pos / 2) * 220);
            }
            drawFooter(totalPages);

            doc.end();
        } catch (error) {
            next(error);
        }
    }

    // GET /api/vehiculos/:id/ficha → ficha del vehículo en PDF (de cara al cliente).
    // Una página con la marca del tenant, foto principal, specs y precio de lista.
    // NO muestra datos internos (precio de compra, gastos, proveedor).
    static async vehiculoFichaPdf(req: Request, res: Response, next: NextFunction) {
        try {
            const id = Number(req.params.id);
            const v = await prisma.vehiculo.findFirst({
                where: { id },
                include: {
                    sucursal: { select: { nombre: true } },
                    concesionaria: { select: marcaSelect },
                    // Sólo las fotos (no documentos/comprobantes). La marcada como
                    // principal primero; si no hay ninguna, la más vieja. El loop de
                    // abajo toma la primera legible (PNG/JPEG) de ese orden.
                    archivos: {
                        where: { deletedAt: null, tipo: 'foto' },
                        orderBy: [{ esPrincipal: 'desc' }, { createdAt: 'asc' }, { id: 'asc' }],
                        select: { storageKey: true },
                    },
                },
            }) as any;

            if (!v) throw new NotFoundException('Vehículo');

            const moneda = v.moneda || 'ARS';

            // Foto principal: la primera 'foto' que sea PNG/JPEG legible. pdfkit no
            // embebe webp/gif/heic, así que se sniffean los magic bytes y se descarta
            // lo que no sirva (mejor sin foto que romper el PDF).
            let fotoBuf: Buffer | null = null;
            for (const a of (v.archivos ?? [])) {
                if (!a.storageKey) continue;
                try {
                    const buf = await storage.read(a.storageKey);
                    if (sniffImageType(buf)) { fotoBuf = buf; break; }
                } catch { /* archivo ilegible: se prueba con la próxima foto */ }
            }

            // Nombre de archivo seguro (sin acentos ni espacios).
            const slug = `${v.marca || ''}-${v.modelo || ''}`
                .normalize('NFD').replace(/[̀-ͯ]/g, '')
                .replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'vehiculo';

            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="ficha-${slug}-${v.id}.pdf"`);

            const doc = new PDFDocument({ size: 'A4', margin: 50 });
            doc.pipe(res);

            // ── Marca (logo/colores del tenant, o AUTENZA por defecto) ────────────
            const brand = await resolveBranding(v.concesionaria);
            const accent = brand.accent;
            const muted = brand.muted;

            const infoLineas = [
                v.concesionaria?.cuit ? `CUIT: ${v.concesionaria.cuit}` : '',
                v.sucursal?.nombre ? `Sucursal: ${v.sucursal.nombre}` : '',
                v.concesionaria?.telefono ? `Tel: ${v.concesionaria.telefono}` : '',
            ].filter(Boolean);
            drawEncabezado(doc, brand, infoLineas);

            doc.fillColor('#111827').fontSize(16).font('Helvetica-Bold')
                .text('FICHA DEL VEHÍCULO', 50, 50, { align: 'right' });
            doc.fillColor(muted).fontSize(10).font('Helvetica')
                .text(fecha(new Date()), { align: 'right' });

            doc.moveTo(50, 130).lineTo(545, 130).strokeColor('#e5e7eb').stroke();

            // ── Título del vehículo ───────────────────────────────────────────────
            // Los textos de una sola línea llevan `height` además de lineBreak:false:
            // el ellipsis de pdfkit sólo trunca de verdad cuando hay height (si no,
            // un texto largo envuelve en varias líneas y pisa la foto / el bloque de
            // abajo, que están en Y fijo). Mismo criterio que el nombre del encabezado.
            let y = 150;
            const titulo = `${v.marca || ''} ${v.modelo || ''}`.trim() || 'Vehículo';
            doc.fillColor('#111827').fontSize(20).font('Helvetica-Bold')
                .text(titulo, 50, y, { width: 495, height: 24, lineBreak: false, ellipsis: true });
            y += 28;
            const subtitulo = [v.version, v.anio ? String(v.anio) : ''].filter(Boolean).join('  ·  ');
            if (subtitulo) {
                doc.fillColor(muted).fontSize(12).font('Helvetica')
                    .text(subtitulo, 50, y, { width: 495, height: 16, lineBreak: false, ellipsis: true });
                y += 20;
            }
            y += 8;

            // ── Foto principal (o placeholder) ────────────────────────────────────
            const boxX = 50, boxW = 495, boxH = 215;
            if (fotoBuf) {
                try {
                    doc.image(fotoBuf, boxX, y, { fit: [boxW, boxH], align: 'center', valign: 'center' });
                } catch {
                    // Buffer válido para sniff pero no para pdfkit (raro): placeholder.
                    doc.save().rect(boxX, y, boxW, boxH).fill('#f3f4f6').restore();
                }
            } else {
                doc.save().rect(boxX, y, boxW, boxH).fill('#f3f4f6').restore();
                doc.fillColor(muted).fontSize(11).font('Helvetica')
                    .text('Sin foto disponible', boxX, y + boxH / 2 - 6, { width: boxW, align: 'center' });
            }
            y += boxH + 18;

            // ── Ficha técnica (2 columnas) ────────────────────────────────────────
            const specs: Array<[string, string]> = [
                ['Tipo', v.tipo === 'CERO_KM' ? '0 km' : 'Usado'],
                ['Año', v.anio ? String(v.anio) : '—'],
                ['Kilómetros', v.kmIngreso != null ? `${Number(v.kmIngreso).toLocaleString('es-AR')} km` : '—'],
                ['Color', v.color || '—'],
                ['Dominio', v.dominio || '—'],
            ];
            const colX = [50, 310];
            const rowH = 30;
            const specStartY = y;
            specs.forEach((s, i) => {
                const sx = colX[i % 2];
                const sy = specStartY + Math.floor(i / 2) * rowH;
                doc.fillColor(muted).fontSize(8.5).font('Helvetica-Bold').text(s[0].toUpperCase(), sx, sy, { width: 235 });
                doc.fillColor('#111827').fontSize(12).font('Helvetica')
                    .text(s[1], sx, sy + 11, { width: 235, height: 15, lineBreak: false, ellipsis: true });
            });
            y = specStartY + Math.ceil(specs.length / 2) * rowH + 8;

            // ── Precio destacado ──────────────────────────────────────────────────
            doc.moveTo(50, y).lineTo(545, y).strokeColor('#e5e7eb').stroke();
            y += 14;
            doc.fillColor(muted).fontSize(9).font('Helvetica-Bold').text('PRECIO', 50, y);
            // precioLista 0 (o ausente) => "Consultar": un auto no se lista en $0, y
            // el resto de la UI ya trata el 0 como "sin precio". Chequeo truthy.
            doc.fillColor(accent).fontSize(20).font('Helvetica-Bold')
                .text(v.precioLista ? money(v.precioLista, moneda) : 'Consultar', 50, y + 12, { width: 495, lineBreak: false });
            y += 46;

            // NOTA: a propósito NO se imprime `observaciones`. Es un campo de notas
            // genérico (sin input en el form; se puebla por API/migración) que puede
            // arrastrar apuntes internos —margen de negociación, desperfectos, datos
            // del titular anterior— y esta ficha va DE CARA AL CLIENTE. Si en el
            // futuro se quiere una descripción comercial, agregar un campo público
            // dedicado (p.ej. descripcionPublica) en vez de reusar observaciones.

            // ── Pie (marca del tenant, o AUTENZA por defecto) ─────────────────────
            drawPie(doc, brand);
            doc.fillColor(muted).fontSize(8).font('Helvetica')
                .text(`Ficha generada el ${new Date().toLocaleString('es-AR')}`, 50, 760, { align: 'center', width: 495 });
            doc.text('Datos informativos, no constituyen oferta contractual. Precio y disponibilidad sujetos a cambios sin previo aviso.',
                50, 772, { align: 'center', width: 495 });

            doc.end();
        } catch (error) {
            next(error);
        }
    }

    // GET /api/ventas/:id/comprobante  → PDF descargable del comprobante de venta.
    static async ventaPdf(req: Request, res: Response, next: NextFunction) {
        try {
            const id = Number(req.params.id);
            // El extension de Prisma no propaga el tipo de los `include`; se castea
            // a any como en el resto de los repos del proyecto.
            const venta = await prisma.venta.findFirst({
                where: { id },
                include: {
                    cliente: true,
                    vehiculo: true,
                    vendedor: { select: { nombre: true, email: true } },
                    sucursal: true,
                    concesionaria: { select: marcaSelect },
                    pagos: true,
                    extras: true,
                    canjes: { include: { vehiculo: { select: { marca: true, modelo: true, dominio: true } } } },
                },
            }) as any;

            if (!venta) throw new NotFoundException('Venta');

            const moneda = venta.moneda || 'ARS';
            const totalPagos = venta.pagos.reduce((s: number, p: any) => s + Number(p.monto), 0);
            const totalExtras = venta.extras.reduce((s: number, e: any) => s + Number(e.monto), 0);
            const totalVenta = Number(venta.precioVenta) + totalExtras;
            const saldo = totalVenta - totalPagos;

            // Cabeceras de descarga. Se genera en memoria y se hace pipe a la respuesta.
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="comprobante-venta-${venta.id}.pdf"`);

            const doc = new PDFDocument({ size: 'A4', margin: 50 });
            doc.pipe(res);

            // ── Marca (logo/colores del tenant, o AUTENZA por defecto) ────────────
            const brand = await resolveBranding(venta.concesionaria);
            const accent = brand.accent;
            const muted = brand.muted;

            // ── Encabezado ────────────────────────────────────────────────────────
            const infoLineas = [
                venta.concesionaria?.cuit ? `CUIT: ${venta.concesionaria.cuit}` : '',
                venta.sucursal?.nombre ? `Sucursal: ${venta.sucursal.nombre}` : '',
                venta.sucursal?.direccion || '',
            ].filter(Boolean);
            drawEncabezado(doc, brand, infoLineas);

            doc.fillColor('#111827').fontSize(16).font('Helvetica-Bold')
                .text('COMPROBANTE DE VENTA', 50, 50, { align: 'right' });
            doc.fillColor(muted).fontSize(10).font('Helvetica')
                .text(`N° ${String(venta.id).padStart(6, '0')}`, { align: 'right' })
                .text(`Fecha: ${fecha(venta.fechaVenta)}`, { align: 'right' });

            doc.moveTo(50, 130).lineTo(545, 130).strokeColor('#e5e7eb').stroke();

            // ── Cliente y vehículo ────────────────────────────────────────────────
            let y = 150;
            const bloque = (titulo: string, lineas: string[], x: number) => {
                doc.fillColor(accent).fontSize(9).font('Helvetica-Bold').text(titulo.toUpperCase(), x, y);
                doc.fillColor('#111827').fontSize(10).font('Helvetica');
                lineas.forEach((l, i) => doc.text(l, x, y + 15 + i * 14, { width: 230, lineBreak: false, ellipsis: true }));
            };

            bloque('Cliente', [
                venta.cliente?.nombre || '—',
                venta.cliente?.dni ? `DNI/CUIT: ${venta.cliente.dni}` : '',
                venta.cliente?.telefono ? `Tel: ${venta.cliente.telefono}` : '',
                venta.cliente?.email || '',
            ].filter(Boolean), 50);

            bloque('Vehículo', [
                `${venta.vehiculo?.marca || ''} ${venta.vehiculo?.modelo || ''}`.trim(),
                venta.vehiculo?.version || '',
                venta.vehiculo?.dominio ? `Dominio: ${venta.vehiculo.dominio}` : '',
                venta.vehiculo?.anio ? `Año: ${venta.vehiculo.anio}` : '',
            ].filter(Boolean), 310);

            y += 90;

            // ── Detalle de importes ───────────────────────────────────────────────
            const fila = (label: string, valor: string, negrita = false) => {
                doc.fillColor('#111827').fontSize(10).font(negrita ? 'Helvetica-Bold' : 'Helvetica');
                doc.text(label, 50, y, { width: 380 });
                doc.text(valor, 430, y, { width: 115, align: 'right' });
                y += 18;
            };

            doc.fillColor(accent).fontSize(9).font('Helvetica-Bold').text('DETALLE', 50, y);
            y += 16;
            doc.moveTo(50, y).lineTo(545, y).strokeColor('#e5e7eb').stroke();
            y += 8;

            fila(`Vehículo (${venta.formaPago})`, money(venta.precioVenta, moneda));
            for (const e of venta.extras) fila(`Extra: ${e.descripcion}`, money(e.monto, moneda));
            for (const c of venta.canjes) {
                const v = c.vehiculo;
                fila(`Canje: ${v?.marca || ''} ${v?.modelo || ''} ${v?.dominio ? `(${v.dominio})` : ''}`.trim(), `- ${money(c.valorTomado, moneda)}`);
            }

            y += 4;
            doc.moveTo(50, y).lineTo(545, y).strokeColor('#e5e7eb').stroke();
            y += 8;
            fila('TOTAL', money(totalVenta, moneda), true);
            fila('Pagado', money(totalPagos, moneda));
            fila('Saldo pendiente', money(saldo, moneda), true);

            // ── Pagos ─────────────────────────────────────────────────────────────
            if (venta.pagos.length > 0) {
                y += 14;
                doc.fillColor(accent).fontSize(9).font('Helvetica-Bold').text('PAGOS REGISTRADOS', 50, y);
                y += 16;
                for (const p of venta.pagos) {
                    doc.fillColor('#111827').fontSize(9).font('Helvetica');
                    doc.text(`${fecha(p.fecha)} — ${p.metodo}${p.referencia ? ` (${p.referencia})` : ''}`, 50, y, { width: 380 });
                    doc.text(money(p.monto, moneda), 430, y, { width: 115, align: 'right' });
                    y += 15;
                }
            }

            // ── Pie (marca del tenant, o AUTENZA por defecto) ─────────────────────
            drawPie(doc, brand);
            doc.fillColor(muted).fontSize(8).font('Helvetica')
                .text(
                    `Vendedor: ${venta.vendedor?.nombre || '—'}   ·   Generado el ${new Date().toLocaleString('es-AR')}`,
                    50, 760, { align: 'center', width: 495 }
                );
            doc.text('Documento no válido como factura. Comprobante interno de operación.', 50, 772, { align: 'center', width: 495 });

            doc.end();
        } catch (error) {
            next(error);
        }
    }

    // GET /api/financiaciones/cuotas/:cuotaId/recibo → PDF del recibo de pago de una cuota.
    static async cuotaReciboPdf(req: Request, res: Response, next: NextFunction) {
        try {
            const id = Number(req.params.cuotaId);
            const cuota = await prisma.cuota.findFirst({
                where: { id },
                include: {
                    pagos: { where: { deletedAt: null }, orderBy: { fechaPago: 'asc' } },
                    financiacion: {
                        include: {
                            cliente: true,
                            concesionaria: { select: marcaSelect },
                            sucursal: { select: { nombre: true, direccion: true } },
                            cobrador: { select: { nombre: true } },
                            venta: { include: { vehiculo: { select: { marca: true, modelo: true, dominio: true } } } },
                        },
                    },
                },
            }) as any;

            if (!cuota) throw new NotFoundException('Cuota');

            const fin = cuota.financiacion;
            const moneda = fin?.moneda || 'ARS';
            const cli = fin?.cliente;
            const veh = fin?.venta?.vehiculo;
            const totalPagado = cuota.pagos.reduce((s: number, p: any) => s + Number(p.monto), 0);
            const montoCuota = Number(cuota.montoCuota);
            const saldo = Number(cuota.saldoCuota);

            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="recibo-cuota-${cuota.id}.pdf"`);

            const doc = new PDFDocument({ size: 'A4', margin: 50 });
            doc.pipe(res);

            // ── Marca (logo/colores del tenant, o AUTENZA por defecto) ────────────
            const brand = await resolveBranding(fin?.concesionaria);
            const accent = brand.accent;
            const muted = brand.muted;

            // ── Encabezado ────────────────────────────────────────────────────────
            const infoLineas = [
                fin?.concesionaria?.cuit ? `CUIT: ${fin.concesionaria.cuit}` : '',
                fin?.sucursal?.nombre ? `Sucursal: ${fin.sucursal.nombre}` : '',
                fin?.sucursal?.direccion || '',
            ].filter(Boolean);
            drawEncabezado(doc, brand, infoLineas);

            doc.fillColor('#111827').fontSize(16).font('Helvetica-Bold')
                .text('RECIBO DE PAGO', 50, 50, { align: 'right' });
            doc.fillColor(muted).fontSize(10).font('Helvetica')
                .text(`Cuota N° ${String(cuota.id).padStart(6, '0')}`, { align: 'right' })
                .text(`Emitido: ${fecha(new Date())}`, { align: 'right' });

            doc.moveTo(50, 130).lineTo(545, 130).strokeColor('#e5e7eb').stroke();

            // ── Cliente y financiación ────────────────────────────────────────────
            let y = 150;
            const bloque = (titulo: string, lineas: string[], x: number) => {
                doc.fillColor(accent).fontSize(9).font('Helvetica-Bold').text(titulo.toUpperCase(), x, y);
                doc.fillColor('#111827').fontSize(10).font('Helvetica');
                lineas.forEach((l, i) => doc.text(l, x, y + 15 + i * 14, { width: 230, lineBreak: false, ellipsis: true }));
            };

            bloque('Cliente', [
                cli?.nombre || '—',
                cli?.dni ? `DNI/CUIT: ${cli.dni}` : '',
                cli?.telefono ? `Tel: ${cli.telefono}` : '',
            ].filter(Boolean), 50);

            bloque('Vehículo / Financiación', [
                `${veh?.marca || ''} ${veh?.modelo || ''}`.trim() || '—',
                veh?.dominio ? `Dominio: ${veh.dominio}` : '',
                `Financiación N° ${fin?.id ?? '—'}`,
                `Cuota ${cuota.nroCuota} de ${fin?.cuotas ?? '—'}`,
            ].filter(Boolean), 310);

            y += 90;

            // ── Detalle de la cuota ───────────────────────────────────────────────
            const fila = (label: string, valor: string, negrita = false) => {
                doc.fillColor('#111827').fontSize(10).font(negrita ? 'Helvetica-Bold' : 'Helvetica');
                doc.text(label, 50, y, { width: 380 });
                doc.text(valor, 430, y, { width: 115, align: 'right' });
                y += 18;
            };

            doc.fillColor(accent).fontSize(9).font('Helvetica-Bold').text('DETALLE DE LA CUOTA', 50, y);
            y += 16;
            doc.moveTo(50, y).lineTo(545, y).strokeColor('#e5e7eb').stroke();
            y += 8;

            fila('Vencimiento', fecha(cuota.vencimiento));
            fila('Monto de la cuota', money(montoCuota, moneda), true);
            fila('Total pagado', money(totalPagado, moneda));
            fila('Saldo de la cuota', money(saldo, moneda), true);

            // ── Pagos registrados ─────────────────────────────────────────────────
            if (cuota.pagos.length > 0) {
                y += 14;
                doc.fillColor(accent).fontSize(9).font('Helvetica-Bold').text('PAGOS REGISTRADOS', 50, y);
                y += 16;
                for (const p of cuota.pagos) {
                    doc.fillColor('#111827').fontSize(9).font('Helvetica');
                    doc.text(`${fecha(p.fechaPago)} — ${p.metodo}${p.referencia ? ` (${p.referencia})` : ''}`, 50, y, { width: 380 });
                    doc.text(money(p.monto, moneda), 430, y, { width: 115, align: 'right' });
                    y += 15;
                }
            }

            // ── Pie (marca del tenant, o AUTENZA por defecto) ─────────────────────
            drawPie(doc, brand);
            doc.fillColor(muted).fontSize(8).font('Helvetica')
                .text(
                    `Cobrador: ${fin?.cobrador?.nombre || '—'}   ·   Generado el ${new Date().toLocaleString('es-AR')}`,
                    50, 760, { align: 'center', width: 495 }
                );
            doc.text('Documento no válido como factura. Comprobante interno de pago.', 50, 772, { align: 'center', width: 495 });

            doc.end();
        } catch (error) {
            next(error);
        }
    }

    // GET /api/presupuestos/:id/pdf → PDF del presupuesto para enviar al cliente.
    static async presupuestoPdf(req: Request, res: Response, next: NextFunction) {
        try {
            const id = Number(req.params.id);
            const p = await prisma.presupuesto.findFirst({
                where: { id },
                include: {
                    cliente: true,
                    vendedor: { select: { nombre: true, email: true } },
                    sucursal: true,
                    concesionaria: { select: marcaSelect },
                    // Mismos filtros de borrados que PrismaPresupuestoRepository: sin
                    // ellos, un extra anulado inflaría el total del PDF.
                    items: { where: { deletedAt: null }, include: { vehiculo: true } },
                    extras: { where: { deletedAt: null } },
                    canje: { where: { deletedAt: null } },
                },
            }) as any;

            if (!p) throw new NotFoundException('Presupuesto');

            const moneda = p.moneda || 'ARS';
            const subtotalItems = p.items.reduce((s: number, i: any) => s + Number(i.precioFinal), 0);
            const totalExtras = p.extras.reduce((s: number, e: any) => s + Number(e.monto), 0);
            const valorCanje = p.canje ? Number(p.canje.valorTomado) : 0;
            const total = subtotalItems + totalExtras - valorCanje;

            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="presupuesto-${p.nroPresupuesto || p.id}.pdf"`);

            const doc = new PDFDocument({ size: 'A4', margin: 50 });
            doc.pipe(res);

            // ── Marca (logo/colores del tenant, o AUTENZA por defecto) ────────────
            const brand = await resolveBranding(p.concesionaria);
            const accent = brand.accent;
            const muted = brand.muted;

            // ── Encabezado ────────────────────────────────────────────────────────
            const infoLineas = [
                p.concesionaria?.cuit ? `CUIT: ${p.concesionaria.cuit}` : '',
                p.sucursal?.nombre ? `Sucursal: ${p.sucursal.nombre}` : '',
                p.concesionaria?.telefono ? `Tel: ${p.concesionaria.telefono}` : '',
            ].filter(Boolean);
            drawEncabezado(doc, brand, infoLineas);

            doc.fillColor('#111827').fontSize(16).font('Helvetica-Bold')
                .text('PRESUPUESTO', 50, 50, { align: 'right' });
            doc.fillColor(muted).fontSize(10).font('Helvetica')
                .text(`N° ${p.nroPresupuesto || String(p.id).padStart(6, '0')}`, { align: 'right' })
                .text(`Fecha: ${fecha(p.fechaCreacion)}`, { align: 'right' });
            if (p.validoHasta) doc.text(`Válido hasta: ${fecha(p.validoHasta)}`, { align: 'right' });

            doc.moveTo(50, 130).lineTo(545, 130).strokeColor('#e5e7eb').stroke();

            // ── Cliente y vendedor ────────────────────────────────────────────────
            let y = 150;
            const bloque = (titulo: string, lineas: string[], x: number) => {
                doc.fillColor(accent).fontSize(9).font('Helvetica-Bold').text(titulo.toUpperCase(), x, y);
                doc.fillColor('#111827').fontSize(10).font('Helvetica');
                lineas.forEach((l, i) => doc.text(l, x, y + 15 + i * 14, { width: 230, lineBreak: false, ellipsis: true }));
            };

            bloque('Cliente', [
                p.cliente?.nombre || '—',
                p.cliente?.dni ? `DNI/CUIT: ${p.cliente.dni}` : '',
                p.cliente?.telefono ? `Tel: ${p.cliente.telefono}` : '',
                p.cliente?.email || '',
            ].filter(Boolean), 50);

            bloque('Atendido por', [
                p.vendedor?.nombre || '—',
                p.vendedor?.email || '',
            ].filter(Boolean), 310);

            y += 90;

            // ── Detalle ───────────────────────────────────────────────────────────
            const fila = (label: string, valor: string, negrita = false) => {
                doc.fillColor('#111827').fontSize(10).font(negrita ? 'Helvetica-Bold' : 'Helvetica');
                doc.text(label, 50, y, { width: 380 });
                doc.text(valor, 430, y, { width: 115, align: 'right' });
                y += 18;
            };

            doc.fillColor(accent).fontSize(9).font('Helvetica-Bold').text('DETALLE', 50, y);
            y += 16;
            doc.moveTo(50, y).lineTo(545, y).strokeColor('#e5e7eb').stroke();
            y += 8;

            for (const it of p.items) {
                const v = it.vehiculo;
                const nombre = `${v?.marca || ''} ${v?.modelo || ''}${v?.anio ? ` ${v.anio}` : ''}${v?.dominio ? ` (${v.dominio})` : ''}`.trim() || 'Vehículo';
                const desc = Number(it.descuento);
                fila(nombre, money(it.precioLista, moneda));
                if (desc > 0) fila('   Descuento', `- ${money(desc, moneda)}`);
            }
            for (const e of p.extras) fila(`Extra: ${e.descripcion}`, money(e.monto, moneda));
            if (p.canje) {
                const det = [p.canje.descripcion, p.canje.dominio ? `(${p.canje.dominio})` : ''].filter(Boolean).join(' ');
                fila(`Canje: ${det || 'vehículo entregado'}`, `- ${money(valorCanje, moneda)}`);
            }

            y += 4;
            doc.moveTo(50, y).lineTo(545, y).strokeColor('#e5e7eb').stroke();
            y += 8;
            fila('TOTAL', money(total, moneda), true);

            // ── Observaciones ─────────────────────────────────────────────────────
            if (p.observaciones) {
                y += 14;
                doc.fillColor(accent).fontSize(9).font('Helvetica-Bold').text('OBSERVACIONES', 50, y);
                y += 16;
                doc.fillColor('#111827').fontSize(9).font('Helvetica')
                    .text(p.observaciones, 50, y, { width: 495 });
            }

            // ── Pie (marca del tenant, o AUTENZA por defecto) ─────────────────────
            drawPie(doc, brand);
            doc.fillColor(muted).fontSize(8).font('Helvetica')
                .text(
                    `Presupuesto sujeto a disponibilidad de las unidades.   ·   Generado el ${new Date().toLocaleString('es-AR')}`,
                    50, 760, { align: 'center', width: 495 }
                );
            doc.text('Documento no válido como factura.', 50, 772, { align: 'center', width: 495 });

            doc.end();
        } catch (error) {
            next(error);
        }
    }

    // GET /api/reservas/:id/comprobante → PDF del comprobante de reserva/seña.
    static async reservaPdf(req: Request, res: Response, next: NextFunction) {
        try {
            const id = Number(req.params.id);
            const r = await prisma.reserva.findFirst({
                where: { id },
                include: {
                    cliente: true,
                    vehiculo: true,
                    sucursal: true,
                    creadaPor: { select: { nombre: true } },
                    concesionaria: { select: marcaSelect },
                },
            }) as any;

            if (!r) throw new NotFoundException('Reserva');

            const moneda = r.moneda || 'ARS';

            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="comprobante-reserva-${r.id}.pdf"`);

            const doc = new PDFDocument({ size: 'A4', margin: 50 });
            doc.pipe(res);

            // ── Marca (logo/colores del tenant, o AUTENZA por defecto) ────────────
            const brand = await resolveBranding(r.concesionaria);
            const accent = brand.accent;
            const muted = brand.muted;

            // ── Encabezado ────────────────────────────────────────────────────────
            const infoLineas = [
                r.concesionaria?.cuit ? `CUIT: ${r.concesionaria.cuit}` : '',
                r.sucursal?.nombre ? `Sucursal: ${r.sucursal.nombre}` : '',
                r.concesionaria?.telefono ? `Tel: ${r.concesionaria.telefono}` : '',
            ].filter(Boolean);
            drawEncabezado(doc, brand, infoLineas);

            doc.fillColor('#111827').fontSize(16).font('Helvetica-Bold')
                .text('COMPROBANTE DE RESERVA', 50, 50, { align: 'right' });
            doc.fillColor(muted).fontSize(10).font('Helvetica')
                .text(`N° ${String(r.id).padStart(6, '0')}`, { align: 'right' })
                .text(`Fecha: ${fecha(r.fecha)}`, { align: 'right' });
            if (r.venceEl) doc.text(`Válida hasta: ${fecha(r.venceEl)}`, { align: 'right' });

            doc.moveTo(50, 130).lineTo(545, 130).strokeColor('#e5e7eb').stroke();

            // ── Cliente y vehículo ────────────────────────────────────────────────
            let y = 150;
            const bloque = (titulo: string, lineas: string[], x: number) => {
                doc.fillColor(accent).fontSize(9).font('Helvetica-Bold').text(titulo.toUpperCase(), x, y);
                doc.fillColor('#111827').fontSize(10).font('Helvetica');
                lineas.forEach((l, i) => doc.text(l, x, y + 15 + i * 14, { width: 230, lineBreak: false, ellipsis: true }));
            };

            bloque('Cliente', [
                r.cliente?.nombre || '—',
                r.cliente?.dni ? `DNI/CUIT: ${r.cliente.dni}` : '',
                r.cliente?.telefono ? `Tel: ${r.cliente.telefono}` : '',
                r.cliente?.email || '',
            ].filter(Boolean), 50);

            bloque('Vehículo', [
                `${r.vehiculo?.marca || ''} ${r.vehiculo?.modelo || ''}`.trim(),
                r.vehiculo?.version || '',
                r.vehiculo?.dominio ? `Dominio: ${r.vehiculo.dominio}` : '',
                r.vehiculo?.anio ? `Año: ${r.vehiculo.anio}` : '',
            ].filter(Boolean), 310);

            y += 90;

            // ── Detalle de la reserva ─────────────────────────────────────────────
            const fila = (label: string, valor: string, negrita = false) => {
                doc.fillColor('#111827').fontSize(10).font(negrita ? 'Helvetica-Bold' : 'Helvetica');
                doc.text(label, 50, y, { width: 380 });
                doc.text(valor, 430, y, { width: 115, align: 'right' });
                y += 18;
            };

            doc.fillColor(accent).fontSize(9).font('Helvetica-Bold').text('DETALLE DE LA RESERVA', 50, y);
            y += 16;
            doc.moveTo(50, y).lineTo(545, y).strokeColor('#e5e7eb').stroke();
            y += 8;

            fila('Seña entregada', money(r.montoSenia, moneda), true);
            if (r.metodo) fila('Método de pago', prettyEnum(r.metodo));
            if (r.referencia) fila('Referencia', String(r.referencia));
            fila('Estado', prettyEnum(r.estado));

            // ── Observaciones ─────────────────────────────────────────────────────
            if (r.observaciones) {
                y += 14;
                doc.fillColor(accent).fontSize(9).font('Helvetica-Bold').text('OBSERVACIONES', 50, y);
                y += 16;
                // Altura acotada + ellipsis: una nota muy larga no invade el pie (y=720).
                doc.fillColor('#111827').fontSize(9).font('Helvetica')
                    .text(r.observaciones, 50, y, { width: 495, height: 300, ellipsis: true });
            }

            // ── Pie (marca del tenant, o AUTENZA por defecto) ─────────────────────
            drawPie(doc, brand);
            doc.fillColor(muted).fontSize(8).font('Helvetica')
                .text(
                    `Atendido por: ${r.creadaPor?.nombre || '—'}   ·   Generado el ${new Date().toLocaleString('es-AR')}`,
                    50, 760, { align: 'center', width: 495 }
                );
            doc.text('La seña se imputa al precio final. Documento no válido como factura.', 50, 772, { align: 'center', width: 495 });

            doc.end();
        } catch (error) {
            next(error);
        }
    }

    // GET /api/postventa-casos/:id/orden → orden de servicio del caso en PDF, con
    // la marca del tenant: datos del cliente/vehículo, el reclamo, el turno y la
    // tabla de trabajos/repuestos con su total. Documento para el taller y el cliente.
    static async postventaOrdenPdf(req: Request, res: Response, next: NextFunction) {
        try {
            const id = Number(req.params.id);
            const c = await prisma.postventaCaso.findFirst({
                where: { id },
                include: {
                    cliente: true,
                    vehiculo: true,
                    sucursal: true,
                    tipoRef: { select: { nombre: true } },
                    // El filtro de borrados no alcanza al include: se pone explícito.
                    items: {
                        where: { deletedAt: null },
                        orderBy: [{ fecha: 'asc' }, { id: 'asc' }],
                        include: { proveedor: { select: { nombre: true } } },
                    },
                    concesionaria: { select: marcaSelect },
                },
            }) as any;

            if (!c) throw new NotFoundException('Caso de postventa');

            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="orden-servicio-${c.id}.pdf"`);

            const doc = new PDFDocument({ size: 'A4', margin: 50 });
            doc.pipe(res);

            const brand = await resolveBranding(c.concesionaria);
            const accent = brand.accent;
            const muted = brand.muted;

            const infoLineas = [
                c.concesionaria?.cuit ? `CUIT: ${c.concesionaria.cuit}` : '',
                c.sucursal?.nombre ? `Sucursal: ${c.sucursal.nombre}` : '',
                c.concesionaria?.telefono ? `Tel: ${c.concesionaria.telefono}` : '',
            ].filter(Boolean);
            drawEncabezado(doc, brand, infoLineas);

            doc.fillColor('#111827').fontSize(16).font('Helvetica-Bold')
                .text('ORDEN DE SERVICIO', 50, 50, { align: 'right' });
            doc.fillColor(muted).fontSize(10).font('Helvetica')
                .text(`N° ${String(c.id).padStart(6, '0')}`, { align: 'right' })
                .text(`Reclamo: ${fecha(c.fechaReclamo)}`, { align: 'right' })
                .text(`Estado: ${prettyEnum(c.estado)}`, { align: 'right' });

            doc.moveTo(50, 130).lineTo(545, 130).strokeColor('#e5e7eb').stroke();

            // ── Cliente y vehículo ────────────────────────────────────────────────
            let y = 150;
            const bloque = (titulo: string, lineas: string[], x: number) => {
                doc.fillColor(accent).fontSize(9).font('Helvetica-Bold').text(titulo.toUpperCase(), x, y);
                doc.fillColor('#111827').fontSize(10).font('Helvetica');
                lineas.forEach((l, i) => doc.text(l, x, y + 15 + i * 14, { width: 230, lineBreak: false, ellipsis: true }));
            };
            bloque('Cliente', [
                c.cliente?.nombre || '—',
                c.cliente?.dni ? `DNI/CUIT: ${c.cliente.dni}` : '',
                c.cliente?.telefono ? `Tel: ${c.cliente.telefono}` : '',
            ].filter(Boolean), 50);
            bloque('Vehículo', [
                `${c.vehiculo?.marca || ''} ${c.vehiculo?.modelo || ''}`.trim(),
                c.vehiculo?.version || '',
                c.vehiculo?.dominio ? `Dominio: ${c.vehiculo.dominio}` : '',
                c.vehiculo?.anio ? `Año: ${c.vehiculo.anio}` : '',
            ].filter(Boolean), 310);
            y += 90;

            // ── Tipo + turno ──────────────────────────────────────────────────────
            const metaLinea = [
                (c.tipoRef?.nombre || c.tipo) ? `Tipo: ${c.tipoRef?.nombre || c.tipo}` : '',
                c.fechaTurno ? `Turno: ${fecha(c.fechaTurno)}${c.horaTurno ? ` · ${c.horaTurno} hs` : ''}` : '',
            ].filter(Boolean).join('        ·        ');
            if (metaLinea) {
                doc.fillColor(muted).fontSize(9).font('Helvetica').text(metaLinea, 50, y, { width: 495, lineBreak: false, ellipsis: true });
                y += 20;
            }

            // ── Descripción del reclamo ───────────────────────────────────────────
            doc.fillColor(accent).fontSize(9).font('Helvetica-Bold').text('DESCRIPCIÓN DEL RECLAMO', 50, y);
            y += 15;
            doc.fillColor('#111827').fontSize(10).font('Helvetica')
                .text(c.descripcion || '—', 50, y, { width: 495, height: 60, ellipsis: true });
            y += 72;

            // ── Trabajos / repuestos (tabla con paginación) ───────────────────────
            doc.fillColor(accent).fontSize(9).font('Helvetica-Bold').text('TRABAJOS / REPUESTOS', 50, y);
            y += 16;
            const drawItemsHeader = () => {
                doc.fillColor(muted).fontSize(8.5).font('Helvetica-Bold');
                doc.text('FECHA', 50, y);
                doc.text('DESCRIPCIÓN', 120, y);
                doc.text('PROVEEDOR', 340, y);
                doc.text('MONTO', 470, y, { width: 75, align: 'right' });
                y += 13;
                doc.moveTo(50, y).lineTo(545, y).strokeColor('#e5e7eb').stroke();
                y += 6;
            };
            drawItemsHeader();

            const PAGE_BOTTOM = 690;
            let total = 0;
            const items = c.items ?? [];
            if (items.length === 0) {
                doc.fillColor(muted).fontSize(9).font('Helvetica').text('Sin trabajos ni repuestos registrados.', 50, y);
                y += 16;
            } else {
                for (const it of items) {
                    if (y > PAGE_BOTTOM) {
                        doc.addPage();
                        drawTopBand(doc, brand);
                        y = 60;
                        drawItemsHeader();
                    }
                    total += Number(it.monto ?? 0);
                    doc.fillColor('#111827').fontSize(9).font('Helvetica');
                    doc.text(fecha(it.fecha), 50, y, { width: 65 });
                    doc.text(it.descripcion || '—', 120, y, { width: 215, height: 11, lineBreak: false, ellipsis: true });
                    doc.text(it.proveedor?.nombre || '—', 340, y, { width: 125, height: 11, lineBreak: false, ellipsis: true });
                    doc.text(money(it.monto), 470, y, { width: 75, align: 'right' });
                    y += 16;
                }
            }

            // ── Total (con guarda para no pisar el pie) ───────────────────────────
            if (y > 680) { doc.addPage(); drawTopBand(doc, brand); y = 60; }
            y += 4;
            doc.moveTo(50, y).lineTo(545, y).strokeColor('#e5e7eb').stroke();
            y += 8;
            doc.fillColor('#111827').fontSize(11).font('Helvetica-Bold').text('TOTAL', 340, y, { width: 120 });
            doc.fillColor(accent).fontSize(11).font('Helvetica-Bold').text(money(total), 470, y, { width: 75, align: 'right' });

            // ── Pie (marca del tenant, o AUTENZA por defecto) ─────────────────────
            drawPie(doc, brand);
            doc.fillColor(muted).fontSize(8).font('Helvetica')
                .text(`Generado el ${new Date().toLocaleString('es-AR')}`, 50, 760, { align: 'center', width: 495 });
            doc.text('Orden de trabajo interna. Los importes son informativos; no válida como factura.', 50, 772, { align: 'center', width: 495 });

            doc.end();
        } catch (error) {
            next(error);
        }
    }

    // GET /api/clientes/:id/estado-cuenta/pdf → PDF con la cuenta corriente del
    // cliente: por cada financiación, el plan de cuotas (pagado/saldo) y los
    // totales. Mismo criterio de "vencido" que el reporte de estado de cuenta
    // (vencimiento < hoy a medianoche UTC).
    static async estadoCuentaPdf(req: Request, res: Response, next: NextFunction) {
        try {
            const id = Number(req.params.id);
            const cliente = await prisma.cliente.findFirst({
                where: { id },
                include: { concesionaria: { select: marcaSelect } },
            }) as any;
            if (!cliente) throw new NotFoundException('Cliente');

            const financiaciones = await prisma.financiacion.findMany({
                where: { clienteId: id },
                orderBy: { fechaInicio: 'desc' },
                include: {
                    // El filtro de borrados de la extensión no alcanza al include.
                    cuotasPlan: { where: { deletedAt: null }, orderBy: { nroCuota: 'asc' } },
                    venta: { select: { vehiculo: { select: { marca: true, modelo: true, dominio: true } } } },
                },
            }) as any[];

            const ahora = new Date();
            const inicioHoy = new Date(Date.UTC(ahora.getFullYear(), ahora.getMonth(), ahora.getDate()));
            const nn = (v: unknown) => Number(v ?? 0);

            // Resumen por moneda (saldo pendiente + vencido) y próxima cuota global.
            const porMoneda = new Map<string, { pendiente: number; vencido: number }>();
            const futurasGlobal: Array<{ vencimiento: Date; monto: number; moneda: string }> = [];
            let cuotasVencidasTot = 0;

            const lineas: FinanciacionLinea[] = financiaciones.map((f) => {
                const acc = porMoneda.get(f.moneda) ?? { pendiente: 0, vencido: 0 };
                let saldoPendiente = 0;
                let cuotasVencidas = 0;

                const cuotas = (f.cuotasPlan as any[]).map((c) => {
                    const monto = nn(c.montoCuota);
                    const saldo = nn(c.saldoCuota);
                    // Refinanciada: el saldo se movió a otro contrato (saldoCuota
                    // quedó en 0), NO se pagó. No mostrar el monto como "pagado".
                    const pagado = c.estado === 'refinanciada' ? 0 : Math.max(0, monto - saldo);
                    // "Viva": ni pagada ni refinanciada y con saldo (igual que el reporte).
                    const viva = c.estado !== 'pagada' && c.estado !== 'refinanciada' && saldo > 0;
                    const vencida = viva && c.vencimiento < inicioHoy;
                    if (viva) {
                        saldoPendiente += saldo;
                        acc.pendiente += saldo;
                        if (vencida) { cuotasVencidas += 1; acc.vencido += saldo; }
                        else futurasGlobal.push({ vencimiento: c.vencimiento, monto: saldo, moneda: f.moneda });
                    }
                    const estadoLabel = c.estado === 'pagada' ? 'Pagada'
                        : c.estado === 'refinanciada' ? 'Refinanc.'
                            : saldo <= 0 ? 'Pagada'
                                : vencida ? 'Vencida'
                                    : pagado > 0 ? 'Parcial'
                                        : 'Pendiente';
                    return { nro: c.nroCuota, vencimiento: c.vencimiento, monto, pagado, saldo, estadoLabel, vencida };
                });

                porMoneda.set(f.moneda, acc);
                cuotasVencidasTot += cuotasVencidas;
                const veh = f.venta?.vehiculo;
                return {
                    id: f.id,
                    vehiculo: veh ? `${veh.marca ?? ''} ${veh.modelo ?? ''}`.trim() : '',
                    dominio: veh?.dominio ?? '',
                    fechaInicio: f.fechaInicio,
                    moneda: f.moneda,
                    montoFinanciado: nn(f.montoFinanciado),
                    estado: String(f.estado),
                    cuotasTotal: (f.cuotasPlan as any[]).length,
                    cuotasPagadas: (f.cuotasPlan as any[]).filter((c) => c.estado === 'pagada').length,
                    saldoPendiente,
                    cuotasVencidas,
                    cuotas,
                };
            });

            futurasGlobal.sort((a, b) => a.vencimiento.getTime() - b.vencimiento.getTime());

            const data: EstadoCuentaData = {
                cliente: {
                    nombre: cliente.nombre,
                    dni: cliente.dni ?? null,
                    telefono: cliente.telefono ?? null,
                    email: cliente.email ?? null,
                    concesionaria: cliente.concesionaria ?? null,
                },
                hoy: ahora,
                generadoEl: ahora.toLocaleString('es-AR'),
                financiaciones: lineas,
                resumen: {
                    saldoPorMoneda: Array.from(porMoneda.entries())
                        .map(([moneda, v]) => ({ moneda, pendiente: v.pendiente, vencido: v.vencido }))
                        .sort((a, b) => a.moneda.localeCompare(b.moneda)),
                    cuotasVencidas: cuotasVencidasTot,
                    proxima: futurasGlobal[0] ?? null,
                },
            };

            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="estado-cuenta-cliente-${id}.pdf"`);
            // bufferPages: el estado de cuenta puede ocupar varias páginas y el pie
            // se estampa en TODAS al final (renderEstadoCuenta recorre el rango).
            const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true });
            doc.pipe(res);

            const brand = await resolveBranding(cliente.concesionaria);
            renderEstadoCuenta(doc, brand, data);
            doc.end();
        } catch (error) {
            next(error);
        }
    }

    // GET /api/reportes/comisiones/pdf?vendedorId=&desde=&hasta= → liquidación de
    // comisiones de UN vendedor: detalle de sus ventas del período (facturado =
    // precio + extras) y su comisión (facturado × % del perfil), por moneda. Es un
    // documento interno de nómina → sólo admin (la ruta lo gatea).
    static async comisionesLiquidacionPdf(req: Request, res: Response, next: NextFunction) {
        try {
            const vendedorId = Number(req.query.vendedorId);
            if (!Number.isInteger(vendedorId) || vendedorId < 1) {
                throw new BaseException(400, 'vendedorId es obligatorio', 'VALIDATION_ERROR');
            }
            // Rango sobre fechaVenta (@db.Date): se compara en UTC puro (T00:00Z),
            // igual que el reporte de comisiones (parseRango/filtroFecha).
            const parseDia = (v: unknown): Date | undefined => {
                if (!v) return undefined;
                const d = new Date(`${v}T00:00:00.000Z`);
                return isNaN(d.getTime()) ? undefined : d;
            };
            const desde = parseDia(req.query.desde);
            const hasta = parseDia(req.query.hasta);
            // sucursalId: MISMO filtro que el reporte de comisiones. Sin esto, la
            // liquidación sumaba TODAS las sucursales aunque el admin estuviera viendo
            // una sola en la grilla → el PDF de nómina no coincidía con la pantalla.
            let sucursalId: number | undefined;
            if (req.query.sucursalId !== undefined && req.query.sucursalId !== '') {
                const n = Number(req.query.sucursalId);
                if (!Number.isInteger(n) || n < 1) throw new BaseException(400, 'sucursalId inválido', 'VALIDATION_ERROR');
                sucursalId = n;
            }

            const where: any = { vendedorId };
            if (desde || hasta) {
                where.fechaVenta = {};
                if (desde) where.fechaVenta.gte = desde;
                if (hasta) where.fechaVenta.lte = hasta;
            }
            if (sucursalId) where.sucursalId = sucursalId;

            const ventas = await prisma.venta.findMany({
                where,
                orderBy: { fechaVenta: 'asc' },
                include: {
                    vehiculo: { select: { marca: true, modelo: true, dominio: true } },
                    cliente: { select: { nombre: true } },
                    // Los extras anulados no suman (el filtro de borrados no alcanza al include).
                    extras: { where: { deletedAt: null }, select: { monto: true } },
                    // Vendedor + concesionaria SALEN del include (como el reporte): la
                    // extensión no filtra deletedAt en relaciones to-one, así que un
                    // vendedor dado de baja con ventas en el período sigue siendo
                    // liquidable, coincidiendo con la fila del reporte que ofreció el botón.
                    vendedor: { select: { nombre: true, comisionPorcentaje: true } },
                    concesionaria: { select: marcaSelect },
                },
            }) as any[];

            // Cabecera: del vendedor de las ventas; si no tuvo ventas en el período,
            // se busca el usuario (scoped por tenant → 404 si no existe en el tenant).
            let nombre: string;
            let porcentajeRaw: unknown;
            let concesionaria: any;
            if (ventas.length) {
                nombre = ventas[0].vendedor?.nombre ?? 'Vendedor';
                porcentajeRaw = ventas[0].vendedor?.comisionPorcentaje;
                concesionaria = ventas[0].concesionaria ?? null;
            } else {
                const u = await prisma.usuario.findFirst({
                    where: { id: vendedorId },
                    select: { nombre: true, comisionPorcentaje: true, concesionaria: { select: marcaSelect } },
                }) as any;
                if (!u) throw new NotFoundException('Vendedor');
                nombre = u.nombre;
                porcentajeRaw = u.comisionPorcentaje;
                concesionaria = u.concesionaria ?? null;
            }
            const porcentaje = porcentajeRaw != null ? Number(porcentajeRaw) : 0;
            const nn = (v: unknown) => Number(v ?? 0);
            const totalesMap = new Map<string, LiquidacionTotal>();
            const lineas: LiquidacionLinea[] = ventas.map((v) => {
                const extras = (v.extras as any[]).reduce((s, e) => s + nn(e.monto), 0);
                const facturado = nn(v.precioVenta) + extras;
                const comision = facturado * (porcentaje / 100);
                const veh = v.vehiculo;
                const t = totalesMap.get(v.moneda) ?? { moneda: v.moneda, unidades: 0, facturado: 0, comision: 0 };
                t.unidades += 1; t.facturado += facturado; t.comision += comision;
                totalesMap.set(v.moneda, t);
                return {
                    fecha: v.fechaVenta,
                    vehiculo: veh ? `${veh.marca ?? ''} ${veh.modelo ?? ''}`.trim() : '',
                    dominio: veh?.dominio ?? '',
                    cliente: v.cliente?.nombre ?? '',
                    moneda: v.moneda,
                    facturado,
                    comision,
                };
            });

            const ahora = new Date();
            const data: LiquidacionData = {
                vendedor: nombre,
                porcentaje,
                concesionaria: concesionaria,
                periodo: {
                    desde: desde ? desde.toISOString().slice(0, 10) : null,
                    hasta: hasta ? hasta.toISOString().slice(0, 10) : null,
                },
                generadoEl: ahora.toLocaleString('es-AR'),
                lineas,
                totales: Array.from(totalesMap.values()).sort((a, b) => a.moneda.localeCompare(b.moneda)),
                totalUnidades: lineas.length,
            };

            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="liquidacion-comisiones-vendedor-${vendedorId}.pdf"`);
            const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true });
            doc.pipe(res);

            const brand = await resolveBranding(concesionaria);
            renderLiquidacionComisiones(doc, brand, data);
            doc.end();
        } catch (error) {
            next(error);
        }
    }
}
