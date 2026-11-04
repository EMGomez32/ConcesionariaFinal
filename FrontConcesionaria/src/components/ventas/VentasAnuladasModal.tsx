import { useQuery } from '@tanstack/react-query';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import { ventasApi, type VentaAnulada } from '../../api/ventas.api';
import type { PaginatedResponse } from '../../types/api.types';
import { formatMoneda } from '../../utils/moneda';
import { formatFecha } from '../../utils/fecha';
import { getErrorMessage } from '../../utils/getErrorMessage';

interface Props {
    isOpen: boolean;
    onClose: () => void;
}

const nroVenta = (id: number) => String(id).padStart(6, '0');

/** La anulación es un instante (no una fecha de calendario): va con hora local. */
const fechaHora = (iso: string) =>
    new Date(iso).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });

/**
 * Reporte de ventas anuladas (sólo admin): qué se anuló, cuándo, quién y POR QUÉ.
 *
 * Es el control de las bajas: anular una venta es la maniobra con la que se tapa
 * un desvío, así que el dueño tiene que poder revisarlas de un vistazo sin ir a
 * buscar una por una a la auditoría. Muestra las 50 más recientes.
 */
const VentasAnuladasModal = ({ isOpen, onClose }: Props) => {
    const { data, isLoading, isError, error, refetch } = useQuery({
        queryKey: ['ventas', 'anuladas'],
        queryFn: async () => (await ventasApi.anuladas({ limit: 50 })) as unknown as PaginatedResponse<VentaAnulada>,
        enabled: isOpen,
        meta: { silenciarError: true },
    });
    const filas = data?.results ?? [];

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Ventas anuladas" subtitle="Las 50 más recientes, con el motivo y quién las anuló." maxWidth="960px">
            {isLoading ? (
                <p className="text-muted">Cargando…</p>
            ) : isError ? (
                <div className="flex flex-col gap-3">
                    <p role="alert" style={{ color: 'var(--danger)' }}>{getErrorMessage(error, 'No se pudo cargar el reporte de anulaciones.')}</p>
                    <div><Button variant="secondary" size="sm" onClick={() => refetch()}>Reintentar</Button></div>
                </div>
            ) : filas.length === 0 ? (
                <p className="text-muted">No hay ventas anuladas.</p>
            ) : (
                <div className="table-container">
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Anulada</th>
                                <th>Venta</th>
                                <th>Unidad</th>
                                <th>Cliente</th>
                                <th style={{ textAlign: 'right' }}>Precio</th>
                                <th>Motivo</th>
                                <th>Anuló</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filas.map((v) => (
                                <tr key={v.id}>
                                    <td className="text-xs tabular-nums" style={{ whiteSpace: 'nowrap' }}>{fechaHora(v.anuladaEn)}</td>
                                    <td className="tabular-nums">
                                        N° {nroVenta(v.id)}
                                        <div className="text-xs text-muted">del {formatFecha(v.fechaVenta)}</div>
                                    </td>
                                    <td>
                                        {`${v.vehiculo?.marca ?? ''} ${v.vehiculo?.modelo ?? ''}`.trim() || '—'}
                                        {v.vehiculo?.dominio && <div className="text-xs text-muted">{v.vehiculo.dominio}</div>}
                                    </td>
                                    <td>{v.cliente?.nombre ?? '—'}</td>
                                    <td className="tabular-nums" style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{formatMoneda(v.precioVenta, v.moneda)}</td>
                                    <td style={{ minWidth: 220, whiteSpace: 'pre-line' }}>
                                        {v.motivoAnulacion ?? <span className="text-muted">Sin motivo (anulada antes de que fuera obligatorio)</span>}
                                    </td>
                                    <td>{v.anuladaPor?.nombre ?? '—'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </Modal>
    );
};

export default VentasAnuladasModal;
