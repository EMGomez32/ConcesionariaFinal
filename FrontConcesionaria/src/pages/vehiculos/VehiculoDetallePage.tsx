import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { vehiculosApi } from '../../api/vehiculos.api';
import { vehiculoArchivosApi, type VehiculoArchivo } from '../../api/vehiculo-archivos.api';
import { vehiculoMovimientosApi, type VehiculoMovimiento } from '../../api/vehiculo-movimientos.api';
import { gastosApi, type GastoVehiculo } from '../../api/gastos.api';
import { gastosCategoriaApi, type GastoCategoria } from '../../api/gastos-categorias.api';
import { vehiculoInteresApi, type VehiculoInteres } from '../../api/vehiculoInteres.api';
import { vehiculoPreciosApi, type VehiculoPrecioHistorial } from '../../api/vehiculoPrecios.api';
import mercadolibreApi, { esCuentaDemo } from '../../api/mercadolibre.api';
import type {
    EstadoCuentaMl,
    EstadoPublicacionMl,
    OpcionesPublicacion,
    PublicacionMl,
} from '../../api/mercadolibre.api';
import type { Vehiculo, EstadoVehiculo } from '../../types/vehiculo.types';
import { formatFecha } from '../../utils/fecha';
import { getApiErrorMessage } from '../../utils/error';
import DataTable, { type Column } from '../../components/ui/DataTable';
import Badge, { type BadgeVariant } from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Modal from '../../components/ui/Modal';
import { FileUploader } from '../../components/ui/FileUploader';
import { useUIStore } from '../../store/uiStore';
import { waShareLink } from '../../utils/whatsapp';
import {
    ArrowLeft, Car, Calendar, DollarSign, MapPin,
    FileImage, Wrench, ArrowLeftRight, FileText,
    ShoppingCart, Bookmark, RefreshCw, Hash,
    Plus, Trash2, ExternalLink, Upload, X, Image, FileText as FileIcon, Edit, MessageCircle, Star, Users,
    TrendingUp, TrendingDown, Minus, ShoppingBag, AlertTriangle, Pause, Play, Ban
} from 'lucide-react';
import { usePermisos } from '../../hooks/usePermisos';
import type { LucideIcon } from 'lucide-react';
import type { PaginatedResponse, ApiError } from '../../types/api.types';

type Tab = 'info' | 'archivos' | 'gastos' | 'movimientos' | 'presupuestos' | 'reservas' | 'ventas' | 'interesados' | 'precios';

const STATUS_MAP: Record<EstadoVehiculo, { label: string; variant: 'warning' | 'success' | 'info' | 'default' | 'danger' }> = {
    preparacion: { label: 'En Preparación', variant: 'warning' },
    publicado: { label: 'Publicado', variant: 'success' },
    reservado: { label: 'Reservado', variant: 'info' },
    vendido: { label: 'Vendido', variant: 'default' },
    devuelto: { label: 'Devuelto', variant: 'danger' },
};

// Fecha @db.Date → DD/MM/YYYY sin pasar por new Date() (evita el corrimiento de día
// en UTC-3 que arrastran las otras filas de fecha de esta ficha).
const fmtDia = (s?: string) => (s ? s.split('T')[0].split('-').reverse().join('/') : undefined);

const money = (n: number, moneda = 'ARS') =>
    `${moneda === 'USD' ? 'US$' : '$'}${Number(n || 0).toLocaleString('es-AR')}`;

// Estado de la documentación (VTV/seguro) para el badge de la ficha: vencida (alguna
// ya pasó) tiene prioridad sobre por vencer (alguna dentro de 30 días).
const docStatus = (vtv?: string, seguro?: string): { label: string; variant: 'danger' | 'warning' } | null => {
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    const en30 = new Date(hoy); en30.setDate(en30.getDate() + 30);
    const parse = (s?: string) => (s ? new Date(`${s.split('T')[0]}T00:00:00`) : null);
    const fechas = [parse(vtv), parse(seguro)].filter((d): d is Date => d !== null);
    if (fechas.some((d) => d < hoy)) return { label: 'Documentación vencida', variant: 'danger' };
    if (fechas.some((d) => d <= en30)) return { label: 'Documentación por vencer', variant: 'warning' };
    return null;
};

interface VehiculoFull extends Vehiculo {
    archivos?: VehiculoArchivo[];
    gastos?: GastoVehiculo[];
    movimientos?: VehiculoMovimiento[];
    presupuestos?: { id: number; nroPresupuesto?: string; cliente?: { nombre: string }; fechaEmision?: string; estado?: string; precioFinal?: number }[];
    reservas?: { id: number; cliente?: { nombre: string }; montoSena?: number; fechaVencimiento?: string; estado?: string }[];
    ventas?: { id: number; cliente?: { nombre: string }; fechaVenta?: string; precioFinal?: number; formaPago?: string; estadoEntrega?: string }[];
    proveedorCompra?: { id: number; nombre: string };
}

const TIPO_ARCHIVO_OPTS = ['foto', 'documento', 'comprobante', 'plano', 'otro'];

const TIPO_ARCHIVO_ICONS: Record<string, LucideIcon> = {
    foto: Image,
    documento: FileIcon,
    comprobante: FileIcon,
    plano: FileIcon,
    otro: FileImage,
};

const VehiculoDetallePage = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { addToast } = useUIStore();
    // Publicar en Mercado Libre (y consultar la cuenta vinculada) es admin-only en
    // el backend: se oculta la tarjeta entera para el resto de los roles, si no
    // serían botones muertos que siempre dan 403.
    // La pestaña Archivos también tiene permisos distintos por acción, y el corte no
    // es obvio: postventa SUBE y BORRA (documentar con fotos la unidad que pasó por
    // el taller es su trabajo) pero NO marca la portada, que es decisión comercial.
    // Ver hooks/usePermisos.ts.
    const permisos = usePermisos();
    const puedePublicarMl = permisos.esAdmin;

    const [activeTab, setActiveTab] = useState<Tab>('info');
    const [vehiculo, setVehiculo] = useState<VehiculoFull | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [descargandoFicha, setDescargandoFicha] = useState(false);

    // Archivos state
    const [archivos, setArchivos] = useState<VehiculoArchivo[]>([]);
    const [loadingArchivos, setLoadingArchivos] = useState(false);

    // Movimientos state
    const [movList, setMovList] = useState<VehiculoMovimiento[]>([]);
    const [loadingMov, setLoadingMov] = useState(false);

    // Gastos state
    const [gastosList, setGastosList] = useState<GastoVehiculo[]>([]);
    const [loadingGastos, setLoadingGastos] = useState(false);
    const [gastosCat, setGastosCat] = useState<GastoCategoria[]>([]);
    const [showGastoForm, setShowGastoForm] = useState(false);
    const [gastoForm, setGastoForm] = useState({ categoriaId: '', monto: '', moneda: 'ARS', fechaGasto: '', descripcion: '' });
    const [gastoFormError, setGastoFormError] = useState('');
    const [savingGasto, setSavingGasto] = useState(false);
    const [editGasto, setEditGasto] = useState<GastoVehiculo | null>(null);
    const [editGastoForm, setEditGastoForm] = useState({ monto: '', descripcion: '', fechaGasto: '' });
    const [deletingGastoId, setDeletingGastoId] = useState<number | null>(null);

    const [showArchivoForm, setShowArchivoForm] = useState(false);
    const [archivoTipo, setArchivoTipo] = useState('foto');
    const [archivoDescripcion, setArchivoDescripcion] = useState('');

    // Interesados (clientes que marcaron este vehículo como interés) — carga diferida.
    const [interesados, setInteresados] = useState<VehiculoInteres[]>([]);
    const [loadingInteresados, setLoadingInteresados] = useState(false);

    // Historial de precios de lista — carga diferida.
    const [precios, setPrecios] = useState<VehiculoPrecioHistorial[]>([]);
    const [loadingPrecios, setLoadingPrecios] = useState(false);

    useEffect(() => {
        if (!id) return;
        setLoading(true);
        vehiculosApi.getById(Number(id))
            .then(res => {
                setVehiculo(res as VehiculoFull);
            })
            .catch(() => setError('No se pudo cargar el vehículo.'))
            .finally(() => setLoading(false));
    }, [id]);

    // Descarga la ficha del vehículo en PDF (de cara al cliente, con la marca del
    // tenant). Mismo patrón de descarga de blob que los comprobantes.
    const handleFicha = async () => {
        if (!vehiculo) return;
        setDescargandoFicha(true);
        try {
            const blob = await vehiculosApi.fichaPdf(vehiculo.id) as unknown as Blob;
            const url = window.URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `ficha-${vehiculo.marca}-${vehiculo.modelo}-${vehiculo.id}.pdf`.replace(/\s+/g, '-'));
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
        } catch {
            addToast('Error al generar la ficha', 'error');
        } finally {
            setDescargandoFicha(false);
        }
    };

    // Comparte un resumen del vehículo por WhatsApp. Sin destinatario: abre WhatsApp
    // con el borrador y el vendedor elige el contacto (no se envía nada solo).
    const handleCompartir = () => {
        if (!vehiculo) return;
        const v = vehiculo;
        const titulo = `${v.marca} ${v.modelo}${v.version ? ' ' + v.version : ''}${v.anio ? ` (${v.anio})` : ''}`.trim();
        // precioLista 0 (o ausente) => "Consultar precio", igual que el resto de la
        // página (líneas 500/563 tratan el 0 como sin precio). Chequeo truthy.
        const precio = v.precioLista
            ? `${v.moneda === 'USD' ? 'US$' : '$'}${Number(v.precioLista).toLocaleString('es-AR')}`
            : 'Consultar precio';
        const lineas = [
            `Te comparto este vehículo: ${titulo}`,
            `Precio: ${precio}`,
            v.kmIngreso != null ? `Kilómetros: ${Number(v.kmIngreso).toLocaleString('es-AR')} km` : '',
            v.color ? `Color: ${v.color}` : '',
            'Escribime para más info o para coordinar una visita. ¡Gracias!',
        ].filter(Boolean);
        window.open(waShareLink(lineas.join('\n')), '_blank', 'noopener');
    };

    // Marca una foto como principal (la que usa la ficha PDF). El backend desmarca
    // las demás; acá se refleja optimista: sólo la elegida queda como principal.
    const handleSetPrincipal = async (archivo: VehiculoArchivo) => {
        try {
            await vehiculoArchivosApi.setPrincipal(archivo.id);
            addToast('Foto principal actualizada', 'success');
            setArchivos(prev => prev.map(a => ({ ...a, esPrincipal: a.id === archivo.id })));
        } catch (err: unknown) {
            const apiError = err as ApiError;
            addToast(apiError?.message || 'Error al marcar la foto principal', 'error');
        }
    };

    const loadArchivos = useCallback(async () => {
        if (!id) return;
        setLoadingArchivos(true);
        try {
            const res = await vehiculoArchivosApi.getByVehiculo(Number(id));
            setArchivos((res as VehiculoArchivo[]) || []);
        } catch {
            addToast('Error al cargar archivos', 'error');
        } finally {
            setLoadingArchivos(false);
        }
    }, [id, addToast]);

    useEffect(() => {
        if (activeTab === 'archivos') loadArchivos();
    }, [activeTab, loadArchivos]);

    const loadMovimientos = useCallback(async () => {
        if (!id) return;
        setLoadingMov(true);
        try {
            const res = await vehiculoMovimientosApi.getAll({ vehiculoId: Number(id) }) as PaginatedResponse<VehiculoMovimiento>;
            setMovList(res?.results || []);
        } catch {
            addToast('Error al cargar movimientos', 'error');
        } finally {
            setLoadingMov(false);
        }
    }, [id, addToast]);

    useEffect(() => {
        if (activeTab === 'movimientos') loadMovimientos();
    }, [activeTab, loadMovimientos]);

    const loadGastos = useCallback(async () => {
        if (!id) return;
        setLoadingGastos(true);
        try {
            const res = await gastosApi.getAll({ vehiculoId: Number(id), tipo: 'VEHICULO' });
            setGastosList(res?.results || []);
        } catch {
            addToast('Error al cargar gastos', 'error');
        } finally {
            setLoadingGastos(false);
        }
    }, [id, addToast]);

    /*
     * La tarjeta "Total gastos" de la cabecera lee de `gastosList`, y `gastosList`
     * sólo lo llenaba el efecto de la pestaña: hasta que el admin no entraba a
     * "Gastos", la cabecera mostraba "$0 ARS" sobre una unidad con preparación
     * cargada. Se carga la lista apenas se sabe que este usuario puede verla; las
     * CATEGORÍAS (que sólo sirven para el formulario de alta) siguen esperando a
     * la pestaña, que es cuando hacen falta.
     */
    useEffect(() => {
        if (permisos.vePrecioDeCompra) loadGastos();
    }, [permisos.vePrecioDeCompra, loadGastos]);

    useEffect(() => {
        if (activeTab === 'gastos') {
            gastosCategoriaApi.getAll().then(res => {
                if (Array.isArray(res)) setGastosCat(res);
                else setGastosCat(res?.results ?? []);
            }).catch(() => { });
        }
    }, [activeTab]);

    const loadInteresados = useCallback(async () => {
        if (!id) return;
        setLoadingInteresados(true);
        try {
            const res = await vehiculoInteresApi.getByVehiculo(Number(id));
            setInteresados(Array.isArray(res) ? res : (res as PaginatedResponse<VehiculoInteres>)?.results ?? []);
        } catch {
            addToast('Error al cargar los interesados', 'error');
        } finally {
            setLoadingInteresados(false);
        }
    }, [id, addToast]);

    useEffect(() => {
        if (activeTab === 'interesados') loadInteresados();
    }, [activeTab, loadInteresados]);

    const loadPrecios = useCallback(async () => {
        if (!id) return;
        setLoadingPrecios(true);
        try {
            const res = await vehiculoPreciosApi.getByVehiculo(Number(id));
            setPrecios(Array.isArray(res) ? res : (res as PaginatedResponse<VehiculoPrecioHistorial>)?.results ?? []);
        } catch {
            addToast('Error al cargar el historial de precios', 'error');
        } finally {
            setLoadingPrecios(false);
        }
    }, [id, addToast]);

    useEffect(() => {
        if (activeTab === 'precios') loadPrecios();
    }, [activeTab, loadPrecios]);

    const handleDeleteInteres = async (i: VehiculoInteres) => {
        if (!window.confirm('¿Quitar a este cliente de los interesados?')) return;
        try {
            await vehiculoInteresApi.delete(i.id);
            addToast('Interés eliminado', 'success');
            setInteresados(prev => prev.filter(x => x.id !== i.id));
        } catch {
            addToast('Error al eliminar el interés', 'error');
        }
    };

    const handleAddGasto = async () => {
        if (!gastoForm.categoriaId || !gastoForm.monto || !gastoForm.fechaGasto) {
            setGastoFormError('Categoría, monto y fecha son requeridos.');
            return;
        }
        setSavingGasto(true);
        setGastoFormError('');
        try {
            // La sede del gasto la determina el vehículo: no se envía sucursalId.
            await gastosApi.create({
                vehiculoId: Number(id),
                categoriaId: Number(gastoForm.categoriaId),
                monto: parseFloat(gastoForm.monto),
                moneda: gastoForm.moneda as 'ARS' | 'USD',
                fechaGasto: new Date(gastoForm.fechaGasto).toISOString(),
                tipo: 'VEHICULO',
                descripcion: gastoForm.descripcion || undefined,
            });
            addToast('Gasto registrado', 'success');
            setShowGastoForm(false);
            setGastoForm({ categoriaId: '', monto: '', moneda: 'ARS', fechaGasto: '', descripcion: '' });
            loadGastos();
        } catch (err: unknown) {
            const apiError = err as ApiError;
            setGastoFormError(apiError?.message ?? 'Error al guardar');
        } finally {
            setSavingGasto(false);
        }
    };

    const openEditGasto = (g: GastoVehiculo) => {
        setEditGasto(g);
        setEditGastoForm({
            monto: String(g.monto),
            descripcion: g.descripcion ?? '',
            fechaGasto: g.fechaGasto ? g.fechaGasto.substring(0, 10) : '',
        });
    };

    const handleUpdateGasto = async () => {
        if (!editGasto) return;
        try {
            const payload: { monto?: number; descripcion?: string; fechaGasto?: string } = {};
            if (editGastoForm.monto) payload.monto = parseFloat(editGastoForm.monto);
            if (editGastoForm.descripcion !== undefined) payload.descripcion = editGastoForm.descripcion;
            if (editGastoForm.fechaGasto) payload.fechaGasto = new Date(editGastoForm.fechaGasto).toISOString();
            await gastosApi.update(editGasto.id, payload);
            addToast('Gasto actualizado', 'success');
            setEditGasto(null);
            loadGastos();
        } catch {
            addToast('Error al actualizar gasto', 'error');
        }
    };

    const handleDeleteGasto = async (gastoId: number) => {
        if (!window.confirm('¿Eliminar este gasto? Esta acción no se puede deshacer.')) return;
        setDeletingGastoId(gastoId);
        try {
            await gastosApi.delete(gastoId);
            addToast('Gasto eliminado', 'success');
            loadGastos();
        } catch {
            addToast('Error al eliminar gasto', 'error');
        } finally {
            setDeletingGastoId(null);
        }
    };

    const handleArchivoUploaded = () => {
        addToast('Archivo subido correctamente', 'success');
        setArchivoTipo('foto');
        setArchivoDescripcion('');
        setShowArchivoForm(false);
        loadArchivos();
    };

    const handleDeleteArchivo = async (archivo: VehiculoArchivo) => {
        const label = archivo.originalName ?? archivo.descripcion ?? `Archivo ${archivo.id}`;
        if (!window.confirm(`¿Eliminar el archivo "${label}"?`)) return;
        try {
            await vehiculoArchivosApi.delete(archivo.id);
            addToast('Archivo eliminado', 'success');
            setArchivos(prev => prev.filter(a => a.id !== archivo.id));
        } catch (err: unknown) {
            const apiError = err as ApiError;
            addToast(apiError?.message || 'Error al eliminar archivo', 'error');
        }
    };

    const gastoColumns: Column<GastoVehiculo>[] = [
        {
            header: 'Categoría',
            accessor: (g) => g.categoria?.nombre || '-'
        },
        {
            header: 'Fecha',
            accessor: (g) => formatFecha(g.fechaGasto)
        },
        {
            header: 'Monto',
            accessor: (g) => (
                <span className="fw-bold">${Number(g.monto).toLocaleString('es-AR')}</span>
            )
        },
        {
            header: 'Moneda',
            accessor: 'moneda' as keyof GastoVehiculo
        },
        {
            header: 'Descripción',
            accessor: 'descripcion' as keyof GastoVehiculo
        },
        {
            header: '',
            align: 'right',
            accessor: (g) => (
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button className="icon-btn small" onClick={(e) => { e.stopPropagation(); openEditGasto(g); }} title="Editar"><Edit size={14} /></button>
                    <button className="icon-btn small danger" onClick={(e) => { e.stopPropagation(); handleDeleteGasto(g.id); }} disabled={deletingGastoId === g.id} title="Eliminar"><Trash2 size={14} /></button>
                </div>
            )
        }
    ];

    const movColumns: Column<VehiculoMovimiento>[] = [
        {
            header: 'Tipo',
            accessor: (m) => <span className="tipo-chip">{m.tipo}</span>
        },
        {
            header: 'Fecha',
            accessor: (m) => m.fecha ? new Date(m.fecha).toLocaleDateString('es-AR') : m.createdAt ? new Date(m.createdAt).toLocaleDateString('es-AR') : '-'
        },
        {
            header: 'Origen',
            accessor: (m) => m.desdeSucursal?.nombre || '-'
        },
        {
            header: 'Destino',
            accessor: (m) => m.hastaSucursal?.nombre || '-'
        },
        {
            header: 'Motivo',
            accessor: 'motivo' as keyof VehiculoMovimiento
        },
        {
            header: 'Registrado por',
            accessor: (m) => <span style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>{m.registradoPor?.nombre || '-'}</span>
        }
    ];

    const presupuestoColumns: Column<{ id: number; nroPresupuesto?: string; cliente?: { nombre: string }; fechaEmision?: string; estado?: string; precioFinal?: number }>[] = [
        {
            header: 'Nro',
            accessor: (p) => <span className="fw-bold">#{p.nroPresupuesto || p.id}</span>
        },
        {
            header: 'Cliente',
            accessor: (p) => p.cliente?.nombre || '-'
        },
        {
            header: 'Fecha',
            accessor: (p) => p.fechaEmision ? new Date(p.fechaEmision).toLocaleDateString('es-AR') : '-'
        },
        {
            header: 'Estado',
            accessor: (p) => <span className="tipo-chip">{p.estado || '-'}</span>
        },
        {
            header: 'Total',
            accessor: (p) => <span className="fw-bold">{p.precioFinal ? `$${Number(p.precioFinal).toLocaleString('es-AR')}` : '-'}</span>
        }
    ];

    const reservaColumns: Column<{ id: number; cliente?: { nombre: string }; montoSena?: number; fechaVencimiento?: string; estado?: string }>[] = [
        {
            header: 'Cliente',
            accessor: (r) => r.cliente?.nombre || '-'
        },
        {
            header: 'Seña',
            accessor: (r) => <span className="fw-bold">{r.montoSena ? `$${Number(r.montoSena).toLocaleString('es-AR')}` : '-'}</span>
        },
        {
            header: 'Vencimiento',
            accessor: (r) => r.fechaVencimiento ? new Date(r.fechaVencimiento).toLocaleDateString('es-AR') : '-'
        },
        {
            header: 'Estado',
            accessor: (r) => <span className="tipo-chip">{r.estado}</span>
        }
    ];

    const ventaColumns: Column<{ id: number; cliente?: { nombre: string }; fechaVenta?: string; precioFinal?: number; formaPago?: string; estadoEntrega?: string }>[] = [
        {
            header: 'Cliente',
            accessor: (v) => v.cliente?.nombre || '-'
        },
        {
            header: 'Fecha',
            accessor: (v) => v.fechaVenta ? new Date(v.fechaVenta).toLocaleDateString('es-AR') : '-'
        },
        {
            header: 'Precio final',
            accessor: (v) => <span className="fw-bold">{v.precioFinal ? `$${Number(v.precioFinal).toLocaleString('es-AR')}` : '-'}</span>
        },
        {
            header: 'Forma de pago',
            accessor: (v) => v.formaPago || '-'
        },
        {
            header: 'Entrega',
            accessor: (v) => <span className="tipo-chip">{v.estadoEntrega || '-'}</span>
        }
    ];

    const interesadosColumns: Column<VehiculoInteres>[] = [
        {
            header: 'Cliente',
            accessor: (i) => i.cliente ? (
                <button
                    type="button"
                    className="link-cell"
                    onClick={() => navigate(`/clientes/${i.clienteId}`)}
                    title="Ver el cliente"
                >
                    {i.cliente.nombre}
                </button>
            ) : `Cliente #${i.clienteId}`,
        },
        {
            header: 'Teléfono',
            accessor: (i) => i.cliente?.telefono || '-',
        },
        {
            header: 'Etapa',
            accessor: (i) => i.cliente?.estadoLead
                ? <span className="tipo-chip" style={{ textTransform: 'capitalize' }}>{i.cliente.estadoLead}</span>
                : '-',
        },
        {
            header: 'Nota',
            accessor: (i) => i.nota || '-',
        },
        {
            header: 'Desde',
            accessor: (i) => i.createdAt ? formatFecha(i.createdAt) : '-',
        },
        {
            header: '',
            align: 'right',
            accessor: (i) => (
                <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                    <button
                        className="icon-btn small"
                        onClick={(e) => { e.stopPropagation(); navigate(`/presupuestos?nuevoClienteId=${i.clienteId}&nuevoVehiculoId=${id}`); }}
                        title="Generar presupuesto para este cliente"
                    >
                        <FileText size={14} />
                    </button>
                    <button className="icon-btn small danger" onClick={(e) => { e.stopPropagation(); handleDeleteInteres(i); }} title="Quitar interesado">
                        <Trash2 size={14} />
                    </button>
                </div>
            ),
        },
    ];

    const precioColumns: Column<VehiculoPrecioHistorial>[] = [
        {
            header: 'Fecha',
            accessor: (h) => formatFecha(h.createdAt),
        },
        {
            header: 'Precio anterior',
            accessor: (h) => h.precioAnterior != null
                ? <span style={{ color: 'var(--text-secondary)' }}>{money(h.precioAnterior, h.moneda)}</span>
                : <span className="tipo-chip">Inicial</span>,
        },
        {
            header: 'Precio nuevo',
            accessor: (h) => <span className="fw-bold">{money(h.precioNuevo, h.moneda)}</span>,
        },
        {
            header: 'Variación',
            accessor: (h) => {
                if (h.precioAnterior == null || h.precioAnterior === 0) return <span style={{ color: 'var(--text-muted)' }}>—</span>;
                const delta = h.precioNuevo - h.precioAnterior;
                if (delta === 0) return <span className="flex items-center gap-1"><Minus size={13} /> 0%</span>;
                const pct = (delta / h.precioAnterior) * 100;
                const up = delta > 0;
                // Convención de ticker: sube = verde (más margen), baja = rojo (rebaja).
                const color = up ? 'var(--accent)' : 'var(--danger)';
                const Icon = up ? TrendingUp : TrendingDown;
                return (
                    <span style={{ color, display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontWeight: 600 }}>
                        <Icon size={14} /> {up ? '+' : '−'}{money(Math.abs(delta), h.moneda)} ({up ? '+' : '−'}{Math.abs(pct).toFixed(1)}%)
                    </span>
                );
            },
        },
        {
            header: 'Motivo',
            accessor: (h) => h.motivo || '—',
        },
        {
            header: 'Registrado por',
            accessor: (h) => <span style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>{h.usuario?.nombre ?? '—'}</span>,
        },
    ];

    const presupuestos = useMemo(() => vehiculo?.presupuestos ?? [], [vehiculo]);
    const reservas = useMemo(() => vehiculo?.reservas ?? [], [vehiculo]);
    const ventas = useMemo(() => vehiculo?.ventas ?? [], [vehiculo]);
    // Los gastos se acumulan por moneda: sumar ARS y USD en un solo número no
    // representa ningún importe real.
    const totalesGastos = useMemo(() => {
        return gastosList.reduce((acc: Record<string, number>, g: GastoVehiculo) => {
            const moneda = g.moneda || 'ARS';
            acc[moneda] = (acc[moneda] || 0) + (Number(g.monto) || 0);
            return acc;
        }, {} as Record<string, number>);
    }, [gastosList]);

    const totalGastosLabel = useMemo(() => {
        const partes = Object.entries(totalesGastos)
            .filter(([, monto]) => monto > 0)
            .map(([moneda, monto]) => `$${monto.toLocaleString('es-AR')} ${moneda}`);
        return partes.length ? partes.join(' · ') : '$0 ARS';
    }, [totalesGastos]);

    if (loading) return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: '0.75rem', color: 'var(--text-secondary)' }}>
            <RefreshCw size={20} className="spin" /> Cargando...
        </div>
    );

    if (error || !vehiculo) return (
        <div style={{ textAlign: 'center', padding: '4rem' }}>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>{error || 'Vehículo no encontrado.'}</p>
            <Button variant="secondary" onClick={() => navigate('/vehiculos')}>
                <ArrowLeft size={16} style={{ marginRight: '0.5rem' }} /> Volver
            </Button>
        </div>
    );

    const tabs: { key: Tab; label: string; icon: LucideIcon; count?: number }[] = [
        { key: 'info', label: 'Información', icon: Car },
        { key: 'archivos', label: 'Archivos', icon: FileImage, count: archivos.length },
        // La pestaña de gastos es el costo de preparación de la unidad: el backend
        // cerró `GET /gastos` a admin (criterio de aceptación 7), así que sin este
        // gate el vendedor abría una pestaña que sólo le devuelve un 403 y un toast
        // de error. Se saca la pestaña, no se tapa el número.
        ...(permisos.vePrecioDeCompra ? [{ key: 'gastos' as Tab, label: 'Gastos', icon: Wrench, count: gastosList.length }] : []),
        { key: 'movimientos', label: 'Movimientos', icon: ArrowLeftRight, count: movList.length },
        { key: 'presupuestos', label: 'Presupuestos', icon: FileText, count: presupuestos.length },
        { key: 'reservas', label: 'Reservas', icon: Bookmark, count: reservas.length },
        { key: 'ventas', label: 'Ventas', icon: ShoppingCart, count: ventas.length },
        { key: 'interesados', label: 'Interesados', icon: Users, count: interesados.length },
        { key: 'precios', label: 'Precios', icon: TrendingUp, count: precios.length },
    ];

    return (
        <div className="detalle-container">
            {/* Header */}
            <div className="detalle-header">
                <button className="back-btn" onClick={() => navigate('/vehiculos')}>
                    <ArrowLeft size={20} />
                </button>
                <div className="vehiculo-hero">
                    <div className="vehiculo-avatar-lg">
                        <Car size={36} />
                    </div>
                    <div>
                        <h1>{vehiculo.marca} {vehiculo.modelo} {vehiculo.version && `· ${vehiculo.version}`}</h1>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.4rem' }}>
                            <span className="dominio-tag">{vehiculo.dominio || 'S/D'}</span>
                            <Badge variant={STATUS_MAP[vehiculo.estado].variant}>{STATUS_MAP[vehiculo.estado].label}</Badge>
                            {(() => {
                                const d = docStatus(vehiculo.vencimientoVtv, vehiculo.vencimientoSeguro);
                                return d ? <Badge variant={d.variant}>{d.label}</Badge> : null;
                            })()}
                            <span className="tipo-chip">{vehiculo.tipo === 'CERO_KM' ? '0 km' : 'Usado'}</span>
                            <span style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>{vehiculo.sucursal?.nombre}</span>
                        </div>
                    </div>
                </div>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <Button variant="secondary" size="sm" onClick={handleCompartir}>
                        <MessageCircle size={16} /> Compartir
                    </Button>
                    <Button variant="secondary" size="sm" onClick={handleFicha} loading={descargandoFicha}>
                        <FileText size={16} /> Ficha PDF
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => navigate(`/vehiculos/${id}/editar`)}>
                        Editar vehículo
                    </Button>
                </div>
            </div>

            {/* Stats */}
            <div className="stats-bar">
                <div className="stat-card glass">
                    <DollarSign size={20} style={{ color: 'var(--accent)' }} />
                    <div>
                        <div className="stat-value">{vehiculo.precioLista ? `$${Number(vehiculo.precioLista).toLocaleString('es-AR')}` : '-'}</div>
                        <div className="stat-label">Precio lista</div>
                    </div>
                </div>
                {/* Sólo admin: es la materia prima del margen. El backend además
                    lo recorta, así que para el resto ni siquiera llega el dato —
                    la tarjeta se esconde para no dejar un "-" permanente. */}
                {permisos.vePrecioDeCompra && (
                    <div className="stat-card glass">
                        <DollarSign size={20} style={{ color: 'var(--warning)' }} />
                        <div>
                            <div className="stat-value">{vehiculo.precioCompra ? `$${Number(vehiculo.precioCompra).toLocaleString('es-AR')}` : '-'}</div>
                            <div className="stat-label">Precio compra</div>
                        </div>
                    </div>
                )}
                {/* Mismo gate que "Precio compra", y por el mismo motivo. El total
                    se calcula SÓLO desde `gastosList`, que se carga al abrir la
                    pestaña "Gastos" — pestaña que ya está detrás de este permiso.
                    Sin el gate, la tarjeta se quedaba con su fallback y afirmaba
                    "$0 ARS" sobre una unidad con $800.000 de preparación: no es una
                    fuga (el dato nunca se pide) pero es un número falso, y un
                    vendedor que lo use para negociar trabaja con información que
                    inventó la pantalla. */}
                {permisos.vePrecioDeCompra && (
                    <div className="stat-card glass">
                        <Wrench size={20} style={{ color: 'var(--danger)' }} />
                        <div>
                            <div className="stat-value">{totalGastosLabel}</div>
                            <div className="stat-label">Total gastos</div>
                        </div>
                    </div>
                )}
                <div className="stat-card glass">
                    <Hash size={20} style={{ color: 'var(--accent-2)' }} />
                    <div>
                        <div className="stat-value">{vehiculo.kmIngreso ? `${vehiculo.kmIngreso.toLocaleString('es-AR')} km` : '-'}</div>
                        <div className="stat-label">Kilómetros</div>
                    </div>
                </div>
            </div>

            {/* Mercado Libre: publicación de esta unidad (alta manual, una por vez) */}
            {puedePublicarMl && <TarjetaMercadoLibre vehiculoId={vehiculo.id} estadoVehiculo={vehiculo.estado} />}

            {/* Tabs */}
            <div className="tabs-bar glass">
                {tabs.map(t => (
                    <button
                        key={t.key}
                        className={`tab-btn ${activeTab === t.key ? 'active' : ''}`}
                        onClick={() => setActiveTab(t.key)}
                    >
                        <t.icon size={15} />
                        <span>{t.label}</span>
                        {t.count !== undefined && <span className="tab-badge">{t.count}</span>}
                    </button>
                ))}
            </div>

            {/* Tab Content */}
            <div className="tab-content glass">

                {/* INFO */}
                {activeTab === 'info' && (
                    <div className="info-grid">
                        <InfoSection title="Datos del vehículo" rows={[
                            { icon: Car, label: 'Marca', value: vehiculo.marca },
                            { icon: Car, label: 'Modelo', value: vehiculo.modelo },
                            { icon: Car, label: 'Versión', value: vehiculo.version },
                            { icon: Calendar, label: 'Año', value: String(vehiculo.anio) },
                            { icon: Hash, label: 'Dominio', value: vehiculo.dominio },
                            { icon: Hash, label: 'VIN', value: vehiculo.vin },
                            { icon: Hash, label: 'Color', value: vehiculo.color },
                            { icon: Hash, label: 'Km ingreso', value: vehiculo.kmIngreso ? `${vehiculo.kmIngreso.toLocaleString()} km` : undefined },
                        ]} />
                        <InfoSection title="Datos de compra" rows={[
                            { icon: MapPin, label: 'Sucursal', value: vehiculo.sucursal?.nombre },
                            { icon: Calendar, label: 'Fecha ingreso', value: vehiculo.fechaIngreso ? new Date(vehiculo.fechaIngreso).toLocaleDateString('es-AR') : undefined },
                            // Datos de compra: sólo admin (ver la tarjeta de arriba). InfoSection
                            // saltea las filas con value undefined, así que para el resto del
                            // equipo estas dos no se dibujan.
                            { icon: Calendar, label: 'Fecha compra', value: permisos.vePrecioDeCompra && vehiculo.fechaCompra ? new Date(vehiculo.fechaCompra).toLocaleDateString('es-AR') : undefined },
                            { icon: DollarSign, label: 'Precio compra', value: permisos.vePrecioDeCompra && vehiculo.precioCompra ? `$${Number(vehiculo.precioCompra).toLocaleString('es-AR')}` : undefined },
                            { icon: DollarSign, label: 'Precio lista', value: vehiculo.precioLista ? `$${Number(vehiculo.precioLista).toLocaleString('es-AR')}` : undefined },
                            // "El vendedor NO VE: … proveedor": el backend lo recorta en
                            // `sanitizarDatosDeCompra`, y el renglón se gatea acá para que no
                            // quede un campo vacío sin explicación.
                            { icon: Car, label: 'Proveedor', value: permisos.vePrecioDeCompra ? vehiculo.proveedorCompra?.nombre : undefined },
                        ]} />
                        <InfoSection title="Documentación" rows={[
                            { icon: Calendar, label: 'Vencimiento VTV', value: fmtDia(vehiculo.vencimientoVtv) },
                            { icon: Calendar, label: 'Vencimiento seguro', value: fmtDia(vehiculo.vencimientoSeguro) },
                        ]} />
                        {vehiculo.observaciones && (
                            <div className="info-section full-width">
                                <h3>Observaciones</h3>
                                <p className="observaciones-text">{vehiculo.observaciones}</p>
                            </div>
                        )}
                    </div>
                )}

                {/* ARCHIVOS — HU-33, HU-34, HU-35 */}
                {activeTab === 'archivos' && (
                    <div>
                        {/* Header actions */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                            <h3 style={{ fontSize: 'var(--text-md)', fontWeight: 700 }}>
                                {archivos.length > 0 ? `${archivos.length} archivo${archivos.length !== 1 ? 's' : ''}` : 'Sin archivos'}
                            </h3>
                            {permisos.archivosSubir && (
                                <Button variant="primary" size="sm" onClick={() => setShowArchivoForm(v => !v)}>
                                    {showArchivoForm ? <><X size={14} style={{ marginRight: '0.4rem' }} />Cancelar</> : <><Upload size={14} style={{ marginRight: '0.4rem' }} />Agregar archivo</>}
                                </Button>
                            )}
                        </div>

                        {/* Upload form */}
                        {showArchivoForm && (
                            <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '1.5rem', marginBottom: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                <h4 style={{ fontWeight: 700, fontSize: 'var(--text-base)', marginBottom: '0.25rem' }}>Nuevo archivo</h4>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                    <Select
                                        dense
                                        label="Tipo"
                                        value={archivoTipo}
                                        onChange={e => setArchivoTipo(e.target.value)}
                                    >
                                        {TIPO_ARCHIVO_OPTS.map(t => (
                                            <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                                        ))}
                                    </Select>
                                    <Input
                                        dense
                                        label="Descripción"
                                        type="text"
                                        placeholder="Descripción opcional"
                                        value={archivoDescripcion}
                                        onChange={e => setArchivoDescripcion(e.target.value)}
                                    />
                                </div>
                                <FileUploader
                                    endpoint={vehiculoArchivosApi.uploadEndpoint}
                                    extraFields={{
                                        vehiculoId: Number(id),
                                        tipo: archivoTipo,
                                        descripcion: archivoDescripcion.trim() || undefined,
                                    }}
                                    onUploaded={handleArchivoUploaded}
                                    accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt,.csv"
                                    label="Seleccionar archivo a subir"
                                />
                                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                    <Button variant="secondary" size="sm" onClick={() => setShowArchivoForm(false)}>Cerrar</Button>
                                </div>
                            </div>
                        )}

                        {/* Files list */}
                        {loadingArchivos ? (
                            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}><RefreshCw size={18} className="spin" /></div>
                        ) : archivos.length === 0 ? (
                            <EmptyState icon={FileImage} text="No hay archivos cargados para este vehículo. Agrega el primero con el botón de arriba." />
                        ) : (
                            (() => {
                                // Group by tipo
                                const grupos = TIPO_ARCHIVO_OPTS.filter(t => archivos.some(a => (a.tipo || 'otro') === t));
                                const sinTipo = archivos.filter(a => !a.tipo || !TIPO_ARCHIVO_OPTS.includes(a.tipo));
                                const allGrupos = [...grupos, ...(sinTipo.length ? ['otro'] : [])]
                                    .filter((g, i, arr) => arr.indexOf(g) === i);

                                return (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                                        {allGrupos.map(grupo => {
                                            const items = archivos.filter(a => (a.tipo || 'otro') === grupo);
                                            if (!items.length) return null;
                                            const IconComp = TIPO_ARCHIVO_ICONS[grupo] ?? FileImage;
                                            return (
                                                <div key={grupo}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', paddingBottom: '0.5rem', borderBottom: '1px solid var(--border)' }}>
                                                        <IconComp size={15} style={{ color: 'var(--text-muted)' }} />
                                                        <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)' }}>
                                                            {grupo.charAt(0).toUpperCase() + grupo.slice(1)} ({items.length})
                                                        </span>
                                                    </div>
                                                    <div className="archivos-grid">
                                                        {items.map((a) => (
                                                            <div key={a.id} className="archivo-card-new">
                                                                <div className="archivo-icon-wrap">
                                                                    <IconComp size={28} />
                                                                </div>
                                                                <div className="archivo-info">
                                                                    <span className="archivo-nombre">
                                                                        {a.originalName ?? a.descripcion ?? `Archivo ${a.id}`}
                                                                        {grupo === 'foto' && a.esPrincipal && (
                                                                            <span style={{ marginLeft: '0.4rem' }}><Badge variant="warning">Principal</Badge></span>
                                                                        )}
                                                                    </span>
                                                                    {a.descripcion && a.originalName && <span className="archivo-desc">{a.descripcion}</span>}
                                                                    <span className="archivo-fecha">
                                                                        {a.createdAt ? new Date(a.createdAt).toLocaleDateString('es-AR') : ''}
                                                                        {a.sizeBytes ? ` · ${(a.sizeBytes / 1024).toFixed(1)} KB` : ''}
                                                                    </span>
                                                                </div>
                                                                <div className="archivo-actions">
                                                                    {/* Sólo las fotos pueden ser la principal del vehículo. */}
                                                                    {grupo === 'foto' && (permisos.archivosMarcarPrincipal || a.esPrincipal) && (
                                                                        a.esPrincipal ? (
                                                                            <span className="icon-btn" title="Foto principal" style={{ color: 'var(--warning)', cursor: 'default' }}>
                                                                                <Star size={15} fill="currentColor" />
                                                                            </span>
                                                                        ) : (
                                                                            <button className="icon-btn" title="Marcar como foto principal" onClick={() => handleSetPrincipal(a)}>
                                                                                <Star size={15} />
                                                                            </button>
                                                                        )
                                                                    )}
                                                                    <a href={a.url} target="_blank" rel="noreferrer" className="icon-btn" title="Ver archivo">
                                                                        <ExternalLink size={15} />
                                                                    </a>
                                                                    {permisos.archivosBorrar && (
                                                                        <button className="icon-btn danger" title="Eliminar" onClick={() => handleDeleteArchivo(a)}>
                                                                            <Trash2 size={15} />
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                );
                            })()
                        )}
                    </div>
                )}

                {/* GASTOS */}
                {activeTab === 'gastos' && (
                    <div>
                        {/* Add gasto button */}
                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
                            <Button variant="primary" size="sm" onClick={() => { setShowGastoForm(v => !v); setGastoFormError(''); }}>
                                {showGastoForm ? <><X size={14} style={{ marginRight: '0.4rem' }} />Cancelar</> : <><Plus size={14} style={{ marginRight: '0.4rem' }} />Registrar gasto</>}
                            </Button>
                        </div>

                        {/* Create gasto inline form */}
                        {showGastoForm && (
                            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '1.25rem', marginBottom: '1rem' }}>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.75rem', marginBottom: '0.75rem' }}>
                                    <Select dense label="Categoría*" placeholder="Seleccionar..." options={gastosCat.map((c: GastoCategoria) => ({ value: c.id, label: c.nombre }))} value={gastoForm.categoriaId} onChange={e => setGastoForm(f => ({ ...f, categoriaId: e.target.value }))} />
                                    <Input dense label="Monto*" type="number" value={gastoForm.monto} onChange={e => setGastoForm(f => ({ ...f, monto: e.target.value }))} placeholder="0.00" min="0" step="0.01" />
                                    <Select dense label="Moneda*" value={gastoForm.moneda} onChange={e => setGastoForm(f => ({ ...f, moneda: e.target.value }))}>
                                        <option value="ARS">ARS</option>
                                        <option value="USD">USD</option>
                                    </Select>
                                    <Input dense label="Fecha*" type="date" value={gastoForm.fechaGasto} onChange={e => setGastoForm(f => ({ ...f, fechaGasto: e.target.value }))} />
                                    <Input dense label="Descripción" value={gastoForm.descripcion} onChange={e => setGastoForm(f => ({ ...f, descripcion: e.target.value }))} placeholder="Opcional" />
                                </div>
                                {gastoFormError && <p style={{ color: 'var(--danger)', fontSize: 'var(--text-sm)', marginBottom: '0.5rem' }}>{gastoFormError}</p>}
                                <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                                    <Button variant="secondary" size="sm" onClick={() => { setShowGastoForm(false); setGastoFormError(''); }}>Cancelar</Button>
                                    <Button variant="primary" size="sm" onClick={handleAddGasto} disabled={savingGasto}>
                                        {savingGasto ? 'Guardando...' : <><Plus size={14} style={{ marginRight: '0.4rem' }} />Guardar gasto</>}
                                    </Button>
                                </div>
                            </div>
                        )}

                        {/* Total bar */}
                        {gastosList.length > 0 && (
                            <div className="total-bar">
                                <span>Total gastos</span>
                                <strong>{totalGastosLabel}</strong>
                            </div>
                        )}

                        <DataTable
                            columns={gastoColumns}
                            data={gastosList}
                            isLoading={loadingGastos}
                            emptyMessage="No hay gastos registrados para este vehículo."
                            emptyIcon={<Wrench size={40} className="text-secondary" />}
                        />

                        {editGasto && (
                            <div className="edit-gasto-modal glass" style={{ marginTop: '1rem', padding: '1.5rem', borderRadius: 'var(--radius-lg)', border: '1px solid var(--accent)' }}>
                                <h4 style={{ marginBottom: '1rem', fontWeight: 700 }}>Editar Gasto: {editGasto.categoria?.nombre}</h4>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                                    <Input dense label="Monto" type="number" value={editGastoForm.monto} onChange={e => setEditGastoForm(f => ({ ...f, monto: e.target.value }))} />
                                    <Input dense label="Fecha" type="date" value={editGastoForm.fechaGasto} onChange={e => setEditGastoForm(f => ({ ...f, fechaGasto: e.target.value }))} />
                                    <Input dense label="Descripción" value={editGastoForm.descripcion} onChange={e => setEditGastoForm(f => ({ ...f, descripcion: e.target.value }))} />
                                </div>
                                <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                                    <Button variant="secondary" size="sm" onClick={() => setEditGasto(null)}>Cancelar</Button>
                                    <Button variant="primary" size="sm" onClick={handleUpdateGasto}>Guardar Cambios</Button>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* MOVIMIENTOS */}
                {activeTab === 'movimientos' && (
                    <DataTable
                        columns={movColumns}
                        data={movList}
                        isLoading={loadingMov}
                        emptyMessage="No hay movimientos registrados para este vehículo."
                        emptyIcon={<ArrowLeftRight size={40} className="text-secondary" />}
                    />
                )}

                {/* PRESUPUESTOS */}
                {activeTab === 'presupuestos' && (
                    <DataTable
                        columns={presupuestoColumns}
                        data={presupuestos}
                        emptyMessage="No hay presupuestos para este vehículo."
                        emptyIcon={<FileText size={40} className="text-secondary" />}
                    />
                )}

                {/* RESERVAS */}
                {activeTab === 'reservas' && (
                    <DataTable
                        columns={reservaColumns}
                        data={reservas}
                        emptyMessage="No hay reservas para este vehículo."
                        emptyIcon={<Bookmark size={40} className="text-secondary" />}
                    />
                )}

                {/* VENTAS */}
                {activeTab === 'ventas' && (
                    <DataTable
                        columns={ventaColumns}
                        data={ventas}
                        emptyMessage="Este vehículo no ha sido vendido aún."
                        emptyIcon={<ShoppingCart size={40} className="text-secondary" />}
                    />
                )}

                {/* INTERESADOS — clientes que marcaron este vehículo como interés (CRM↔inventario) */}
                {activeTab === 'interesados' && (
                    <DataTable
                        columns={interesadosColumns}
                        data={interesados}
                        isLoading={loadingInteresados}
                        emptyMessage="Ningún cliente marcó interés en este vehículo todavía."
                        emptyIcon={<Users size={40} className="text-secondary" />}
                    />
                )}

                {/* PRECIOS — historial de precios de lista (registro automático en alta/edición) */}
                {activeTab === 'precios' && (
                    <DataTable
                        columns={precioColumns}
                        data={precios}
                        isLoading={loadingPrecios}
                        emptyMessage="Sin cambios de precio de lista registrados para este vehículo."
                        emptyIcon={<TrendingUp size={40} className="text-secondary" />}
                    />
                )}
            </div>

            <style>{`
                .detalle-container { display: flex; flex-direction: column; gap: 1.75rem; animation: fadeIn 0.4s ease-out; }
                .detalle-header { display: flex; align-items: center; gap: 1.5rem; flex-wrap: wrap; }
                .back-btn { padding: 0.625rem; border-radius: var(--radius-md); background: var(--bg-card); border: 1px solid var(--border); color: var(--text-secondary); transition: all 0.15s; cursor: pointer; }
                .back-btn:hover { background: var(--bg-secondary); color: var(--text-primary); transform: translateX(-2px); }

                .vehiculo-hero { display: flex; align-items: center; gap: 1.25rem; }
                .vehiculo-avatar-lg { width: 72px; height: 72px; border-radius: var(--radius-lg); background: linear-gradient(135deg, var(--accent-2), rgba(var(--accent-2-rgb), 0.75)); color: var(--text-white); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
                .vehiculo-hero h1 { font-size: var(--text-2xl); font-weight: 800; letter-spacing: -0.03em; }

                .dominio-tag { font-family: monospace; background: #334155; color: var(--text-white); padding: 3px 10px; border-radius: var(--radius-xs); font-weight: 700; font-size: var(--text-sm); }
                .tipo-chip { padding: 0.2rem 0.7rem; border-radius: var(--radius-pill); font-size: var(--text-xs); font-weight: 700; background: var(--bg-secondary); color: var(--text-secondary); }

                .stats-bar { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1rem; }
                .stat-card { display: flex; align-items: center; gap: 1rem; padding: 1.25rem 1.5rem; border-radius: var(--radius-lg); border: 1px solid var(--border); }
                .stat-value { font-size: var(--text-lg); font-weight: 800; letter-spacing: -0.02em; }
                .stat-label { font-size: var(--text-xs); color: var(--text-secondary); margin-top: 0.2rem; }

                .tabs-bar { display: flex; gap: 0.4rem; padding: 0.5rem; border-radius: var(--radius-lg); border: 1px solid var(--border); width: fit-content; flex-wrap: wrap; }
                .tab-btn { display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem 1rem; border-radius: var(--radius-md); font-weight: 600; font-size: var(--text-sm); color: var(--text-secondary); transition: all 0.15s; cursor: pointer; }
                .tab-btn:hover { color: var(--text-primary); background: var(--bg-secondary); }
                .tab-btn.active { background: var(--accent); color: var(--text-white); }
                .tab-badge { background: color-mix(in srgb, currentColor 25%, transparent); padding: 0.1rem 0.45rem; border-radius: var(--radius-pill); font-size: var(--text-2xs); font-weight: 700; }
                .tab-btn:not(.active) .tab-badge { background: var(--bg-secondary); color: var(--text-muted); }

                .tab-content { padding: 2rem; border-radius: var(--radius-xl); border: 1px solid var(--border); }

                .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 2rem; }
                .info-section h3 { font-size: var(--text-sm); font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-secondary); margin-bottom: 1.25rem; padding-bottom: 0.5rem; border-bottom: 1px solid var(--border); }
                .info-rows { display: flex; flex-direction: column; gap: 0.75rem; }
                .info-row { display: flex; align-items: center; gap: 0.875rem; }
                .info-row svg { color: var(--text-muted); flex-shrink: 0; }
                .info-label { font-size: var(--text-sm); color: var(--text-secondary); width: 110px; flex-shrink: 0; }
                .info-value { font-weight: 600; font-size: var(--text-base); }
                .full-width { grid-column: span 2; }
                .observaciones-text { color: var(--text-secondary); line-height: 1.6; background: var(--bg-secondary); padding: 1rem; border-radius: var(--radius-md); border: 1px solid var(--border); }

                .total-bar { display: flex; justify-content: space-between; align-items: center; padding: 0.875rem 1rem; background: var(--bg-secondary); border-radius: var(--radius-md); margin-bottom: 1rem; font-size: var(--text-base); }
                .total-bar strong { font-size: var(--text-lg); color: var(--accent); }

                .archivos-grid { display: flex; flex-direction: column; gap: 0.75rem; }
                .archivo-card-new { display: flex; align-items: center; gap: 1rem; padding: 1rem 1.25rem; border: 1px solid var(--border); border-radius: var(--radius-lg); background: var(--bg-secondary); transition: border-color 0.15s; }
                .archivo-card-new:hover { border-color: var(--accent); }
                .archivo-icon-wrap { width: 44px; height: 44px; border-radius: var(--radius-md); background: var(--bg-card); display: flex; align-items: center; justify-content: center; flex-shrink: 0; color: var(--accent); }
                .archivo-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 0.15rem; }
                .archivo-nombre { font-weight: 700; font-size: var(--text-base); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
                .archivo-desc { font-size: var(--text-sm); color: var(--text-muted); }
                .archivo-fecha { font-size: var(--text-xs); color: var(--text-muted); }
                .archivo-actions { display: flex; gap: 0.4rem; flex-shrink: 0; }
                /* .form-label la define index.css (capa global, mismos valores).
                   El .form-input local difiere a propósito apenas (padding/radius
                   propios de esta ficha) y gana la cascada; se mantiene. */
                .form-input { display: block; width: 100%; padding: 0.65rem 0.875rem; background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-md); color: var(--text-primary); font-size: var(--text-sm); outline: none; transition: border-color 0.15s; }
                .form-input:focus { border-color: var(--accent); }
                .fw-bold { font-weight: 700; }
                .link-cell { font-weight: 600; color: var(--accent); background: none; border: none; padding: 0; cursor: pointer; }
                .link-cell:hover { text-decoration: underline; }

                /* Mercado Libre */
                .ml-card { display: flex; flex-direction: column; gap: 1.25rem; }
                .ml-card-titulo { display: flex; align-items: center; gap: 0.5rem; font-size: var(--text-lg); font-weight: 700; }
                .ml-card-nota { font-size: var(--text-sm); color: var(--text-muted); line-height: 1.5; margin-top: 0.25rem; max-width: 68ch; }
                .ml-fila { display: flex; align-items: center; gap: 1.75rem; flex-wrap: wrap; }
                .ml-dato { display: flex; flex-direction: column; gap: 0.15rem; }
                .ml-dato-label { font-size: var(--text-2xs); font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); }
                .ml-dato-valor { font-size: var(--text-sm); font-weight: 600; }
                .ml-acciones { display: flex; gap: 0.5rem; flex-wrap: wrap; margin-left: auto; }
                .ml-hint { font-size: var(--text-sm); color: var(--text-muted); line-height: 1.5; max-width: 68ch; margin: 0; }
                /* El texto de Mercado Libre (qué atributo falta) se muestra tal cual:
                   es la única pista accionable que devuelve la API. */
                .ml-error { margin: 0; padding: 0.75rem 0.9rem; border: 1px solid var(--danger); border-radius: var(--radius-md); background: color-mix(in srgb, var(--danger) 10%, transparent); color: var(--danger); font-size: var(--text-sm); white-space: pre-wrap; word-break: break-word; }
                .ml-aviso { display: flex; gap: 0.6rem; padding: 0.75rem 0.9rem; border: 1px solid var(--warning); border-radius: var(--radius-md); background: color-mix(in srgb, var(--warning) 10%, transparent); color: var(--warning); font-size: var(--text-sm); }
                .ml-aviso svg { flex-shrink: 0; margin-top: 0.15rem; }
                .ml-aviso ul { margin: 0; padding-left: 1.1rem; display: flex; flex-direction: column; gap: 0.25rem; }
                .ml-tipos { display: flex; flex-direction: column; gap: 0.6rem; }
                .ml-tipo { display: flex; align-items: flex-start; gap: 0.7rem; padding: 0.75rem 0.9rem; border: 1px solid var(--border); border-radius: var(--radius-md); cursor: pointer; transition: border-color 0.15s, background 0.15s; }
                .ml-tipo:hover { border-color: var(--accent); }
                .ml-tipo.is-elegido { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 8%, transparent); }
                .ml-tipo-datos { display: flex; flex-direction: column; gap: 0.2rem; }
                .ml-tipo-nombre { font-weight: 700; font-size: var(--text-sm); }
                .ml-tipo-costos { font-size: var(--text-xs); color: var(--text-secondary); }
                .ml-campo-cuenta { display: flex; justify-content: space-between; align-items: baseline; gap: 0.5rem; }

                .spin { animation: spin 1s linear infinite; }
                @keyframes spin { to { transform: rotate(360deg); } }
                @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
            `}</style>
        </div>
    );
};

// ─── Mercado Libre (publicación de la unidad) ───────────────────────────────

/** Mercado Libre corta el título de los ítems en 60 caracteres. */
const MAX_TITULO_ML = 60;

const ESTADO_ML_LABEL: Record<EstadoPublicacionMl, string> = {
    borrador: 'Borrador',
    activa: 'Activa',
    pausada: 'Pausada',
    cerrada: 'Cerrada',
    error: 'Con error',
};

const ESTADO_ML_BADGE: Record<EstadoPublicacionMl, BadgeVariant> = {
    borrador: 'default',
    activa: 'success',
    pausada: 'warning',
    cerrada: 'default',
    error: 'danger',
};

// El precio publicado puede llegar como string (Decimal de Prisma serializado).
const montoMl = (n: number | string | null | undefined, moneda?: string | null): string => {
    if (n === null || n === undefined || n === '') return '—';
    const valor = Number(n);
    if (Number.isNaN(valor)) return '—';
    return `${moneda === 'USD' ? 'US$' : '$'}${valor.toLocaleString('es-AR')}`;
};

const fechaHoraMl = (iso?: string | null): string => {
    if (!iso) return 'Nunca';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return 'Nunca';
    return d.toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
};

/**
 * Costo de un tipo de publicación. `null` NO es gratis: es DESCONOCIDO (ML no
 * devolvió la grilla de tarifas y el backend cayó a los tipos básicos). Decir
 * "sin costo" sobre un botón que cobra plata es la peor de las tres opciones.
 */
const costoMl = (valor: number | null, moneda: string | null | undefined, cero: string): string => {
    if (valor === null || valor === undefined) return 'no informado por Mercado Libre';
    if (valor === 0) return cero;
    return montoMl(valor, moneda);
};

/** Estados en los que el vehículo no está disponible: el backend no los publica. */
const ESTADOS_NO_PUBLICABLES_ML: EstadoVehiculo[] = ['reservado', 'vendido', 'devuelto'];

/**
 * Una cuenta en modo demostración NUNCA sale a la red: sus llamadas las contesta
 * el simulador del backend. Todo lo que muestra la tarjeta con esa cuenta es
 * simulado y se rotula, porque el sistema se muestra a terceros y tienen que
 * poder distinguir sin esfuerzo lo conectado de lo fingido.
 *
 * El simulador emite los ids con prefijo DEMO- para que se distingan a simple
 * vista de un MLA real: rotula el aviso aunque el estado de la cuenta no lo diga.
 */
const esItemSimuladoMl = (itemId?: string | null): boolean => /^DEMO-/i.test(itemId ?? '');

type AccionMl = 'pausar' | 'reactivar' | 'cerrar' | 'sincronizar';

const TarjetaMercadoLibre = ({ vehiculoId, estadoVehiculo }: { vehiculoId: number; estadoVehiculo: EstadoVehiculo }) => {
    const { addToast } = useUIStore();

    const [cargando, setCargando] = useState(true);
    const [errorCarga, setErrorCarga] = useState<string | null>(null);
    const [cuenta, setCuenta] = useState<EstadoCuentaMl | null>(null);
    const [publicacion, setPublicacion] = useState<PublicacionMl | null>(null);
    // Acción de publicación en curso: bloquea la botonera mientras viaja.
    const [accion, setAccion] = useState<AccionMl | null>(null);

    // Modal de publicación: las opciones (categoría, tipos y sus costos) se traen
    // EN VIVO de Mercado Libre al abrirlo, porque las tarifas cambian.
    const [modalAbierto, setModalAbierto] = useState(false);
    const [opciones, setOpciones] = useState<OpcionesPublicacion | null>(null);
    const [cargandoOpciones, setCargandoOpciones] = useState(false);
    const [titulo, setTitulo] = useState('');
    const [listingTypeId, setListingTypeId] = useState('');
    const [publicando, setPublicando] = useState(false);
    const [errorMl, setErrorMl] = useState<string | null>(null);

    // Se calcula acá arriba porque además de rotular la tarjeta cambia lo que
    // dicen los avisos de las acciones: en demostración nada sale a la red.
    //
    // El AVISO se rotula por SU id, no por el modo de la cuenta: un item MLA…
    // existe en Mercado Libre, está publicado y puede estar cobrando, así que
    // jamás puede mostrarse como simulado ni escondérsele el permalink aunque la
    // cuenta vigente sea la de demostración. El modo de la cuenta sólo alcanza
    // para decir qué va a pasar cuando todavía no hay ningún aviso.
    const cuentaDemo = esCuentaDemo(cuenta);
    const avisoSimulado = esItemSimuladoMl(publicacion?.itemId);
    const avisoReal = !!publicacion?.itemId && !avisoSimulado;
    const simulado = avisoSimulado || (cuentaDemo && !avisoReal);

    const cargar = useCallback(async () => {
        setCargando(true);
        try {
            const [est, pub] = await Promise.all([
                mercadolibreApi.getCuenta(),
                mercadolibreApi.getPublicacion(vehiculoId),
            ]);
            setCuenta(est);
            setPublicacion(pub);
            setErrorCarga(null);
        } catch (err: unknown) {
            setErrorCarga(getApiErrorMessage(err, 'No se pudo consultar el estado de Mercado Libre.'));
        } finally {
            setCargando(false);
        }
    }, [vehiculoId]);

    useEffect(() => { cargar(); }, [cargar]);

    const abrirModal = async () => {
        setModalAbierto(true);
        setOpciones(null);
        setErrorMl(null);
        setListingTypeId('');
        setCargandoOpciones(true);
        try {
            const res = await mercadolibreApi.opciones(vehiculoId);
            setOpciones(res);
            setTitulo(res.titulo.slice(0, MAX_TITULO_ML));
            // Con un solo tipo disponible no hay nada que elegir: viene preseleccionado.
            if (res.tipos.length === 1) setListingTypeId(res.tipos[0].listingTypeId);
        } catch (err: unknown) {
            setErrorMl(getApiErrorMessage(err, 'No se pudieron traer las opciones de publicación.'));
        } finally {
            setCargandoOpciones(false);
        }
    };

    const publicar = async () => {
        // Guarda contra el doble envío: publicar cobra un cargo por cada aviso.
        if (publicando || !listingTypeId || !titulo.trim()) return;
        setPublicando(true);
        setErrorMl(null);
        try {
            const pub = await mercadolibreApi.publicar(vehiculoId, {
                listingTypeId,
                titulo: titulo.trim(),
                ...(opciones?.categoriaId ? { categoriaId: opciones.categoriaId } : {}),
            });
            setPublicacion(pub);
            setModalAbierto(false);
            // El aviso efímero tampoco puede afirmar algo que no pasó: con la
            // cuenta simulada el vehículo no se publicó en ningún lado.
            addToast(cuentaDemo || esItemSimuladoMl(pub.itemId) ? 'Publicación simulada creada (no salió a Mercado Libre)' : 'Vehículo publicado en Mercado Libre', 'success');
        } catch (err: unknown) {
            // El mensaje es el de Mercado Libre y dice qué atributo falta: va TEXTUAL.
            setErrorMl(getApiErrorMessage(err, 'Mercado Libre rechazó la publicación.'));
        } finally {
            setPublicando(false);
        }
    };

    const ejecutar = async (cual: AccionMl) => {
        if (!publicacion) return;
        // El confirm es un diálogo del navegador: aparece tapando la tarjeta, sin
        // el chip SIMULACIÓN cerca, y con la autoridad visual de un modal del
        // sistema. Sobre un aviso simulado no puede afirmar que la baja impacta
        // en Mercado Libre — no hay ningún aviso allá que cerrar.
        const confirmarCierre = avisoSimulado
            ? 'Cerrar la publicación simulada. No hay ningún aviso en Mercado Libre: el cierre pasa sólo adentro del sistema y, para volver a ofrecer la unidad, hay que publicarla de nuevo. ¿Cerrarla?'
            : 'Cerrar la publicación es definitivo en Mercado Libre: para volver a ofrecer la unidad hay que publicarla de nuevo. ¿Cerrarla?';
        if (cual === 'cerrar' && !window.confirm(confirmarCierre)) return;
        setAccion(cual);
        try {
            const fn = {
                pausar: mercadolibreApi.pausar,
                reactivar: mercadolibreApi.reactivar,
                cerrar: mercadolibreApi.cerrar,
                sincronizar: mercadolibreApi.sincronizar,
            }[cual];
            const pub = await fn(publicacion.id);
            setPublicacion(pub);
            // Las cuatro acciones se rotulan igual: si la operación la resolvió el
            // simulador, el aviso de éxito lo dice. Antes sólo lo hacía
            // 'sincronizar' y las otras tres salían idénticas al modo real.
            addToast({
                pausar: avisoSimulado ? 'Publicación simulada pausada (no salió a Mercado Libre)' : 'Publicación pausada',
                reactivar: avisoSimulado ? 'Publicación simulada reactivada (no salió a Mercado Libre)' : 'Publicación reactivada',
                cerrar: avisoSimulado ? 'Publicación simulada cerrada (no había ningún aviso en Mercado Libre)' : 'Publicación cerrada',
                sincronizar: avisoSimulado ? 'Publicación sincronizada (simulada)' : 'Publicación sincronizada con Mercado Libre',
            }[cual], 'success');
        } catch (err: unknown) {
            // El rechazo lo emitió el simulador, no Mercado Libre: adjudicárselo a
            // Mercado Libre sería afirmar que hubo una llamada que no existió.
            addToast(getApiErrorMessage(err, avisoSimulado
                ? 'El simulador rechazó la operación.'
                : 'Mercado Libre rechazó la operación.'), 'error');
        } finally {
            setAccion(null);
        }
    };

    const conectada = !!cuenta?.conectada;
    const estado = publicacion?.estado;

    // Un aviso EXISTE en Mercado Libre sólo si tiene itemId. Sin él la fila es un
    // intento local (borrador o error) que nunca llegó, y pausar/reactivar/cerrar/
    // sincronizar dan 409 garantizado: se ofrecen sólo con item.
    const enMercadoLibre = !!publicacion?.itemId;

    // Se puede publicar si no hay aviso vivo: nunca se publicó, el intento
    // anterior no llegó a ML (borrador/error sin itemId) o la publicación está
    // cerrada — en ML cerrar es definitivo y la unidad se ofrece publicándola de
    // nuevo, que es exactamente lo que hace el backend. Antes, cualquier fila
    // hacía desaparecer el botón para siempre y el vehículo quedaba imposible de
    // publicar desde el panel.
    const noPublicable = ESTADOS_NO_PUBLICABLES_ML.includes(estadoVehiculo);
    const puedePublicar = !noPublicable && (!publicacion || estado === 'cerrada' || !enMercadoLibre);
    const esReintento = !!publicacion && puedePublicar;

    const botonPublicar = (
        <Button variant="primary" size="sm" onClick={abrirModal}>
            <ShoppingBag size={15} /> {esReintento ? 'Volver a publicar' : 'Publicar en Mercado Libre'}
        </Button>
    );

    return (
        <div className="card ml-card">
            <div>
                <h3 className="ml-card-titulo">
                    <ShoppingBag size={18} /> Mercado Libre
                    {simulado && <Badge variant="warning">SIMULACIÓN</Badge>}
                </h3>
                {simulado && (
                    <p className="ml-card-nota">
                        <strong>Modo demostración:</strong> la integración está simulada. Se recorre el
                        circuito completo (publicar eligiendo tipo y costo, pausar, reactivar, cerrar,
                        sincronizar), pero no se llama a Mercado Libre.{' '}
                        {avisoSimulado
                            ? (<>La publicación <strong>no existe fuera del sistema</strong> y nadie la ve.</>)
                            : (<>Lo que se publique desde acá <strong>no va a salir a Mercado Libre</strong>.</>)}
                    </p>
                )}
                <p className="ml-card-nota">
                    El precio y la baja se sincronizan solos: si cambiás el precio del vehículo o lo pasás a
                    reservado o vendido, la publicación se actualiza sola.
                </p>
            </div>

            {cargando ? (
                <p className="ml-hint"><RefreshCw size={15} className="spin" style={{ verticalAlign: 'text-bottom', marginRight: '0.4rem' }} />Consultando Mercado Libre…</p>
            ) : errorCarga ? (
                <div className="ml-fila">
                    <p className="ml-error">{errorCarga}</p>
                    <Button variant="secondary" size="sm" onClick={cargar}>Reintentar</Button>
                </div>
            ) : !conectada ? (
                <p className="ml-hint">
                    {cuenta?.configurada === false
                        ? 'La integración con Mercado Libre no está configurada en el servidor: faltan las credenciales de la aplicación (ML_CLIENT_ID / ML_CLIENT_SECRET) o la clave de cifrado de secretos (INTEGRACIONES_SECRET_KEY).'
                        : 'Todavía no hay una cuenta de Mercado Libre vinculada. Vinculala desde Ajustes para poder publicar esta unidad.'}
                </p>
            ) : !publicacion ? (
                <div className="ml-fila">
                    <p className="ml-hint">
                        {noPublicable
                            ? `Esta unidad está en estado "${estadoVehiculo}": no se publica en Mercado Libre stock que no está disponible.`
                            : 'Esta unidad todavía no está publicada.'}
                    </p>
                    {puedePublicar && <div className="ml-acciones">{botonPublicar}</div>}
                </div>
            ) : (
                <>
                    <div className="ml-fila">
                        <div className="ml-dato">
                            <span className="ml-dato-label">Estado</span>
                            <span className="ml-dato-valor">
                                <Badge variant={ESTADO_ML_BADGE[publicacion.estado]}>{ESTADO_ML_LABEL[publicacion.estado]}</Badge>
                            </span>
                        </div>
                        <div className="ml-dato">
                            <span className="ml-dato-label">Precio publicado</span>
                            <span className="ml-dato-valor">{montoMl(publicacion.precioPublicado, publicacion.monedaPublicada)}</span>
                        </div>
                        <div className="ml-dato">
                            <span className="ml-dato-label">Última sincronización</span>
                            <span className="ml-dato-valor">{fechaHoraMl(publicacion.ultimaSyncAt)}</span>
                        </div>
                        {/* El id del aviso sólo se muestra en demostración: ahí importa que
                            se vea el DEMO- y que no se confunda con un MLA de verdad. */}
                        {avisoSimulado && (
                            <div className="ml-dato">
                                <span className="ml-dato-label">Id simulado</span>
                                <span className="ml-dato-valor font-mono">{publicacion.itemId}</span>
                            </div>
                        )}
                        {/* En demostración no hay aviso publicado: donde iría el link va el
                            texto que lo dice, nunca algo que parezca un link a Mercado Libre.
                            Se decide por el id del AVISO: un permalink real no se esconde. */}
                        {avisoSimulado ? (
                            <div className="ml-dato">
                                <span className="ml-dato-label">Publicación</span>
                                <span className="ml-dato-valor text-muted">Simulada: no existe en Mercado Libre</span>
                            </div>
                        ) : publicacion.permalink && (
                            <div className="ml-dato">
                                <span className="ml-dato-label">Publicación</span>
                                <span className="ml-dato-valor">
                                    <a href={publicacion.permalink} target="_blank" rel="noopener noreferrer" className="link-cell">
                                        Ver en Mercado Libre <ExternalLink size={13} style={{ verticalAlign: 'text-bottom' }} />
                                    </a>
                                </span>
                            </div>
                        )}

                        {/* Todo lo que toca el aviso exige que el aviso exista. */}
                        <div className="ml-acciones">
                            {enMercadoLibre && estado === 'activa' && (
                                <Button variant="secondary" size="sm" loading={accion === 'pausar'} disabled={!!accion} onClick={() => ejecutar('pausar')}>
                                    <Pause size={14} /> Pausar
                                </Button>
                            )}
                            {enMercadoLibre && estado === 'pausada' && (
                                <Button variant="secondary" size="sm" loading={accion === 'reactivar'} disabled={!!accion} onClick={() => ejecutar('reactivar')}>
                                    <Play size={14} /> Reactivar
                                </Button>
                            )}
                            {enMercadoLibre && estado !== 'cerrada' && (
                                <Button variant="secondary" size="sm" loading={accion === 'cerrar'} disabled={!!accion} onClick={() => ejecutar('cerrar')}>
                                    <Ban size={14} /> Cerrar
                                </Button>
                            )}
                            {enMercadoLibre && (
                                <Button variant="outline" size="sm" loading={accion === 'sincronizar'} disabled={!!accion} onClick={() => ejecutar('sincronizar')}>
                                    <RefreshCw size={14} /> Sincronizar
                                </Button>
                            )}
                            {puedePublicar && botonPublicar}
                        </div>
                    </div>

                    {/* Sin itemId no hay nada en Mercado Libre: se dice, porque el
                        badge "Borrador"/"Con error" no lo deja claro solo. */}
                    {!enMercadoLibre && estado !== 'cerrada' && (
                        <p className="ml-hint">
                            Este intento no llegó a Mercado Libre: no hay ningún aviso publicado.
                            {puedePublicar ? ' Corregí lo que haga falta y volvé a publicar.' : ''}
                        </p>
                    )}
                    {noPublicable && estado !== 'cerrada' && (
                        <p className="ml-hint">
                            El vehículo está en estado "{estadoVehiculo}": la publicación se cierra o se pausa sola.
                        </p>
                    )}

                    {publicacion.ultimoError && (
                        <p className="ml-error">{publicacion.ultimoError}</p>
                    )}
                </>
            )}

            <Modal
                isOpen={modalAbierto}
                onClose={() => setModalAbierto(false)}
                title="Publicar en Mercado Libre"
                subtitle={cuentaDemo
                    ? 'Modo demostración: los costos de abajo son simulados, no se cobra nada y el aviso no sale a Mercado Libre.'
                    : 'Elegí el tipo de publicación: cada uno cobra distinto.'}
                maxWidth="640px"
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setModalAbierto(false)}>Cancelar</Button>
                        <Button
                            variant="primary"
                            loading={publicando}
                            disabled={!opciones || !listingTypeId || !titulo.trim()}
                            onClick={publicar}
                        >
                            <ShoppingBag size={16} /> Publicar
                        </Button>
                    </>
                }
            >
                {cargandoOpciones ? (
                    <p className="ml-hint"><RefreshCw size={15} className="spin" style={{ verticalAlign: 'text-bottom', marginRight: '0.4rem' }} />Consultando categorías y tarifas…</p>
                ) : !opciones ? (
                    errorMl ? <p className="ml-error">{errorMl}</p> : null
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                        <Input
                            dense
                            label="Título de la publicación"
                            type="text"
                            value={titulo}
                            maxLength={MAX_TITULO_ML}
                            hint={`${titulo.length}/${MAX_TITULO_ML} caracteres`}
                            onChange={(e) => setTitulo(e.target.value)}
                        />

                        <div className="ml-fila">
                            <div className="ml-dato">
                                <span className="ml-dato-label">Categoría detectada</span>
                                <span className="ml-dato-valor">{opciones.categoriaNombre ?? opciones.categoriaId ?? 'Sin detectar'}</span>
                            </div>
                            <div className="ml-dato">
                                <span className="ml-dato-label">Precio</span>
                                <span className="ml-dato-valor">{montoMl(opciones.precio, opciones.moneda)}</span>
                            </div>
                            <div className="ml-dato">
                                <span className="ml-dato-label">Fotos</span>
                                <span className="ml-dato-valor">{opciones.fotos}</span>
                            </div>
                        </div>

                        {opciones.advertencias.length > 0 && (
                            <div className="ml-aviso">
                                <AlertTriangle size={16} />
                                <ul>
                                    {opciones.advertencias.map((a) => <li key={a}>{a}</li>)}
                                </ul>
                            </div>
                        )}

                        {/* Quién pide estos atributos NO es lo mismo en los dos modos:
                            con la cuenta simulada la lista sale del simulador, no de
                            una consulta a Mercado Libre. Decir "Mercado Libre pide"
                            ahí daba a entender que la cuenta está conectada de verdad,
                            que es justo el equívoco que la demostración evita. */}
                        {opciones.atributosFaltantes.length > 0 && (
                            <div className="ml-aviso">
                                <AlertTriangle size={16} />
                                <div>
                                    {cuentaDemo ? (
                                        <>
                                            <Badge variant="warning">SIMULACIÓN</Badge>{' '}
                                            El simulador pide estos datos obligatorios para la categoría y el vehículo no los tiene cargados:{' '}
                                            <strong>{opciones.atributosFaltantes.map((a) => a.nombre).join(', ')}</strong>.
                                            La lista es la que usaría Mercado Libre para autos, pero no se consultó Mercado Libre.
                                        </>
                                    ) : (
                                        <>
                                            Mercado Libre pide estos datos obligatorios para la categoría y el vehículo no los tiene cargados:{' '}
                                            <strong>{opciones.atributosFaltantes.map((a) => a.nombre).join(', ')}</strong>.
                                            Si los rechaza, cargalos en la ficha del vehículo y volvé a intentar.
                                        </>
                                    )}
                                </div>
                            </div>
                        )}

                        <div>
                            <h4 style={{ fontSize: 'var(--text-sm)', fontWeight: 700, marginBottom: '0.6rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                Tipo de publicación
                                {cuentaDemo && <Badge variant="warning">SIMULACIÓN</Badge>}
                            </h4>
                            {/* Los costos son el corazón de la elección: si son simulados hay
                                que decirlo justo al lado, no en otra parte de la pantalla. */}
                            {cuentaDemo && (
                                <p className="ml-hint" style={{ marginBottom: '0.6rem' }}>
                                    Costos y comisiones <strong>simulados</strong>: los devuelve el simulador del
                                    sistema, no la tarifa real de Mercado Libre.
                                </p>
                            )}
                            {opciones.tipos.length === 0 ? (
                                <p className="ml-hint">Mercado Libre no devolvió tipos de publicación para esta categoría y precio.</p>
                            ) : (
                                <div className="ml-tipos">
                                    {opciones.tipos.map((t) => (
                                        <label key={t.listingTypeId} className={`ml-tipo ${listingTypeId === t.listingTypeId ? 'is-elegido' : ''}`}>
                                            <input
                                                type="radio"
                                                name="ml-listing-type"
                                                value={t.listingTypeId}
                                                checked={listingTypeId === t.listingTypeId}
                                                onChange={() => setListingTypeId(t.listingTypeId)}
                                            />
                                            <span className="ml-tipo-datos">
                                                <span className="ml-tipo-nombre">{t.nombre}</span>
                                                <span className="ml-tipo-costos">
                                                    Costo de publicación: {costoMl(t.costoPublicacion, t.moneda, 'sin costo')}
                                                    {' · '}
                                                    Comisión por venta: {costoMl(t.comisionVenta, t.moneda, 'sin comisión')}
                                                </span>
                                            </span>
                                        </label>
                                    ))}
                                </div>
                            )}
                        </div>

                        {errorMl && <p className="ml-error">{errorMl}</p>}
                    </div>
                )}
            </Modal>
        </div>
    );
};

const InfoSection = ({ title, rows }: { title: string; rows: { icon: LucideIcon; label: string; value?: string }[] }) => {
    const filtered = rows.filter(r => r.value !== undefined && r.value !== null && r.value !== '');
    return (
        <div className="info-section">
            <h3>{title}</h3>
            <div className="info-rows">
                {filtered.map(r => (
                    <div key={r.label} className="info-row">
                        <r.icon size={15} />
                        <span className="info-label">{r.label}</span>
                        <span className="info-value">{r.value}</span>
                    </div>
                ))}
                {filtered.length === 0 && <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>Sin datos disponibles.</p>}
            </div>
        </div>
    );
};

const EmptyState = ({ icon: Icon, text }: { icon: LucideIcon; text: string }) => (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', padding: '3rem', color: 'var(--text-muted)', textAlign: 'center' }}>
        <Icon size={48} style={{ opacity: 0.2 }} />
        <p>{text}</p>
    </div>
);

export default VehiculoDetallePage;
