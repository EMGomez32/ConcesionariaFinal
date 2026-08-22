import { useEffect, useState, useCallback } from 'react';
import { FileText, Download, RefreshCw, ShieldCheck } from 'lucide-react';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import { useUIStore } from '../../store/uiStore';
import { ventasApi, type ComprobanteAfip } from '../../api/ventas.api';

// Panel de facturación electrónica AFIP dentro del detalle de la venta: muestra el
// estado fiscal (si ya se facturó, tipo/número/CAE/vencimiento + descarga del PDF)
// o el botón para emitir. En Corte 1 el CAE es simulado (modo demo).
const TIPO_LABEL: Record<ComprobanteAfip['tipoComprobante'], string> = {
    factura_a: 'Factura A',
    factura_b: 'Factura B',
    factura_c: 'Factura C',
};

// fechaComprobante y caeVencimiento son columnas @db.Date (medianoche UTC): se
// formatean en UTC para no correr el día en zonas de offset negativo (AR, UTC-3).
const fmtFecha = (s: string | null | undefined) =>
    s ? new Date(s).toLocaleDateString('es-AR', { timeZone: 'UTC' }) : '—';

const nroComprobante = (c: ComprobanteAfip) =>
    `${String(c.puntoVenta).padStart(4, '0')}-${String(c.numero).padStart(8, '0')}`;

interface Props {
    ventaId: number;
}

const VentaFacturaPanel = ({ ventaId }: Props) => {
    const { addToast } = useUIStore();
    const [comp, setComp] = useState<ComprobanteAfip | null>(null);
    const [loading, setLoading] = useState(true);
    const [emitting, setEmitting] = useState(false);
    const [downloading, setDownloading] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const c = await ventasApi.getFactura(ventaId) as unknown as ComprobanteAfip;
            setComp(c);
        } catch {
            // 404 = todavía no facturada. Cualquier otro error también cae acá y se
            // muestra el botón de emitir (el POST devolverá el detalle real si falla).
            setComp(null);
        } finally {
            setLoading(false);
        }
    }, [ventaId]);

    useEffect(() => { load(); }, [load]);

    const descargarPdf = async () => {
        setDownloading(true);
        try {
            const blob = await ventasApi.facturaPdf(ventaId) as unknown as Blob;
            const url = window.URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `factura-venta-${ventaId}.pdf`);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
        } catch {
            addToast('Error al descargar la factura', 'error');
        } finally {
            setDownloading(false);
        }
    };

    const emitir = async () => {
        setEmitting(true);
        try {
            const c = await ventasApi.emitirFactura(ventaId) as unknown as ComprobanteAfip;
            setComp(c);
            addToast('Factura AFIP emitida — CAE obtenido', 'success');
        } catch (err: unknown) {
            const e = err as { error?: string; message?: string };
            if (e?.error === 'COMPROBANTE_YA_EMITIDO') {
                await load(); // ya estaba facturada: refresco el estado
            } else {
                // 422 (faltan datos fiscales del emisor/receptor) u otro: mensaje real.
                addToast(e?.message ?? 'No se pudo emitir la factura', 'error');
            }
        } finally {
            setEmitting(false);
        }
    };

    return (
        <div>
            <h3 className="text-xs font-black text-muted uppercase tracking-widest flex items-center gap-2">
                <FileText size={14} className="text-accent" /> Facturación Electrónica (AFIP)
            </h3>

            {loading ? (
                <div className="text-xs italic text-muted flex items-center gap-2">
                    <RefreshCw size={14} className="animate-spin" /> Consultando comprobante fiscal…
                </div>
            ) : comp ? (
                <div>
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div className="flex items-center gap-3">
                            <Badge variant="success">{TIPO_LABEL[comp.tipoComprobante]?.toUpperCase()}</Badge>
                            <span className="font-mono text-sm font-bold">N° {nroComprobante(comp)}</span>
                        </div>
                        {comp.entorno === 'mock' && (
                            <Badge variant="warning">MODO DEMO — CAE SIMULADO</Badge>
                        )}
                    </div>

                    <div className="grid">
                        <div>
                            <p className="text-3xs font-black text-muted uppercase tracking-widest">CAE</p>
                            <p className="font-mono text-xs font-bold">{comp.cae || '—'}</p>
                        </div>
                        <div>
                            <p className="text-3xs font-black text-muted uppercase tracking-widest">Vto. CAE</p>
                            <p className="text-xs font-bold">{fmtFecha(comp.caeVencimiento)}</p>
                        </div>
                        <div>
                            <p className="text-3xs font-black text-muted uppercase tracking-widest">Fecha</p>
                            <p className="text-xs font-bold">{fmtFecha(comp.fechaComprobante)}</p>
                        </div>
                        <div>
                            <p className="text-3xs font-black text-muted uppercase tracking-widest">Total</p>
                            <p className="text-xs font-black text-accent">
                                {comp.moneda === 'DOL' ? 'US$ ' : '$ '}{Number(comp.total).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                            </p>
                        </div>
                        {comp.tipoComprobante === 'factura_a' && (
                            <>
                                <div>
                                    <p className="text-3xs font-black text-muted uppercase tracking-widest">Neto Gravado</p>
                                    <p className="text-xs font-bold">$ {Number(comp.neto).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</p>
                                </div>
                                <div>
                                    <p className="text-3xs font-black text-muted uppercase tracking-widest">IVA {Number(comp.alicuotaIva)}%</p>
                                    <p className="text-xs font-bold">$ {Number(comp.iva).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</p>
                                </div>
                            </>
                        )}
                    </div>

                    <Button variant="secondary" onClick={descargarPdf} disabled={downloading}>
                        <Download size={16} /> {downloading ? 'Generando…' : 'Descargar factura (PDF)'}
                    </Button>
                </div>
            ) : (
                <div>
                    <p className="text-xs text-muted leading-relaxed flex items-start gap-2">
                        <ShieldCheck size={16} className="text-muted" />
                        Esta venta todavía no tiene comprobante fiscal. Al emitir se calcula el tipo (A si el cliente es
                        Responsable Inscripto, B si es consumidor final) y se obtiene el CAE. Hoy en <strong>modo demo</strong>:
                        el CAE es simulado, sin validez fiscal.
                    </p>
                    <Button variant="primary" onClick={emitir} disabled={emitting}>
                        <FileText size={16} /> {emitting ? 'Emitiendo…' : 'Emitir factura AFIP'}
                    </Button>
                </div>
            )}
        </div>
    );
};

export default VentaFacturaPanel;
