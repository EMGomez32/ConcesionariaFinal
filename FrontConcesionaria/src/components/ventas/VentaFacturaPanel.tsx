import { useEffect, useState, useCallback } from 'react';
import { FileText, Download, RefreshCw, ShieldCheck } from 'lucide-react';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import { useUIStore } from '../../store/uiStore';
import { ventasApi, type ComprobanteAfip } from '../../api/ventas.api';
import { formatFecha } from '../../utils/fecha';
import { formatMoneda } from '../../utils/moneda';

// Panel de facturación electrónica AFIP dentro del detalle de la venta: muestra el
// estado fiscal (si ya se facturó, tipo/número/CAE/vencimiento + descarga del PDF)
// o el botón para emitir. En Corte 1 el CAE es simulado (modo demo).
const TIPO_LABEL: Record<ComprobanteAfip['tipoComprobante'], string> = {
    factura_a: 'Factura A',
    factura_b: 'Factura B',
    factura_c: 'Factura C',
};

// fechaComprobante y caeVencimiento son columnas @db.Date (medianoche UTC):
// formatFecha las lee como texto para no correr el día en UTC-3.
const fmtFecha = (s: string | null | undefined) => formatFecha(s);

/** AFIP codifica la moneda como "PES"/"DOL"; la UI usa ARS/USD. */
const monedaAfip = (m?: string | null) => (m === 'DOL' || m === 'USD' ? 'USD' : 'ARS');

const AYUDA_CAE = 'CAE: Código de Autorización Electrónico. Es el número que otorga AFIP y le da validez a la factura.';

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
    const [errorCarga, setErrorCarga] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setErrorCarga(null);
        try {
            const c = await ventasApi.getFactura(ventaId) as unknown as ComprobanteAfip;
            setComp(c);
        } catch (err: unknown) {
            // 404 (NOT_FOUND) = todavía no facturada: se ofrece emitir. Otro error
            // es un problema al consultar, y ofrecer "Emitir" ahí podía llevar a
            // creer que la venta no estaba facturada cuando sí lo estaba.
            setComp(null);
            const e = err as { error?: string; message?: string };
            if (e?.error !== 'NOT_FOUND') setErrorCarga(e?.message || 'No se pudo consultar la factura de esta venta.');
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
            addToast('Factura emitida: AFIP otorgó el CAE', 'success');
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
                <FileText size={14} className="text-accent" aria-hidden="true" /> Factura electrónica (AFIP)
            </h3>

            {errorCarga ? (
                <div className="text-sm">
                    <p className="text-danger mb-2">{errorCarga}</p>
                    <Button variant="secondary" size="sm" onClick={load}>Reintentar</Button>
                </div>
            ) : loading ? (
                <div className="text-xs italic text-muted flex items-center gap-2">
                    <RefreshCw size={14} className="animate-spin" /> Consultando comprobante fiscal…
                </div>
            ) : comp ? (
                <div>
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div className="flex items-center gap-3">
                            <Badge variant="success">{TIPO_LABEL[comp.tipoComprobante]}</Badge>
                            <span className="font-mono text-sm font-bold">N° {nroComprobante(comp)}</span>
                        </div>
                        {comp.entorno === 'mock' && (
                            <Badge variant="warning" title="Todavía no hay certificado de AFIP cargado: el CAE es de prueba y la factura no tiene validez fiscal.">Modo demo: CAE simulado</Badge>
                        )}
                    </div>

                    <div className="grid">
                        <div>
                            <p className="text-3xs font-black text-muted uppercase tracking-widest"><abbr title={AYUDA_CAE}>CAE</abbr></p>
                            <p className="font-mono text-xs font-bold">{comp.cae || '—'}</p>
                        </div>
                        <div>
                            <p className="text-3xs font-black text-muted uppercase tracking-widest" title={AYUDA_CAE}>Vencimiento del CAE</p>
                            <p className="text-xs font-bold">{fmtFecha(comp.caeVencimiento)}</p>
                        </div>
                        <div>
                            <p className="text-3xs font-black text-muted uppercase tracking-widest">Fecha</p>
                            <p className="text-xs font-bold">{fmtFecha(comp.fechaComprobante)}</p>
                        </div>
                        <div>
                            <p className="text-3xs font-black text-muted uppercase tracking-widest">Total</p>
                            <p className="text-xs font-black tabular-nums">{formatMoneda(comp.total, monedaAfip(comp.moneda))}</p>
                        </div>
                        {comp.tipoComprobante === 'factura_a' && (
                            <>
                                <div>
                                    <p className="text-3xs font-black text-muted uppercase tracking-widest">Neto gravado</p>
                                    <p className="text-xs font-bold tabular-nums">{formatMoneda(comp.neto, monedaAfip(comp.moneda))}</p>
                                </div>
                                <div>
                                    <p className="text-3xs font-black text-muted uppercase tracking-widest">IVA {Number(comp.alicuotaIva)}%</p>
                                    <p className="text-xs font-bold tabular-nums">{formatMoneda(comp.iva, monedaAfip(comp.moneda))}</p>
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
                        Esta venta todavía no tiene factura. Al emitirla se elige el tipo (A si el cliente es
                        Responsable Inscripto, B si es consumidor final) y AFIP otorga el <abbr title={AYUDA_CAE}>CAE</abbr>.
                        Hoy funciona en <strong>modo demo</strong>: el CAE es simulado y la factura no tiene validez fiscal.
                    </p>
                    <Button variant="primary" onClick={emitir} disabled={emitting}>
                        <FileText size={16} /> {emitting ? 'Emitiendo…' : 'Emitir factura'}
                    </Button>
                </div>
            )}
        </div>
    );
};

export default VentaFacturaPanel;
