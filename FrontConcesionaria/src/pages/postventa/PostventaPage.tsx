import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
    Plus, Search, X, ChevronLeft, ChevronRight,
    Eye, Trash2, Edit, ArrowRight, CheckCircle, Package, Wrench, Clock, RefreshCw, Tags,
    Calendar, MessageCircle, FileText, FileDown
} from 'lucide-react';
import { waLink } from '../../utils/whatsapp';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Textarea from '../../components/ui/Textarea';
import { postventaApi } from '../../api/postventa.api';
import { useAuthStore } from '../../store/authStore';
import type { PostventaCaso, PostventaItem, CreateCasoDto, CreateItemDto, EstadoPostventa, TipoPostventa } from '../../api/postventa.api';
import { clientesApi } from '../../api/clientes.api';
import { vehiculosApi } from '../../api/vehiculos.api';
import { ventasApi } from '../../api/ventas.api';
import { sucursalesApi } from '../../api/sucursales.api';
import { proveedoresApi } from '../../api/proveedores.api';
import { useUIStore } from '../../store/uiStore';
import { formatFecha } from '../../utils/fecha';
import { getList } from '../../utils/lista';
import { getErrorMessage } from '../../utils/getErrorMessage';

// ─── Estado mappings ──────────────────────────────────────────────────────────
const ESTADO_LABELS: Record<EstadoPostventa, string> = {
    pendiente: 'Pendiente',
    en_curso: 'En Curso',
    resuelto: 'Resuelto',
};

const ESTADO_COLORS: Record<EstadoPostventa, string> = {
    pendiente: '#f59e0b',
    en_curso: '#60a5fa',
    resuelto: '#22c55e',
};

// Espejo de la máquina de estados del backend (domain/services/stateMachine.ts).
// Desde 'pendiente' se puede cerrar directo: un reclamo que se revisa y no era
// nada no tiene por qué pasar por 'en_curso' de mentira. La flecha rápida de la
// tabla usa la primera opción (avanzar un paso); para cerrar directo se entra al
// detalle, que ofrece un botón por cada transición posible.
const ESTADO_TRANSITIONS: Record<EstadoPostventa, EstadoPostventa[]> = {
    pendiente: ['en_curso', 'resuelto'],
    en_curso: ['resuelto'],
    resuelto: [],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (v?: string | number | null) =>
    v != null ? Number(v).toLocaleString('es-AR', { minimumFractionDigits: 2 }) : '-';

// fechaReclamo y fechaCierre son @db.Date: `new Date(d).toLocaleDateString()`
// las bajaba un día en UTC-3. formatFecha parsea el ISO como texto.
const fmtDate = formatFecha;

const today = () => new Date().toISOString().split('T')[0];

// Fecha local YYYY-MM-DD (no toISOString, que pasa a UTC y de noche en UTC-3 ya
// es "mañana"): se usa para clasificar los turnos en Hoy / Mañana / Vencido.
const localISO = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// ─── Main Component ───────────────────────────────────────────────────────────
export default function PostventaPage() {
    const addToast = useUIStore((s) => s.addToast);

    // ─ List state ─
    const [casos, setCasos] = useState<PostventaCaso[]>([]);
    const [loading, setLoading] = useState(false);
    const [stats, setStats] = useState({ pendiente: 0, en_curso: 0, resuelto: 0 });
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [search, setSearch] = useState('');
    const [filterEstado, setFilterEstado] = useState('');
    // Export CSV: admin/vendedor/postventa (mismo criterio que el endpoint).
    const user = useAuthStore((s) => s.user);
    const puedeExportar = !!user?.roles?.some((r) => r === 'admin' || r === 'super_admin' || r === 'vendedor' || r === 'postventa');
    const [exportando, setExportando] = useState(false);
    const [filterSucursal, setFilterSucursal] = useState('');
    const [filterTipo, setFilterTipo] = useState('');

    // ─ Pestañas: casos | agenda de taller | ABM de tipos ─
    // Deep-link ?tab=agenda: lo usa la tarjeta "Turnos de taller" del Dashboard.
    const [searchParams] = useSearchParams();
    const paramTab = searchParams.get('tab');
    const [tab, setTab] = useState<'casos' | 'agenda' | 'tipos'>(
        paramTab === 'agenda' || paramTab === 'tipos' ? paramTab : 'casos',
    );

    // ─ Agenda de taller (casos con turno, no resueltos) ─
    const [agenda, setAgenda] = useState<PostventaCaso[]>([]);
    const [loadingAgenda, setLoadingAgenda] = useState(false);

    // ─ Catálogo de tipos (ABM) ─
    const [tipos, setTipos] = useState<TipoPostventa[]>([]);
    const [loadingTipos, setLoadingTipos] = useState(false);
    const [showTipoModal, setShowTipoModal] = useState(false);
    const [editingTipo, setEditingTipo] = useState<TipoPostventa | null>(null);
    const [deletingTipo, setDeletingTipo] = useState<TipoPostventa | null>(null);
    const [tipoForm, setTipoForm] = useState<{ nombre: string; activo: boolean }>({ nombre: '', activo: true });

    // ─ Catalogs ─
    const [clientes, setClientes] = useState<{ id: number; nombre: string }[]>([]);
    const [vehiculos, setVehiculos] = useState<{ id: number; marca: string; modelo: string; dominio?: string }[]>([]);
    const [ventas, setVentas] = useState<{ id: number; montoTotal?: number; cliente?: { nombre: string }; vehiculo?: { marca: string; modelo: string } }[]>([]);
    const [sucursales, setSucursales] = useState<{ id: number; nombre: string }[]>([]);
    const [proveedores, setProveedores] = useState<{ id: number; nombre: string }[]>([]);

    // ─ Modals ─
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [detailCaso, setDetailCaso] = useState<PostventaCaso | null>(null);
    const [deletingCaso, setDeletingCaso] = useState<PostventaCaso | null>(null);
    const [transicionCaso, setTransicionCaso] = useState<PostventaCaso | null>(null);
    const [showAddItem, setShowAddItem] = useState(false);
    const [deletingItem, setDeletingItem] = useState<PostventaItem | null>(null);
    const [submitting, setSubmitting] = useState(false);

    // ─ Create Caso form ─
    const [casoForm, setCasoForm] = useState<CreateCasoDto & { sucursalId: number; ventaId: number }>({
        clienteId: 0, vehiculoId: 0, sucursalId: 0, ventaId: 0,
        fechaReclamo: today(), tipoId: undefined, descripcion: '',
        fechaTurno: '', horaTurno: '',
    });

    // ─ Turno del caso en detalle (agendar / reprogramar / desagendar) ─
    const [turnoForm, setTurnoForm] = useState({ fechaTurno: '', horaTurno: '' });
    // ─ Facturación al cliente del caso en detalle (monto que se cobra) ─
    const [facturaForm, setFacturaForm] = useState('');
    // Flag propio: el modal de detalle muestra turno y facturación a la vez, así que
    // guardar la facturación no debe poner en loading el botón del turno.
    const [savingFactura, setSavingFactura] = useState(false);
    // ─ Próximo service (retención) ─
    const [serviceForm, setServiceForm] = useState('');
    const [savingService, setSavingService] = useState(false);
    const [descargandoOrden, setDescargandoOrden] = useState(false);

    // ─ Create Item form ─
    const [itemForm, setItemForm] = useState<CreateItemDto>({
        casoId: 0, fecha: today(), descripcion: '', monto: 0, proveedorId: undefined, comprobanteUrl: '',
    });

    // ─ Transition state ─
    const [fechaCierre, setFechaCierre] = useState(today());
    const [transicionEstado, setTransicionEstado] = useState<EstadoPostventa | ''>('');

    // El filtro sale del catálogo. Antes se armaba con los tipos que hubiera
    // cargados (`new Set(casos.map(c => c.tipo))`), así que dependía de la página
    // actual y cualquier variante ortográfica aparecía como un tipo más.

    // ─────────────────────────────────────────────────────────────────────────
    // LOAD DATA
    // ─────────────────────────────────────────────────────────────────────────
    const loadCasos = useCallback(async () => {
        setLoading(true);
        try {
            const params: Record<string, unknown> = { page, limit: 20 };
            if (filterEstado) params.estado = filterEstado;
            if (filterSucursal) params.sucursalId = filterSucursal;
            const res = await postventaApi.getCasos(params) as { results?: PostventaCaso[]; totalPages?: number };
            const raw = res?.results ?? [];
            setCasos(Array.isArray(raw) ? raw : []);
            setTotalPages(res?.totalPages ?? 1);
        } catch {
            addToast('Error al cargar casos', 'error');
        } finally {
            setLoading(false);
        }
    }, [page, filterEstado, filterSucursal, addToast]);

    // Export CSV de la cartera de casos con el MISMO filtro actual.
    const handleExportCsv = async () => {
        setExportando(true);
        try {
            const params: Record<string, unknown> = {};
            if (filterEstado) params.estado = filterEstado;
            if (filterSucursal) params.sucursalId = filterSucursal;
            // El filtro de Tipo SÍ va al server (coerceFilter lo convierte por el
            // sufijo Id). `search` queda afuera a propósito: es texto page-local y
            // no es una columna → mandarlo reventaría el where de Prisma.
            if (filterTipo) params.tipoId = filterTipo;
            const res = await postventaApi.exportCasosCsv(params);
            const url = window.URL.createObjectURL(new Blob([res.data], { type: 'text/csv' }));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', 'postventa-casos.csv');
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
            const total = res.headers?.['x-export-truncated'];
            if (total) addToast(`Se exportaron los primeros 5000 de ${total} casos. Filtrá para acotar el CSV.`, 'info');
        } catch {
            addToast('Error al exportar los casos', 'error');
        } finally {
            setExportando(false);
        }
    };

    // Conteos por estado. Se piden con limit=1 y se lee `totalResults`: contar
    // sobre `casos` sólo vería la página actual (el backend pagina de a 20).
    const loadStats = useCallback(async () => {
        const contar = async (estado: EstadoPostventa) => {
            const res = await postventaApi.getCasos({ estado, limit: 1 }) as { totalResults?: number };
            return res?.totalResults ?? 0;
        };
        try {
            const [pendiente, en_curso, resuelto] = await Promise.all([
                contar('pendiente'), contar('en_curso'), contar('resuelto'),
            ]);
            setStats({ pendiente, en_curso, resuelto });
        } catch {
            // Informativos: si fallan, la página sigue andando.
        }
    }, []);

    useEffect(() => {
        loadStats();
    }, [loadStats]);

    // Agenda: casos con turno y SIN resolver, ordenados por fecha de turno.
    // Se filtra `estado` en el SERVER (una llamada por estado abierto) en vez de
    // traer todo y filtrar en el cliente: los casos resueltos conservan su
    // fechaTurno para siempre y, con orden asc, sus turnos viejos coparían el cap
    // dejando fuera los turnos futuros. Excluyéndolos en el server, el cupo queda
    // sólo para casos abiertos (muy por debajo de 200 en una concesionaria). Sin
    // piso de fecha a propósito: un turno abierto vencido debe verse como "Vencido".
    const loadAgenda = useCallback(async () => {
        setLoadingAgenda(true);
        try {
            const [pend, curso] = await Promise.all([
                postventaApi.getCasos({ estado: 'pendiente', limit: 200, sortBy: 'fechaTurno', sortOrder: 'asc' }) as Promise<{ results?: PostventaCaso[] }>,
                postventaApi.getCasos({ estado: 'en_curso', limit: 200, sortBy: 'fechaTurno', sortOrder: 'asc' }) as Promise<{ results?: PostventaCaso[] }>,
            ]);
            const merged = [...(pend?.results ?? []), ...(curso?.results ?? [])]
                .filter(c => c.fechaTurno)
                .sort((a, b) => String(a.fechaTurno).localeCompare(String(b.fechaTurno)));
            setAgenda(merged);
        } catch {
            addToast('Error al cargar la agenda', 'error');
        } finally {
            setLoadingAgenda(false);
        }
    }, [addToast]);

    useEffect(() => { if (tab === 'agenda') loadAgenda(); }, [tab, loadAgenda]);

    // ─────────────────────────────────────────────────────────────────────────
    // TIPOS DE CASO (catálogo)
    // ─────────────────────────────────────────────────────────────────────────
    const loadTipos = useCallback(async () => {
        setLoadingTipos(true);
        try {
            setTipos(getList<TipoPostventa>(await postventaApi.getTipos()));
        } catch {
            addToast('Error al cargar los tipos de caso', 'error');
        } finally {
            setLoadingTipos(false);
        }
    }, [addToast]);

    useEffect(() => {
        loadTipos();
    }, [loadTipos]);

    // Al crear un caso sólo se ofrecen los activos; los archivados se siguen
    // viendo en los casos que ya los usan.
    const tiposActivos = tipos.filter(t => t.activo);

    const openCreateTipo = () => {
        setEditingTipo(null);
        setTipoForm({ nombre: '', activo: true });
        setShowTipoModal(true);
    };

    const openEditTipo = (t: TipoPostventa) => {
        setEditingTipo(t);
        setTipoForm({ nombre: t.nombre, activo: t.activo });
        setShowTipoModal(true);
    };

    const handleSaveTipo = async () => {
        if (!tipoForm.nombre.trim()) { addToast('El nombre es obligatorio', 'error'); return; }
        setSubmitting(true);
        try {
            if (editingTipo) {
                await postventaApi.updateTipo(editingTipo.id, tipoForm);
                addToast('Tipo actualizado', 'success');
            } else {
                await postventaApi.createTipo(tipoForm);
                addToast('Tipo creado', 'success');
            }
            setShowTipoModal(false);
            loadTipos();
            // Renombrar arrastra a los casos: hay que recargarlos para verlo.
            loadCasos();
        } catch (e) {
            addToast(getErrorMessage(e, 'Error al guardar el tipo'), 'error');
        } finally {
            setSubmitting(false);
        }
    };

    const handleDeleteTipo = async () => {
        if (!deletingTipo) return;
        try {
            await postventaApi.deleteTipo(deletingTipo.id);
            addToast('Tipo eliminado', 'success');
            setDeletingTipo(null);
            loadTipos();
        } catch (e) {
            // El backend rechaza borrar un tipo en uso y explica que se archive.
            addToast(getErrorMessage(e, 'Error al eliminar el tipo'), 'error');
        }
    };

    useEffect(() => {
        const loadCatalogs = async () => {
            try {
                const [clRes, vhRes, vtRes, suRes, prRes] = await Promise.all([
                    clientesApi.getAll({}, { limit: 200 }),
                    vehiculosApi.getAll({}, { limit: 200 }),
                    ventasApi.getAll({}, { limit: 200 }),
                    sucursalesApi.getAll({}, { limit: 200 }),
                    proveedoresApi.getAll({ activo: true } as Record<string, unknown>),
                ]);
                const raw = (r: unknown): unknown[] => {
                    const d = r as { results?: unknown[] } | unknown[];
                    if (Array.isArray(d)) return d;
                    return Array.isArray(d?.results) ? d.results : [];
                };
                setClientes(raw(clRes) as { id: number; nombre: string }[]);
                setVehiculos(raw(vhRes) as { id: number; marca: string; modelo: string; dominio?: string }[]);
                setVentas(raw(vtRes) as { id: number; montoTotal?: number; cliente?: { nombre: string }; vehiculo?: { marca: string; modelo: string } }[]);
                setSucursales(raw(suRes) as { id: number; nombre: string }[]);
                setProveedores(raw(prRes) as { id: number; nombre: string }[]);
            } catch {
                // silent
            }
        };
        loadCatalogs();
    }, []);

    useEffect(() => { loadCasos(); }, [loadCasos]);

    // ─────────────────────────────────────────────────────────────────────────
    // CASO CRUD
    // ─────────────────────────────────────────────────────────────────────────
    const handleCreateCaso = async () => {
        if (!casoForm.clienteId || !casoForm.vehiculoId || !casoForm.sucursalId) {
            addToast('Cliente, vehículo y sucursal son obligatorios', 'error'); return;
        }
        // `ventaId` es obligatorio en el schema: un reclamo de postventa siempre
        // es sobre una unidad ya vendida. Sin este chequeo se mandaba 0 y el
        // backend respondía un 500 por violación de FK.
        if (!casoForm.ventaId) {
            addToast('Indicá sobre qué venta es el reclamo', 'error'); return;
        }
        if (!casoForm.descripcion.trim()) {
            addToast('La descripción es obligatoria', 'error'); return;
        }
        setSubmitting(true);
        try {
            const payload: CreateCasoDto = {
                clienteId: casoForm.clienteId,
                vehiculoId: casoForm.vehiculoId,
                sucursalId: casoForm.sucursalId,
                ventaId: casoForm.ventaId,
                fechaReclamo: casoForm.fechaReclamo,
                tipoId: casoForm.tipoId || undefined,
                descripcion: casoForm.descripcion,
                // El turno es opcional al abrir el caso ('' = sin turno todavía).
                fechaTurno: casoForm.fechaTurno || undefined,
                horaTurno: (casoForm.fechaTurno && casoForm.horaTurno) || undefined,
            };
            await postventaApi.createCaso(payload);
            addToast('Caso creado', 'success');
            setShowCreateModal(false);
            setCasoForm({ clienteId: 0, vehiculoId: 0, sucursalId: 0, ventaId: 0, fechaReclamo: today(), tipoId: undefined, descripcion: '', fechaTurno: '', horaTurno: '' });
            setPage(1);
            loadCasos();
            if (tab === 'agenda') loadAgenda();
        } catch {
            addToast('Error al crear caso', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    const handleTransicion = async () => {
        if (!transicionCaso || !transicionEstado) return;
        setSubmitting(true);
        try {
            const data: { estado: EstadoPostventa; fechaCierre?: string } = { estado: transicionEstado };
            if (transicionEstado === 'resuelto') data.fechaCierre = fechaCierre;
            await postventaApi.updateCaso(transicionCaso.id, data);
            addToast('Estado actualizado', 'success');
            setTransicionCaso(null);
            setTransicionEstado('');
            // refresh detail if open
            if (detailCaso?.id === transicionCaso.id) {
                const res = await postventaApi.getCasoById(transicionCaso.id);
                setDetailCaso(res as PostventaCaso);
            }
            loadCasos();
        } catch {
            addToast('Error al actualizar estado', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    const handleDeleteCaso = async () => {
        if (!deletingCaso) return;
        try {
            await postventaApi.deleteCaso(deletingCaso.id);
            addToast('Caso eliminado', 'success');
            setDeletingCaso(null);
            loadCasos();
        } catch {
            addToast('Error al eliminar caso', 'error');
        }
    };

    // ─────────────────────────────────────────────────────────────────────────
    // ITEM CRUD
    // ─────────────────────────────────────────────────────────────────────────
    const handleOpenAddItem = (caso: PostventaCaso) => {
        setItemForm({ casoId: caso.id, fecha: today(), descripcion: '', monto: 0, proveedorId: undefined, comprobanteUrl: '' });
        setShowAddItem(true);
    };

    const handleCreateItem = async () => {
        if (!itemForm.descripcion.trim()) { addToast('La descripción es obligatoria', 'error'); return; }
        if (!itemForm.monto || itemForm.monto <= 0) { addToast('El monto debe ser mayor a 0', 'error'); return; }
        setSubmitting(true);
        try {
            const payload: CreateItemDto = {
                casoId: itemForm.casoId,
                fecha: itemForm.fecha,
                descripcion: itemForm.descripcion,
                monto: itemForm.monto,
                proveedorId: itemForm.proveedorId || undefined,
                comprobanteUrl: itemForm.comprobanteUrl || undefined,
            };
            await postventaApi.createItem(payload);
            addToast('Ítem registrado', 'success');
            setShowAddItem(false);
            // Refresh detail
            if (detailCaso) {
                const res = await postventaApi.getCasoById(detailCaso.id);
                setDetailCaso(res as PostventaCaso);
            }
        } catch {
            addToast('Error al registrar ítem', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    const handleDeleteItem = async () => {
        if (!deletingItem) return;
        try {
            await postventaApi.deleteItem(deletingItem.id);
            addToast('Ítem eliminado', 'success');
            setDeletingItem(null);
            if (detailCaso) {
                const res = await postventaApi.getCasoById(detailCaso.id);
                setDetailCaso(res as PostventaCaso);
            }
        } catch {
            addToast('Error al eliminar ítem', 'error');
        }
    };

    // ─────────────────────────────────────────────────────────────────────────
    // VIEW DETAIL
    // ─────────────────────────────────────────────────────────────────────────
    const handleViewDetail = async (caso: PostventaCaso) => {
        try {
            const res = await postventaApi.getCasoById(caso.id);
            setDetailCaso(res as PostventaCaso);
            syncTurnoForm(res as PostventaCaso);
            syncFacturaForm(res as PostventaCaso);
            syncServiceForm(res as PostventaCaso);
        } catch {
            setDetailCaso(caso);
            syncTurnoForm(caso);
            syncFacturaForm(caso);
            syncServiceForm(caso);
        }
    };

    // Descarga la orden de servicio del caso en PDF (mismo patrón de blob que los
    // otros comprobantes: la respuesta ya viene desenvuelta por el interceptor).
    const handleOrden = async (caso: PostventaCaso) => {
        setDescargandoOrden(true);
        try {
            const blob = await postventaApi.ordenPdf(caso.id) as unknown as Blob;
            const url = window.URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `orden-servicio-${caso.id}.pdf`);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
        } catch {
            addToast('Error al generar la orden de servicio', 'error');
        } finally {
            setDescargandoOrden(false);
        }
    };

    // Precarga el editor de turno del detalle con lo agendado (o vacío). Sólo toca
    // turnoForm: re-sincronizar acá el form de facturación pisaría lo que el usuario
    // esté tipeando en el OTRO control (ambos conviven en el modal de detalle).
    const syncTurnoForm = (c: PostventaCaso) => {
        setTurnoForm({
            fechaTurno: c.fechaTurno ? String(c.fechaTurno).slice(0, 10) : '',
            horaTurno: c.horaTurno ?? '',
        });
    };

    // Precarga el editor de facturación del detalle (sólo facturaForm, ver arriba).
    const syncFacturaForm = (c: PostventaCaso) => {
        setFacturaForm(c.montoFacturado != null ? String(c.montoFacturado) : '');
    };

    // Precarga el editor de "próximo service" del detalle.
    const syncServiceForm = (c: PostventaCaso) => {
        setServiceForm(c.proximoServiceFecha ? String(c.proximoServiceFecha).slice(0, 10) : '');
    };

    // Agenda / quita el recordatorio de próximo service ('' ⇒ null).
    const handleGuardarService = async () => {
        if (!detailCaso) return;
        setSavingService(true);
        try {
            await postventaApi.updateCaso(detailCaso.id, { proximoServiceFecha: serviceForm || null });
            addToast(serviceForm ? 'Próximo service agendado' : 'Recordatorio quitado', 'success');
            const res = await postventaApi.getCasoById(detailCaso.id);
            setDetailCaso(res as PostventaCaso);
            syncServiceForm(res as PostventaCaso);
            loadCasos();
        } catch (e) {
            addToast(getErrorMessage(e, 'Error al guardar el próximo service'), 'error');
        } finally {
            setSavingService(false);
        }
    };

    // Borrador de recordatorio de próximo service por WhatsApp (el usuario revisa y manda).
    const serviceWaHref = (c: PostventaCaso) => {
        const veh = c.vehiculo ? `${c.vehiculo.marca} ${c.vehiculo.modelo}` : 'tu vehículo';
        const msg = `Hola ${c.cliente?.nombre ?? ''}, te recordamos que ${veh} tiene su próximo service el ${fmtDate(c.proximoServiceFecha)}. Coordinemos un turno para hacerlo. ¡Gracias!`;
        return waLink(c.cliente?.telefono, msg);
    };

    // Guarda el monto facturado al cliente ('' ⇒ null: sin facturar).
    const handleGuardarFacturacion = async () => {
        if (!detailCaso) return;
        const raw = facturaForm.trim();
        const monto = raw === '' ? null : Number(raw);
        if (monto !== null && (!Number.isFinite(monto) || monto < 0)) {
            addToast('El monto facturado debe ser un número mayor o igual a 0', 'error');
            return;
        }
        setSavingFactura(true);
        try {
            await postventaApi.updateCaso(detailCaso.id, { montoFacturado: monto });
            addToast('Facturación guardada', 'success');
            const res = await postventaApi.getCasoById(detailCaso.id);
            setDetailCaso(res as PostventaCaso);
            syncFacturaForm(res as PostventaCaso);
            loadCasos();
        } catch (e) {
            addToast(getErrorMessage(e, 'Error al guardar la facturación'), 'error');
        } finally {
            setSavingFactura(false);
        }
    };

    // Agenda / reprograma / desagenda el turno del caso en detalle.
    const handleGuardarTurno = async () => {
        if (!detailCaso) return;
        setSubmitting(true);
        try {
            await postventaApi.updateCaso(detailCaso.id, {
                // '' => null: desagendar (el backend persiste null y limpia ambos).
                fechaTurno: turnoForm.fechaTurno || null,
                horaTurno: (turnoForm.fechaTurno && turnoForm.horaTurno) || null,
            });
            addToast(turnoForm.fechaTurno ? 'Turno agendado' : 'Turno desagendado', 'success');
            const res = await postventaApi.getCasoById(detailCaso.id);
            setDetailCaso(res as PostventaCaso);
            syncTurnoForm(res as PostventaCaso);
            loadCasos();
            if (tab === 'agenda') loadAgenda();
        } catch (e) {
            addToast(getErrorMessage(e, 'Error al guardar el turno'), 'error');
        } finally {
            setSubmitting(false);
        }
    };

    // Badge relativo del turno para la agenda (Vencido / Hoy / Mañana / fecha).
    const turnoBadge = (fechaISO: string) => {
        const hoy = localISO(new Date());
        const man = new Date(); man.setDate(man.getDate() + 1);
        const f = String(fechaISO).slice(0, 10);
        if (f < hoy) return { label: 'Vencido', color: '#ef4444' };
        if (f === hoy) return { label: 'Hoy', color: '#f59e0b' };
        if (f === localISO(man)) return { label: 'Mañana', color: '#60a5fa' };
        return { label: fmtDate(f), color: '#22c55e' };
    };

    // Borrador de recordatorio de turno por WhatsApp (el usuario revisa y manda).
    const turnoWaHref = (c: PostventaCaso) => {
        const veh = c.vehiculo ? `${c.vehiculo.marca} ${c.vehiculo.modelo}` : 'tu vehículo';
        const msg = `Hola ${c.cliente?.nombre ?? ''}, te recordamos el turno de taller de ${veh} el ${fmtDate(c.fechaTurno)}${c.horaTurno ? ` a las ${c.horaTurno} hs` : ''}. ¡Te esperamos!`;
        return waLink(c.cliente?.telefono, msg);
    };

    // ─────────────────────────────────────────────────────────────────────────
    // FILTERED
    // ─────────────────────────────────────────────────────────────────────────
    const filteredCasos = casos.filter(c => {
        if (filterTipo && String(c.tipoId ?? '') !== filterTipo) return false;
        if (!search) return true;
        const q = search.toLowerCase();
        return (
            c.cliente?.nombre?.toLowerCase().includes(q) ||
            c.vehiculo?.marca?.toLowerCase().includes(q) ||
            c.vehiculo?.modelo?.toLowerCase().includes(q) ||
            c.vehiculo?.dominio?.toLowerCase().includes(q) ||
            c.descripcion?.toLowerCase().includes(q) ||
            String(c.id).includes(q)
        );
    });

    // Total items del caso en detalle
    const totalItems = (detailCaso?.items ?? [])
        .reduce((acc, it) => acc + Number(it.monto ?? 0), 0);

    // ─────────────────────────────────────────────────────────────────────────
    // RENDER
    // ─────────────────────────────────────────────────────────────────────────
    return (
        <div className="page-container animate-fade-in">
            {/* Header */}
            <header className="page-header">
                <div className="header-title">
                    <div className="flex items-center gap-3 mb-1">
                        <div className="icon-badge primary shadow-glow">
                            <Wrench size={20} />
                        </div>
                        <h1>Postventa</h1>
                    </div>
                    <p>Reclamos y garantías sobre unidades ya entregadas, y el costo de resolverlos.</p>
                </div>
                <div className="flex gap-3">
                    <Button variant="secondary" onClick={() => tab === 'casos' ? loadCasos() : tab === 'agenda' ? loadAgenda() : loadTipos()}>
                        <RefreshCw size={18} className={(tab === 'casos' ? loading : tab === 'agenda' ? loadingAgenda : loadingTipos) ? 'animate-spin' : ''} />
                    </Button>
                    {tab === 'casos' && puedeExportar && (
                        <Button variant="secondary" onClick={handleExportCsv} loading={exportando} title="Exportar la cartera de casos filtrada a CSV (Excel)">
                            <FileDown size={18} /> CSV
                        </Button>
                    )}
                    <Button data-tour="pv-nuevo" variant="primary" onClick={tab === 'tipos' ? openCreateTipo : () => setShowCreateModal(true)}>
                        <Plus size={18} /> {tab === 'tipos' ? 'Nuevo Tipo' : 'Nuevo Caso'}
                    </Button>
                </div>
            </header>

            {/* Stats */}
            <div className="stats-grid mb-6" data-tour="pv-stats">
                <div className="card glass stat-tile">
                    <span className="stat-tile-label" style={{ color: '#f59e0b' }}>Pendientes</span>
                    <div className="flex items-baseline gap-2">
                        <span className="text-3xl font-black">{stats.pendiente}</span>
                        <span className="text-xs text-muted font-bold">CASOS</span>
                    </div>
                    <Clock size={60} className="stat-tile-bg" />
                </div>
                <div className="card glass stat-tile">
                    <span className="stat-tile-label" style={{ color: 'var(--info)' }}>En curso</span>
                    <div className="flex items-baseline gap-2">
                        <span className="text-3xl font-black">{stats.en_curso}</span>
                        <span className="text-xs text-muted font-bold">CASOS</span>
                    </div>
                    <Wrench size={60} className="stat-tile-bg" />
                </div>
                <div className="card glass stat-tile">
                    <span className="stat-tile-label" style={{ color: 'var(--success)' }}>Resueltos</span>
                    <div className="flex items-baseline gap-2">
                        <span className="text-3xl font-black">{stats.resuelto}</span>
                        <span className="text-xs text-muted font-bold">CASOS</span>
                    </div>
                    <CheckCircle size={60} className="stat-tile-bg" />
                </div>
            </div>

            {/* Tabs */}
            <div className="card glass mb-6">
                <div className="segmented" role="tablist" data-tour="pv-tabs">
                    <button
                        role="tab"
                        aria-selected={tab === 'casos'}
                        onClick={() => setTab('casos')}
                        className={`segmented-btn ${tab === 'casos' ? 'is-active' : ''}`}
                    >
                        <Wrench size={14} /> Casos
                    </button>
                    <button
                        role="tab"
                        aria-selected={tab === 'agenda'}
                        onClick={() => setTab('agenda')}
                        className={`segmented-btn ${tab === 'agenda' ? 'is-active' : ''}`}
                    >
                        <Calendar size={14} /> Agenda de Taller
                    </button>
                    <button
                        role="tab"
                        aria-selected={tab === 'tipos'}
                        onClick={() => setTab('tipos')}
                        className={`segmented-btn ${tab === 'tipos' ? 'is-active' : ''}`}
                    >
                        <Tags size={14} /> Tipos de Caso
                    </button>
                </div>
            </div>

            {tab === 'tipos' ? (
                <TiposPanel
                    tipos={tipos}
                    loading={loadingTipos}
                    onEdit={openEditTipo}
                    onDelete={setDeletingTipo}
                />
            ) : tab === 'agenda' ? (
                /* ─── Agenda de taller: casos con turno, sin resolver ─── */
                <div className="glass" style={{ borderRadius: '0.75rem', overflow: 'hidden' }}>
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                                    {['Turno', 'Hora', 'Cliente', 'Vehículo', 'Tipo', 'Estado', 'Acciones'].map(h => (
                                        <th key={h} style={{ padding: '0.75rem 1rem', textAlign: 'left', fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {loadingAgenda ? (
                                    <tr><td colSpan={7} style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>Cargando...</td></tr>
                                ) : agenda.length === 0 ? (
                                    <tr><td colSpan={7} style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                                        No hay turnos agendados. Agendá uno desde el detalle de un caso (o al crearlo).
                                    </td></tr>
                                ) : agenda.map(caso => {
                                    const badge = turnoBadge(caso.fechaTurno!);
                                    const wa = turnoWaHref(caso);
                                    return (
                                        <tr key={caso.id} style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.15s' }}
                                            onMouseEnter={e => (e.currentTarget.style.background = 'color-mix(in srgb, var(--text-primary) 5%, transparent)')}
                                            onMouseLeave={e => (e.currentTarget.style.background = '')}
                                        >
                                            <td style={{ padding: '0.75rem 1rem', whiteSpace: 'nowrap' }}>
                                                <span style={{
                                                    padding: '0.2rem 0.65rem', borderRadius: '9999px', fontSize: '0.78rem', fontWeight: 700,
                                                    background: `${badge.color}22`, color: badge.color,
                                                }}>
                                                    {badge.label}
                                                </span>
                                                {(badge.label === 'Hoy' || badge.label === 'Mañana' || badge.label === 'Vencido') && (
                                                    <span style={{ marginLeft: '0.5rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{fmtDate(caso.fechaTurno)}</span>
                                                )}
                                            </td>
                                            <td style={{ padding: '0.75rem 1rem', fontFamily: 'monospace', fontSize: '0.85rem' }}>{caso.horaTurno ? `${caso.horaTurno} hs` : '—'}</td>
                                            <td style={{ padding: '0.75rem 1rem', fontWeight: 500 }}>{caso.cliente?.nombre ?? '-'}</td>
                                            <td style={{ padding: '0.75rem 1rem', fontSize: '0.875rem' }}>
                                                {caso.vehiculo ? `${caso.vehiculo.marca} ${caso.vehiculo.modelo}${caso.vehiculo.dominio ? ` (${caso.vehiculo.dominio})` : ''}` : '-'}
                                            </td>
                                            <td style={{ padding: '0.75rem 1rem', fontSize: '0.85rem' }}>{caso.tipo || '-'}</td>
                                            <td style={{ padding: '0.75rem 1rem' }}>
                                                <span style={{
                                                    padding: '0.2rem 0.65rem', borderRadius: '9999px', fontSize: '0.75rem', fontWeight: 600,
                                                    background: `${ESTADO_COLORS[caso.estado]}22`, color: ESTADO_COLORS[caso.estado],
                                                }}>
                                                    {ESTADO_LABELS[caso.estado]}
                                                </span>
                                            </td>
                                            <td style={{ padding: '0.75rem 1rem' }}>
                                                <div style={{ display: 'flex', gap: '0.35rem' }}>
                                                    {wa ? (
                                                        <a href={wa} target="_blank" rel="noreferrer" className="icon-btn" title="Recordar turno por WhatsApp (revisá antes de enviar)">
                                                            <MessageCircle size={15} />
                                                        </a>
                                                    ) : (
                                                        <span className="icon-btn" title="El cliente no tiene teléfono válido" style={{ opacity: 0.35, cursor: 'default' }}>
                                                            <MessageCircle size={15} />
                                                        </span>
                                                    )}
                                                    <button className="icon-btn" title="Ver detalle" onClick={() => handleViewDetail(caso)}>
                                                        <Eye size={15} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            ) : (
            <>
            {/* Filters */}
            <div className="card glass filters-bar mb-6" data-tour="pv-filtros">
                <div className="search-box">
                    <Search size={18} className="text-muted" />
                    <input
                        type="text"
                        placeholder="Buscar cliente, vehículo, descripción..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="w-full text-sm font-medium"
                    />
                </div>
                <select value={filterEstado} onChange={e => { setFilterEstado(e.target.value); setPage(1); }}>
                    <option value="">Todos los estados</option>
                    <option value="pendiente">Pendiente</option>
                    <option value="en_curso">En Curso</option>
                    <option value="resuelto">Resuelto</option>
                </select>
                <select value={filterSucursal} onChange={e => { setFilterSucursal(e.target.value); setPage(1); }}>
                    <option value="">Todas las sucursales</option>
                    {sucursales.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                </select>
                <select value={filterTipo} onChange={e => setFilterTipo(e.target.value)}>
                    <option value="">Todos los tipos</option>
                    {tipos.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
                </select>
                {(filterEstado || filterSucursal || filterTipo || search) && (
                    <Button variant="secondary" onClick={() => { setFilterEstado(''); setFilterSucursal(''); setFilterTipo(''); setSearch(''); setPage(1); }}>
                        <X size={14} /> Limpiar
                    </Button>
                )}
            </div>

            {/* Table */}
            <div className="glass" data-tour="pv-tabla" style={{ borderRadius: '0.75rem', overflow: 'hidden' }}>
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid var(--border)' }}>
                                {['#', 'Cliente', 'Vehículo', 'Tipo', 'Descripción', 'Estado', 'Reclamo', 'Cierre', 'Acciones'].map(h => (
                                    <th key={h} style={{ padding: '0.75rem 1rem', textAlign: 'left', fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan={9} style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>Cargando...</td></tr>
                            ) : filteredCasos.length === 0 ? (
                                <tr><td colSpan={9} style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>No hay casos de postventa</td></tr>
                            ) : filteredCasos.map(caso => (
                                <tr key={caso.id} style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.15s' }}
                                    onMouseEnter={e => (e.currentTarget.style.background = 'color-mix(in srgb, var(--text-primary) 5%, transparent)')}
                                    onMouseLeave={e => (e.currentTarget.style.background = '')}
                                >
                                    <td style={{ padding: '0.75rem 1rem', fontFamily: 'monospace', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>#{caso.id}</td>
                                    <td style={{ padding: '0.75rem 1rem', fontWeight: 500 }}>{caso.cliente?.nombre ?? '-'}</td>
                                    <td style={{ padding: '0.75rem 1rem', fontSize: '0.875rem' }}>
                                        {caso.vehiculo ? `${caso.vehiculo.marca} ${caso.vehiculo.modelo}${caso.vehiculo.dominio ? ` (${caso.vehiculo.dominio})` : ''}` : '-'}
                                    </td>
                                    <td style={{ padding: '0.75rem 1rem', fontSize: '0.85rem' }}>{caso.tipo || '-'}</td>
                                    <td style={{ padding: '0.75rem 1rem', fontSize: '0.85rem', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={caso.descripcion}>
                                        {caso.descripcion}
                                    </td>
                                    <td style={{ padding: '0.75rem 1rem' }}>
                                        <span style={{
                                            padding: '0.2rem 0.65rem', borderRadius: '9999px', fontSize: '0.75rem', fontWeight: 600,
                                            background: `${ESTADO_COLORS[caso.estado]}22`,
                                            color: ESTADO_COLORS[caso.estado],
                                        }}>
                                            {ESTADO_LABELS[caso.estado]}
                                        </span>
                                    </td>
                                    <td style={{ padding: '0.75rem 1rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{fmtDate(caso.fechaReclamo)}</td>
                                    <td style={{ padding: '0.75rem 1rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{fmtDate(caso.fechaCierre)}</td>
                                    <td style={{ padding: '0.75rem 1rem' }}>
                                        <div style={{ display: 'flex', gap: '0.35rem' }}>
                                            <button className="icon-btn" title="Ver detalle" onClick={() => handleViewDetail(caso)}>
                                                <Eye size={15} />
                                            </button>
                                            {ESTADO_TRANSITIONS[caso.estado].length > 0 && (
                                                <button className="icon-btn" title="Avanzar estado" onClick={() => { setTransicionCaso(caso); setTransicionEstado(ESTADO_TRANSITIONS[caso.estado][0]); setFechaCierre(today()); }}>
                                                    <ArrowRight size={15} />
                                                </button>
                                            )}
                                            <button className="icon-btn danger" title="Eliminar" onClick={() => setDeletingCaso(caso)}>
                                                <Trash2 size={15} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem', borderTop: '1px solid var(--border)', justifyContent: 'center' }}>
                        <Button variant="secondary" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>
                            <ChevronLeft size={14} /> Anterior
                        </Button>
                        <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Página {page} de {totalPages}</span>
                        <Button variant="secondary" size="sm" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>
                            Siguiente <ChevronRight size={14} />
                        </Button>
                    </div>
                )}
            </div>
            </>
            )}

            {/* ═══════════════════════════════════════════════════════════════
                MODALS
            ════════════════════════════════════════════════════════════════ */}

            {/* ─── Modal: Crear Caso ─── */}
            {showCreateModal && (
                <ModalOverlay onClose={() => setShowCreateModal(false)} wide>
                    <h2 style={{ margin: '0 0 1.5rem', fontSize: '1.25rem', fontWeight: 700 }}>Nuevo Caso de Postventa</h2>
                    <div style={{ display: 'grid', gap: '1rem' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                            <Select dense label="Cliente *" value={casoForm.clienteId} onChange={e => setCasoForm(p => ({ ...p, clienteId: Number(e.target.value) }))}>
                                <option value={0}>Seleccionar cliente...</option>
                                {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                            </Select>
                            <Select dense label="Vehículo *" value={casoForm.vehiculoId} onChange={e => setCasoForm(p => ({ ...p, vehiculoId: Number(e.target.value) }))}>
                                <option value={0}>Seleccionar vehículo...</option>
                                {vehiculos.map(v => <option key={v.id} value={v.id}>{v.marca} {v.modelo}{v.dominio ? ` (${v.dominio})` : ''}</option>)}
                            </Select>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                            <Select dense label="Sucursal *" value={casoForm.sucursalId} onChange={e => setCasoForm(p => ({ ...p, sucursalId: Number(e.target.value) }))}>
                                <option value={0}>Seleccionar sucursal...</option>
                                {sucursales.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                            </Select>
                            <Select dense label="Venta vinculada *" value={casoForm.ventaId} onChange={e => setCasoForm(p => ({ ...p, ventaId: Number(e.target.value) }))}>
                                <option value={0}>Seleccionar venta...</option>
                                {ventas.map(v => <option key={v.id} value={v.id}>Venta #{v.id} — {v.cliente?.nombre ?? ''} {v.vehiculo ? `${v.vehiculo.marca} ${v.vehiculo.modelo}` : ''}</option>)}
                            </Select>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                            <Input dense label="Fecha de Reclamo *" type="date" value={casoForm.fechaReclamo} onChange={e => setCasoForm(p => ({ ...p, fechaReclamo: e.target.value }))} />
                            <Select
                                dense
                                label="Tipo"
                                value={casoForm.tipoId ?? 0}
                                onChange={e => setCasoForm(p => ({ ...p, tipoId: Number(e.target.value) || undefined }))}
                            >
                                <option value={0}>Sin definir</option>
                                {tiposActivos.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
                            </Select>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                            <Input dense label="Turno de taller (opcional)" type="date" value={casoForm.fechaTurno ?? ''} onChange={e => setCasoForm(p => ({ ...p, fechaTurno: e.target.value, horaTurno: e.target.value ? p.horaTurno : '' }))} />
                            <Input dense label="Hora del turno" type="time" value={casoForm.horaTurno ?? ''} onChange={e => setCasoForm(p => ({ ...p, horaTurno: e.target.value }))} disabled={!casoForm.fechaTurno} />
                        </div>
                        <Textarea dense label="Descripción *" rows={3} placeholder="Describa el problema o reclamo..." value={casoForm.descripcion} onChange={e => setCasoForm(p => ({ ...p, descripcion: e.target.value }))} style={{ resize: 'vertical' }} />
                    </div>
                    <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
                        <Button variant="secondary" onClick={() => setShowCreateModal(false)}>Cancelar</Button>
                        <Button variant="primary" onClick={handleCreateCaso} disabled={submitting} loading={submitting}>
                            {submitting ? 'Creando...' : 'Crear Caso'}
                        </Button>
                    </div>
                </ModalOverlay>
            )}

            {/* ─── Modal: Detalle Caso ─── */}
            {detailCaso && !showAddItem && !deletingItem && (
                <ModalOverlay onClose={() => setDetailCaso(null)} wide>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
                        <div>
                            <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 700 }}>
                                Caso #{detailCaso.id}
                            </h2>
                            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.4rem' }}>
                                <span style={{
                                    padding: '0.2rem 0.65rem', borderRadius: '9999px', fontSize: '0.8rem', fontWeight: 600,
                                    background: `${ESTADO_COLORS[detailCaso.estado]}22`,
                                    color: ESTADO_COLORS[detailCaso.estado],
                                }}>
                                    {ESTADO_LABELS[detailCaso.estado]}
                                </span>
                                {detailCaso.tipo && (
                                    <span style={{ padding: '0.2rem 0.65rem', borderRadius: '9999px', fontSize: '0.8rem', background: 'color-mix(in srgb, var(--text-primary) 8%, transparent)', color: 'var(--text-secondary)' }}>
                                        {detailCaso.tipo}
                                    </span>
                                )}
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                            <Button variant="secondary" size="sm" onClick={() => handleOrden(detailCaso)} loading={descargandoOrden}>
                                <FileText size={14} /> Orden PDF
                            </Button>
                            <button onClick={() => setDetailCaso(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}><X size={20} /></button>
                        </div>
                    </div>

                    {/* Info grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
                        <InfoBlock title="Partes">
                            <InfoRow label="Cliente" value={detailCaso.cliente?.nombre ?? '-'} />
                            <InfoRow label="Vehículo" value={detailCaso.vehiculo ? `${detailCaso.vehiculo.marca} ${detailCaso.vehiculo.modelo}` : '-'} />
                            <InfoRow label="Dominio" value={detailCaso.vehiculo?.dominio ?? '-'} />
                            <InfoRow label="Sucursal" value={detailCaso.sucursal?.nombre ?? '-'} />
                        </InfoBlock>
                        <InfoBlock title="Fechas">
                            <InfoRow label="Reclamo" value={fmtDate(detailCaso.fechaReclamo)} />
                            <InfoRow label="Turno" value={detailCaso.fechaTurno ? `${fmtDate(detailCaso.fechaTurno)}${detailCaso.horaTurno ? ` · ${detailCaso.horaTurno} hs` : ''}` : 'Sin turno'} />
                            <InfoRow label="Cierre" value={fmtDate(detailCaso.fechaCierre)} />
                            <InfoRow label="Creado" value={fmtDate(detailCaso.createdAt)} />
                        </InfoBlock>
                    </div>

                    {/* Turno de taller: agendar / reprogramar / desagendar (no aplica a resueltos) */}
                    {detailCaso.estado !== 'resuelto' && (
                        <div style={{ marginBottom: '1.5rem', padding: '0.75rem', background: 'color-mix(in srgb, var(--text-primary) 5%, transparent)', borderRadius: '0.5rem' }}>
                            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.6rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                <Calendar size={13} /> Turno de taller
                            </div>
                            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                                <div style={{ flex: '1 1 160px' }}>
                                    {/* Al vaciar la fecha se limpia la hora: si no, quedaba una hora
                                        colgada en un input deshabilitado y no se podía desagendar. */}
                                    <input className="form-input" type="date" value={turnoForm.fechaTurno} onChange={e => setTurnoForm(p => ({ ...p, fechaTurno: e.target.value, horaTurno: e.target.value ? p.horaTurno : '' }))} />
                                </div>
                                <div style={{ flex: '0 1 120px' }}>
                                    <input className="form-input" type="time" value={turnoForm.horaTurno} onChange={e => setTurnoForm(p => ({ ...p, horaTurno: e.target.value }))} disabled={!turnoForm.fechaTurno} />
                                </div>
                                <Button variant="secondary" size="sm" onClick={handleGuardarTurno} disabled={submitting} loading={submitting}>
                                    {detailCaso.fechaTurno ? (turnoForm.fechaTurno ? 'Reprogramar' : 'Desagendar') : 'Agendar'}
                                </Button>
                                {detailCaso.fechaTurno && turnoWaHref(detailCaso) && (
                                    <a href={turnoWaHref(detailCaso)!} target="_blank" rel="noreferrer" className="icon-btn" title="Recordar turno por WhatsApp (revisá antes de enviar)">
                                        <MessageCircle size={16} />
                                    </a>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Descripción */}
                    <div style={{ marginBottom: '1.5rem', padding: '0.75rem', background: 'color-mix(in srgb, var(--text-primary) 5%, transparent)', borderRadius: '0.5rem', fontSize: '0.9rem' }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>Descripción</div>
                        {detailCaso.descripcion}
                    </div>

                    {/* Items section */}
                    <div style={{ marginBottom: '1rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                            <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <Package size={16} /> Ítems de Trabajo ({(detailCaso.items ?? []).length})
                            </div>
                            <Button variant="primary" size="sm" onClick={() => handleOpenAddItem(detailCaso)}>
                                <Plus size={14} /> Agregar Ítem
                            </Button>
                        </div>

                        {(detailCaso.items ?? []).length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)', fontSize: '0.9rem', background: 'color-mix(in srgb, var(--text-primary) 4%, transparent)', borderRadius: '0.5rem' }}>
                                Sin ítems registrados
                            </div>
                        ) : (
                            <div style={{ border: '1px solid var(--border)', borderRadius: '0.5rem', overflow: 'hidden' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                    <thead>
                                        <tr style={{ borderBottom: '1px solid var(--border)', background: 'color-mix(in srgb, var(--text-primary) 5%, transparent)' }}>
                                            {['Fecha', 'Descripción', 'Proveedor', 'Monto', ''].map(h => (
                                                <th key={h} style={{ padding: '0.5rem 0.75rem', textAlign: 'left', fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 600 }}>{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(detailCaso.items ?? []).map(item => (
                                            <tr key={item.id} style={{ borderBottom: '1px solid var(--border)' }}>
                                                <td style={{ padding: '0.5rem 0.75rem', fontSize: '0.85rem', whiteSpace: 'nowrap' }}>{fmtDate(item.fecha)}</td>
                                                <td style={{ padding: '0.5rem 0.75rem', fontSize: '0.85rem' }}>
                                                    {item.descripcion}
                                                    {item.comprobanteUrl && (
                                                        <a href={item.comprobanteUrl} target="_blank" rel="noreferrer" style={{ marginLeft: '0.5rem', fontSize: '0.75rem', color: '#818cf8' }}>
                                                            Ver comprobante
                                                        </a>
                                                    )}
                                                </td>
                                                <td style={{ padding: '0.5rem 0.75rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{item.proveedor?.nombre ?? '-'}</td>
                                                <td style={{ padding: '0.5rem 0.75rem', fontSize: '0.875rem', fontWeight: 600, textAlign: 'right', whiteSpace: 'nowrap' }}>${fmt(item.monto)}</td>
                                                <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right' }}>
                                                    <button className="icon-btn danger" title="Eliminar ítem" onClick={() => setDeletingItem(item)}>
                                                        <Trash2 size={13} />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {/* Total */}
                        {(detailCaso.items ?? []).length > 0 && (
                            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.75rem' }}>
                                <div style={{ background: 'rgba(129,140,248,0.12)', padding: '0.5rem 1rem', borderRadius: '0.5rem', display: 'flex', gap: '1rem', alignItems: 'center' }}>
                                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Total costos:</span>
                                    <span style={{ fontWeight: 700, fontSize: '1.1rem', color: '#818cf8' }}>${fmt(totalItems)}</span>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Facturación al cliente + margen (facturado − costo de los items) */}
                    <div style={{ marginBottom: '1.5rem', padding: '0.75rem', background: 'color-mix(in srgb, var(--text-primary) 5%, transparent)', borderRadius: '0.5rem' }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.6rem' }}>
                            Facturación al cliente
                        </div>
                        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                            <div style={{ flex: '1 1 160px' }}>
                                <input className="form-input" type="number" step="0.01" min="0" placeholder="Monto facturado" value={facturaForm} onChange={e => setFacturaForm(e.target.value)} />
                            </div>
                            <Button variant="secondary" size="sm" onClick={handleGuardarFacturacion} disabled={savingFactura} loading={savingFactura}>Guardar</Button>
                        </div>
                        {detailCaso.montoFacturado != null && (
                            <div style={{ display: 'flex', gap: '1.25rem', marginTop: '0.75rem', flexWrap: 'wrap', fontSize: '0.9rem' }}>
                                <span style={{ color: 'var(--text-secondary)' }}>Facturado: <strong style={{ color: 'var(--text-primary)' }}>${fmt(detailCaso.montoFacturado)}</strong></span>
                                <span style={{ color: 'var(--text-secondary)' }}>Costo: <strong style={{ color: 'var(--text-primary)' }}>${fmt(totalItems)}</strong></span>
                                <span style={{ color: 'var(--text-secondary)' }}>Margen: <strong style={{ color: (Number(detailCaso.montoFacturado) - totalItems) < 0 ? '#ef4444' : '#22c55e' }}>${fmt(Number(detailCaso.montoFacturado) - totalItems)}</strong></span>
                            </div>
                        )}
                    </div>

                    {/* Próximo service (retención): recordatorio para que el cliente vuelva */}
                    <div style={{ marginBottom: '1.5rem', padding: '0.75rem', background: 'color-mix(in srgb, var(--text-primary) 5%, transparent)', borderRadius: '0.5rem' }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.6rem' }}>
                            Próximo service
                        </div>
                        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                            <div style={{ flex: '1 1 160px' }}>
                                <input className="form-input" type="date" value={serviceForm} onChange={e => setServiceForm(e.target.value)} />
                            </div>
                            <Button variant="secondary" size="sm" onClick={handleGuardarService} disabled={savingService} loading={savingService}>Guardar</Button>
                            {detailCaso.proximoServiceFecha && serviceWaHref(detailCaso) && (
                                <a href={serviceWaHref(detailCaso)!} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
                                    <Button variant="secondary" size="sm"><MessageCircle size={14} /> Recordar</Button>
                                </a>
                            )}
                        </div>
                    </div>

                    {/* Actions */}
                    {ESTADO_TRANSITIONS[detailCaso.estado].length > 0 && (
                        <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1rem', display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                            {ESTADO_TRANSITIONS[detailCaso.estado].map(nextEstado => (
                                <Button key={nextEstado} variant="primary" onClick={() => {
                                    setTransicionCaso(detailCaso);
                                    setTransicionEstado(nextEstado);
                                    setFechaCierre(today());
                                    setDetailCaso(null);
                                }}>
                                    {nextEstado === 'resuelto' ? <CheckCircle size={15} /> : <ArrowRight size={15} />}
                                    {nextEstado === 'en_curso' ? 'Iniciar Trabajo' : 'Marcar como Resuelto'}
                                </Button>
                            ))}
                        </div>
                    )}
                </ModalOverlay>
            )}

            {/* ─── Sub-Modal: Agregar Ítem ─── */}
            {showAddItem && detailCaso && (
                <ModalOverlay onClose={() => setShowAddItem(false)}>
                    <h2 style={{ margin: '0 0 1.5rem', fontSize: '1.2rem', fontWeight: 700 }}>Agregar Ítem — Caso #{detailCaso.id}</h2>
                    <div style={{ display: 'grid', gap: '1rem' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                            <Input dense label="Fecha *" type="date" value={itemForm.fecha} onChange={e => setItemForm(p => ({ ...p, fecha: e.target.value }))} />
                            <Input dense label="Monto *" type="number" min="0" step="0.01" placeholder="0.00" value={itemForm.monto || ''} onChange={e => setItemForm(p => ({ ...p, monto: Number(e.target.value) }))} />
                        </div>
                        <Input dense label="Descripción *" placeholder="Descripción del trabajo o gasto..." value={itemForm.descripcion} onChange={e => setItemForm(p => ({ ...p, descripcion: e.target.value }))} />
                        <Select
                            dense
                            label="Proveedor"
                            placeholder="Sin proveedor..."
                            options={proveedores.map(p => ({ value: p.id, label: p.nombre }))}
                            value={itemForm.proveedorId ?? ''}
                            onChange={e => setItemForm(p => ({ ...p, proveedorId: e.target.value ? Number(e.target.value) : undefined }))}
                        />
                        <Input dense label="URL Comprobante" placeholder="https://..." value={itemForm.comprobanteUrl} onChange={e => setItemForm(p => ({ ...p, comprobanteUrl: e.target.value }))} />
                    </div>
                    <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
                        <Button variant="secondary" onClick={() => setShowAddItem(false)}>Cancelar</Button>
                        <Button variant="primary" onClick={handleCreateItem} disabled={submitting} loading={submitting}>
                            {submitting ? 'Guardando...' : 'Agregar Ítem'}
                        </Button>
                    </div>
                </ModalOverlay>
            )}

            {/* ─── Modal: Transición Estado ─── */}
            {transicionCaso && (
                <ModalOverlay onClose={() => setTransicionCaso(null)}>
                    <h2 style={{ margin: '0 0 1.5rem', fontSize: '1.2rem', fontWeight: 700 }}>
                        {transicionEstado === 'en_curso' ? 'Iniciar Trabajo' : 'Marcar como Resuelto'} — Caso #{transicionCaso.id}
                    </h2>
                    <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem', fontSize: '0.9rem' }}>
                        Estado: <strong style={{ color: ESTADO_COLORS[transicionCaso.estado] }}>{ESTADO_LABELS[transicionCaso.estado]}</strong>
                        {' → '}
                        <strong style={{ color: transicionEstado ? ESTADO_COLORS[transicionEstado as EstadoPostventa] : undefined }}>
                            {transicionEstado ? ESTADO_LABELS[transicionEstado as EstadoPostventa] : ''}
                        </strong>
                    </p>
                    {transicionEstado === 'resuelto' && (
                        <Input dense label="Fecha de Cierre *" type="date" value={fechaCierre} onChange={e => setFechaCierre(e.target.value)} />
                    )}
                    <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
                        <Button variant="secondary" onClick={() => setTransicionCaso(null)}>Cancelar</Button>
                        <Button variant="primary" onClick={handleTransicion} disabled={submitting} loading={submitting}>
                            {submitting ? 'Actualizando...' : 'Confirmar'}
                        </Button>
                    </div>
                </ModalOverlay>
            )}

            {/* ─── Modal: Eliminar Caso ─── */}
            {deletingCaso && (
                <ModalOverlay onClose={() => setDeletingCaso(null)}>
                    <h2 style={{ margin: '0 0 1rem', fontSize: '1.2rem', fontWeight: 700, color: '#ef4444' }}>Eliminar Caso</h2>
                    <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
                        ¿Eliminar el caso <strong>#{deletingCaso.id}</strong> de <strong>{deletingCaso.cliente?.nombre}</strong>? Esta acción no se puede deshacer.
                    </p>
                    <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                        <Button variant="secondary" onClick={() => setDeletingCaso(null)}>Cancelar</Button>
                        <Button variant="danger" onClick={handleDeleteCaso}>Eliminar</Button>
                    </div>
                </ModalOverlay>
            )}

            {/* ─── Modal: Eliminar Ítem ─── */}
            {deletingItem && (
                <ModalOverlay onClose={() => setDeletingItem(null)}>
                    <h2 style={{ margin: '0 0 1rem', fontSize: '1.2rem', fontWeight: 700, color: '#ef4444' }}>Eliminar Ítem</h2>
                    <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
                        ¿Eliminar el ítem <strong>"{deletingItem.descripcion}"</strong>?
                    </p>
                    <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                        <Button variant="secondary" onClick={() => setDeletingItem(null)}>Cancelar</Button>
                        <Button variant="danger" onClick={handleDeleteItem}>Eliminar</Button>
                    </div>
                </ModalOverlay>
            )}

            {/* ─── Modal: Alta / Edición de Tipo ─── */}
            {showTipoModal && (
                <ModalOverlay onClose={() => setShowTipoModal(false)}>
                    <h2 style={{ margin: '0 0 1.5rem', fontSize: '1.25rem', fontWeight: 700 }}>
                        {editingTipo ? 'Editar Tipo de Caso' : 'Nuevo Tipo de Caso'}
                    </h2>
                    <div style={{ display: 'grid', gap: '1rem' }}>
                        <Input
                            dense
                            label="Nombre *"
                            value={tipoForm.nombre}
                            maxLength={60}
                            placeholder="Ej: Mecánica, Climatización, Chapa y pintura..."
                            onChange={e => setTipoForm(p => ({ ...p, nombre: e.target.value }))}
                        />
                        {editingTipo && (editingTipo.casosCount ?? 0) > 0 && (
                            <p className="text-xs text-muted" style={{ margin: 0 }}>
                                Lo usan {editingTipo.casosCount} caso(s). Si lo renombrás, se actualizan todos.
                            </p>
                        )}
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                            <input
                                type="checkbox"
                                checked={tipoForm.activo}
                                onChange={e => setTipoForm(p => ({ ...p, activo: e.target.checked }))}
                            />
                            <span>Activo</span>
                            <span className="text-xs text-muted">
                                — si lo desactivás deja de ofrecerse en casos nuevos, pero los que ya lo usan lo siguen mostrando
                            </span>
                        </label>
                    </div>
                    <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
                        <Button variant="secondary" onClick={() => setShowTipoModal(false)}>Cancelar</Button>
                        <Button variant="primary" onClick={handleSaveTipo} disabled={submitting} loading={submitting}>
                            {submitting ? 'Guardando...' : editingTipo ? 'Actualizar' : 'Crear'}
                        </Button>
                    </div>
                </ModalOverlay>
            )}

            {/* ─── Modal: Eliminar Tipo ─── */}
            {deletingTipo && (
                <ModalOverlay onClose={() => setDeletingTipo(null)}>
                    <h2 style={{ margin: '0 0 1rem', fontSize: '1.2rem', fontWeight: 700, color: '#ef4444' }}>Eliminar Tipo</h2>
                    <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
                        ¿Eliminar <strong>"{deletingTipo.nombre}"</strong>?
                        {(deletingTipo.casosCount ?? 0) > 0
                            ? ` Lo usan ${deletingTipo.casosCount} caso(s), así que no se va a poder borrar: desactivalo para sacarlo de circulación sin perder el historial.`
                            : ' No lo usa ningún caso.'}
                    </p>
                    <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                        <Button variant="secondary" onClick={() => setDeletingTipo(null)}>Cancelar</Button>
                        <Button variant="danger" onClick={handleDeleteTipo}>Eliminar</Button>
                    </div>
                </ModalOverlay>
            )}
        </div>
    );
}

/** ABM de tipos de caso. El conteo de casos es lo que decide si se puede borrar. */
function TiposPanel({ tipos, loading, onEdit, onDelete }: {
    tipos: TipoPostventa[];
    loading: boolean;
    onEdit: (t: TipoPostventa) => void;
    onDelete: (t: TipoPostventa) => void;
}) {
    if (loading) {
        return <div className="card glass" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>Cargando...</div>;
    }
    if (tipos.length === 0) {
        return (
            <div className="card glass" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
                <Tags size={40} style={{ opacity: 0.4, marginBottom: '0.75rem' }} />
                <p style={{ margin: 0 }}>No hay tipos cargados todavía.</p>
                <p className="text-xs text-muted" style={{ margin: '0.25rem 0 0' }}>
                    Creá los que uses (Mecánica, Climatización...) para poder clasificar los reclamos.
                </p>
            </div>
        );
    }
    return (
        <div className="card glass" style={{ overflow: 'hidden', padding: 0 }}>
            <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ borderBottom: '1px solid var(--border)' }}>
                            {['Tipo', 'Estado', 'Casos', 'Acciones'].map(h => (
                                <th key={h} style={{ padding: '0.75rem 1rem', textAlign: 'left', fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {tipos.map(t => (
                            <tr key={t.id} style={{ borderBottom: '1px solid var(--border)' }}>
                                <td style={{ padding: '0.75rem 1rem', fontWeight: 500 }}>{t.nombre}</td>
                                <td style={{ padding: '0.75rem 1rem' }}>
                                    <span className={`badge ${t.activo ? 'badge-emerald' : 'badge-navy'}`}>
                                        {t.activo ? 'Activo' : 'Archivado'}
                                    </span>
                                </td>
                                <td style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                                    {t.casosCount ?? 0}
                                </td>
                                <td style={{ padding: '0.75rem 1rem' }}>
                                    <div className="flex gap-2">
                                        <button className="icon-btn" title="Editar" onClick={() => onEdit(t)}>
                                            <Edit size={15} />
                                        </button>
                                        <button
                                            className="icon-btn danger"
                                            title={(t.casosCount ?? 0) > 0 ? 'En uso: archivalo en vez de borrarlo' : 'Eliminar'}
                                            onClick={() => onDelete(t)}
                                        >
                                            <Trash2 size={15} />
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function ModalOverlay({ children, onClose, wide }: { children: React.ReactNode; onClose: () => void; wide?: boolean }) {
    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}
            onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="glass" style={{ borderRadius: '1rem', padding: '2rem', width: '100%', maxWidth: wide ? '800px' : '520px', maxHeight: '90vh', overflowY: 'auto' }}>
                {children}
            </div>
        </div>
    );
}

function InfoBlock({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div style={{ background: 'color-mix(in srgb, var(--text-primary) 5%, transparent)', borderRadius: '0.5rem', padding: '1rem' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.75rem' }}>{title}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>{children}</div>
        </div>
    );
}

function InfoRow({ label, value }: { label: string; value: string }) {
    return (
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
            <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
            <span style={{ fontWeight: 500, textAlign: 'right', maxWidth: '60%' }}>{value}</span>
        </div>
    );
}
