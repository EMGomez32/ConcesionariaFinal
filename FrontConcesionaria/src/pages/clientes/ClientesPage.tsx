import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { clientesApi, type ConsultaEntrante, type ConsultaResultado } from '../../api/clientes.api';
import { usuariosApi } from '../../api/usuarios.api';
import { reportesApi } from '../../api/reportes.api';
import { vehiculosApi } from '../../api/vehiculos.api';
import { ESTADO_LEAD_MAP, ESTADOS_LEAD, ORIGEN_LEAD_LABEL, ORIGENES_LEAD } from '../../types/cliente.types';
import type { Cliente, ClienteFilter, EstadoLead, OrigenLead } from '../../types/cliente.types';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Textarea from '../../components/ui/Textarea';
import ClienteForm from '../../components/forms/ClienteForm';
import { useUIStore } from '../../store/uiStore';
import { useAuthStore } from '../../store/authStore';
import { useDebounce } from '../../hooks/useDebounce';
import {
    Plus,
    Search,
    Phone,
    Mail,
    Edit,
    Trash2,
    Users,
    RefreshCw,
    MapPin,
    ChevronRight,
    FileText,
    FileDown,
    Building2,
    UserCheck,
    MessageSquarePlus
} from 'lucide-react';
import Modal from '../../components/ui/Modal';
import DataTable, { type Column } from '../../components/ui/DataTable';
import PageTitle from '../../components/ui/PageTitle';
import { useConfirm } from '../../hooks/useConfirm';
import type { PaginatedResponse, ApiError } from '../../types/api.types';

const ClientesPage: React.FC = () => {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const { addToast } = useUIStore();
    const confirm = useConfirm();

    const user = useAuthStore((s) => s.user);
    // El embudo (conteos por etapa) es un endpoint admin/vendedor: sólo esos roles
    // lo consultan/ven. El badge y el filtro por etapa sí los ve cualquiera.
    const puedeVerFunnel = !!user?.roles?.some((r) => r === 'admin' || r === 'super_admin' || r === 'vendedor');
    // Export CSV: admin/vendedor en el backend → ocultamos el botón para el resto
    // (evita un botón muerto que siempre daría 403).
    const puedeExportar = puedeVerFunnel;

    const [searchTerm, setSearchTerm] = useState('');
    const debouncedSearch = useDebounce(searchTerm, 500);
    const [filterEstado, setFilterEstado] = useState<'' | EstadoLead>('');
    // Filtro por canal de entrada del lead: '' (todos) o un OrigenLead.
    const [filterCanal, setFilterCanal] = useState<'' | OrigenLead>('');
    // Filtro por vendedor "dueño": '' (todos), 'mios' (los del vendedor logueado) o un id.
    const [filterVendedor, setFilterVendedor] = useState<string>('');
    const { data: vendedoresData } = useQuery({
        queryKey: ['usuarios-vendedores'],
        queryFn: () => usuariosApi.getAll({}, { limit: 200 }),
        staleTime: 5 * 60 * 1000,
    });
    const vendedores = ((vendedoresData as { results?: { id: number; nombre: string; roles?: { rol?: { nombre?: string } }[] }[] })?.results ?? []);
    // Para asignar una consulta a mano: sólo usuarios con rol vendedor (el listado
    // incluye los roles). Si ninguno lo trae, degradamos a la lista completa.
    const soloVendedores = vendedores.filter((u) => u.roles?.some((r) => r.rol?.nombre === 'vendedor'));
    const vendedoresAsignables = soloVendedores.length > 0 ? soloVendedores : vendedores;
    const [page, setPage] = useState(1);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingCliente, setEditingCliente] = useState<Cliente | null>(null);
    const [exportando, setExportando] = useState(false);

    // ─ Nueva consulta (intake manual de un lead por cualquier canal) ─
    const consultaVacia = { origen: 'mostrador' as OrigenLead, nombre: '', telefono: '', email: '', vehiculoId: '', vendedorId: '', texto: '' };
    const [isConsultaOpen, setIsConsultaOpen] = useState(false);
    const [consultaForm, setConsultaForm] = useState(consultaVacia);

    // Vehículos publicados para "Vehículo consultado": recién al abrir el modal.
    const { data: vehiculosPublicadosData } = useQuery({
        queryKey: ['vehiculos', 'publicados-consulta'],
        queryFn: () => vehiculosApi.getAll({ estado: 'publicado' }, { limit: 200 }),
        enabled: isConsultaOpen,
        staleTime: 5 * 60 * 1000,
    });
    const vehiculosPublicados = vehiculosPublicadosData?.results ?? [];

    // Export CSV de la cartera con el MISMO filtro actual (para Excel/planilla).
    const handleExportCsv = async () => {
        setExportando(true);
        try {
            const filters: Record<string, unknown> = {};
            if (debouncedSearch.trim()) filters.search = debouncedSearch;
            if (filterEstado) filters.estadoLead = filterEstado;
            if (filterCanal) filters.origenLead = filterCanal;
            if (filterVendedor === 'mios' && user?.id) filters.vendedorAsignadoId = user.id;
            else if (filterVendedor) filters.vendedorAsignadoId = Number(filterVendedor);
            const res = await clientesApi.exportCsv(filters);
            const url = window.URL.createObjectURL(new Blob([res.data], { type: 'text/csv' }));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', 'clientes.csv');
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
            // El backend avisa por header si el export se topó con el límite (5000).
            const total = res.headers?.['x-export-truncated'];
            if (total) addToast(`Se exportaron los primeros 5000 clientes de ${total}. Filtrá para acotar el CSV.`, 'info');
        } catch {
            addToast('Error al exportar los clientes', 'error');
        } finally {
            setExportando(false);
        }
    };

    // Queries
    const { data: response, isLoading, refetch } = useQuery<PaginatedResponse<Cliente>, ApiError>({
        queryKey: ['clientes', page, debouncedSearch, filterEstado, filterCanal, filterVendedor],
        queryFn: async () => {
            const filters: ClienteFilter = {};
            // `search` busca en nombre, DNI/CUIT, email y teléfono, que es lo
            // que ofrece el placeholder del buscador.
            if (debouncedSearch.trim()) filters.search = debouncedSearch;
            if (filterEstado) filters.estadoLead = filterEstado;
            if (filterCanal) filters.origenLead = filterCanal;
            if (filterVendedor === 'mios' && user?.id) filters.vendedorAsignadoId = user.id;
            else if (filterVendedor) filters.vendedorAsignadoId = Number(filterVendedor);
            const res = await clientesApi.getAll(filters, { page, limit: 12 });
            // El interceptor devuelve response.data directamente
            // La estructura es: { results: [...], page, limit, totalPages, totalResults }
            return res;
        }
    });

    // Embudo de leads (conteos por etapa) para el resumen clickeable de arriba.
    const { data: funnel } = useQuery({
        queryKey: ['clientes', 'leads-resumen'],
        queryFn: () => reportesApi.leadsResumen(),
        enabled: puedeVerFunnel,
        staleTime: 1000 * 60,
    });

    const clientes = response?.results || [];
    const totalPages = response?.totalPages || 1;

    // Mutations
    const createMutation = useMutation<Cliente, ApiError, Partial<Cliente>>({
        mutationFn: async (data: Partial<Cliente>) => {
            const res = await clientesApi.create(data);
            return res;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['clientes'] });
            addToast('Cliente registrado correctamente', 'success');
            handleCloseModal();
        },
        onError: (err: ApiError) => {
            addToast(err?.message || 'Error al registrar cliente', 'error');
        }
    });

    const updateMutation = useMutation<Cliente, ApiError, { id: number, data: Partial<Cliente> }>({
        mutationFn: async ({ id, data }: { id: number, data: Partial<Cliente> }) => {
            const res = await clientesApi.update(id, data);
            return res;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['clientes'] });
            addToast('Datos actualizados correctamente', 'success');
            handleCloseModal();
        },
        onError: (err: ApiError) => {
            addToast(err?.message || 'Error al actualizar cliente', 'error');
        }
    });

    const deleteMutation = useMutation<void, ApiError, number>({
        mutationFn: async (id: number) => {
            await clientesApi.delete(id);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['clientes'] });
            addToast('Cliente eliminado correctamente', 'success');
        },
        onError: (err: ApiError) => {
            addToast(err?.message || 'Error al eliminar cliente', 'error');
        }
    });

    // Registra la consulta entrante: el backend deduplica, asigna vendedor
    // (round-robin si no se eligió uno) y reabre leads terminales.
    const consultaMutation = useMutation<ConsultaResultado, ApiError, ConsultaEntrante>({
        mutationFn: (data) => clientesApi.crearConsulta(data),
        onSuccess: (res) => {
            queryClient.invalidateQueries({ queryKey: ['clientes'] });
            addToast(res.reabierto ? 'Consulta asignada (reabierta)' : 'Consulta asignada', 'success');
            handleCloseConsulta();
        },
        onError: (err: ApiError) => {
            addToast(err?.message || 'Error al registrar la consulta', 'error');
        }
    });

    const handleCloseConsulta = () => {
        setIsConsultaOpen(false);
        setConsultaForm(consultaVacia);
    };

    const handleSubmitConsulta = () => {
        if (!consultaForm.nombre.trim()) {
            addToast('El nombre es obligatorio', 'error');
            return;
        }
        consultaMutation.mutate({
            origen: consultaForm.origen,
            nombre: consultaForm.nombre.trim(),
            telefono: consultaForm.telefono.trim() || undefined,
            email: consultaForm.email.trim() || undefined,
            texto: consultaForm.texto.trim() || undefined,
            vehiculoId: consultaForm.vehiculoId ? Number(consultaForm.vehiculoId) : undefined,
            vendedorId: consultaForm.vendedorId ? Number(consultaForm.vendedorId) : undefined,
        });
    };

    const handleOpenModal = (cliente?: Cliente) => {
        setEditingCliente(cliente || null);
        setIsModalOpen(true);
    };

    const handleCloseModal = () => {
        setIsModalOpen(false);
        setEditingCliente(null);
    };

    const handleSubmit = async (data: Partial<Cliente>) => {
        if (editingCliente) {
            updateMutation.mutate({ id: editingCliente.id, data });
        } else {
            createMutation.mutate(data);
        }
    };

    const handleEditFromVerification = (cliente: Cliente) => {
        setEditingCliente(cliente);
        // El modal permanece abierto y ahora muestra el formulario de edición
    };

    const handleDelete = (cliente: Cliente) => {
        confirm({
            title: 'Eliminar Cliente',
            message: `¿Estás seguro de que deseas eliminar a "${cliente.nombre}"? Esta acción no se puede deshacer si existen registros vinculados.`,
            type: 'danger',
            confirmLabel: 'Eliminar Permanente',
            onConfirm: async () => {
                await deleteMutation.mutateAsync(cliente.id);
            }
        });
    };

    const columns: Column<Cliente>[] = [
        {
            header: 'Cliente',
            accessor: (c) => (
                <div className="flex items-center gap-3">
                    <div className="text-accent font-black text-sm flex items-center justify-center">
                        {c.nombre.charAt(0).toUpperCase()}
                    </div>
                    <div>
                        <h3 className="font-bold uppercase text-xs">{c.nombre}</h3>
                        <div className="flex items-center text-muted text-3xs font-black uppercase tracking-wider">
                            <FileText size={10} />
                            <span>CUIT/CUIL: {c.dni || 'No registrado'}</span>
                        </div>
                    </div>
                </div>
            )
        },
        {
            header: 'Concesionaria',
            accessor: (c) => (
                c.concesionaria ? (
                    <div className="flex items-center gap-2 text-muted text-xs">
                        <Building2 size={12} className="text-accent" />
                        <span className="truncate">{c.concesionaria.nombre}</span>
                    </div>
                ) : (
                    <span className="text-secondary">-</span>
                )
            )
        },
        {
            header: 'Contacto',
            accessor: (c) => (
                <div>
                    <div className="flex items-center gap-2 text-muted text-xs">
                        <Mail size={12} className="text-accent" />
                        <span className="truncate">{c.email || 'Sin email'}</span>
                    </div>
                    <div className="flex items-center gap-2 text-muted text-xs">
                        <Phone size={12} className="text-accent" />
                        <span>{c.telefono || 'Sin teléfono'}</span>
                    </div>
                </div>
            )
        },
        {
            header: 'Localización',
            accessor: (c) => (
                c.direccion ? (
                    <div className="flex items-center gap-2 text-muted text-3xs font-black uppercase italic">
                        <MapPin size={10} />
                        <span className="truncate">{c.direccion}</span>
                    </div>
                ) : <span className="text-secondary">-</span>
            )
        },
        {
            header: 'Etapa',
            accessor: (c) => {
                const e = ESTADO_LEAD_MAP[c.estadoLead ?? 'nuevo'];
                return (
                    <div className="flex items-center gap-1.5 flex-wrap">
                        <Badge variant={e.variant}>{e.label}</Badge>
                        {/* Canal de entrada del lead (null = sin registrar → nada). */}
                        {c.origenLead && <Badge variant="default" className="canal-badge">{ORIGEN_LEAD_LABEL[c.origenLead]}</Badge>}
                    </div>
                );
            }
        },
        {
            header: 'Vendedor',
            accessor: (c) => (
                c.vendedorAsignado ? (
                    <div className="flex items-center gap-2 text-muted text-xs">
                        <UserCheck size={12} className="text-accent" />
                        <span className="truncate">{c.vendedorAsignado.nombre}</span>
                    </div>
                ) : <span className="text-secondary text-xs italic">Sin asignar</span>
            )
        },
        {
            header: 'Acciones',
            align: 'right',
            accessor: (c) => (
                <div className="flex justify-end gap-1">
                    <button className="icon-btn" onClick={(e) => { e.stopPropagation(); handleOpenModal(c); }}>
                        <Edit size={14} />
                    </button>
                    <button className="icon-btn danger" onClick={(e) => { e.stopPropagation(); handleDelete(c); }}>
                        <Trash2 size={14} />
                    </button>
                    <button className="icon-btn" onClick={(e) => { e.stopPropagation(); navigate(`/clientes/${c.id}`); }}>
                        <ChevronRight size={14} />
                    </button>
                </div>
            )
        }
    ];

    return (
        <div className="page-container animate-fade-in">
            <PageTitle title="Clientes" />
            <header className="page-header">
                <div className="header-title">
                    <div className="flex items-center gap-3 mb-1">
                        <div className="icon-badge primary shadow-glow">
                            <Users size={22} />
                        </div>
                        <h1>Directorio de Clientes</h1>
                    </div>
                    <p>Gestiona la base de datos de contactos y prospectos de la concesionaria.</p>
                </div>

                <div className="flex gap-3">
                    <Button variant="secondary" onClick={() => refetch()}>
                        <RefreshCw size={18} className={isLoading ? 'animate-spin' : ''} />
                    </Button>
                    {/* Export CSV del filtro actual (para Excel/planilla). admin/vendedor. */}
                    {puedeExportar && (
                        <Button variant="secondary" onClick={handleExportCsv} loading={exportando} title="Exportar la cartera filtrada a CSV (Excel)">
                            <FileDown size={18} />
                            CSV
                        </Button>
                    )}
                    <Button variant="secondary" onClick={() => setIsConsultaOpen(true)} title="Registrar una consulta entrante (lead) por cualquier canal">
                        <MessageSquarePlus size={18} />
                        Nueva consulta
                    </Button>
                    <Button data-tour="cli-nuevo" variant="primary" onClick={() => handleOpenModal()}>
                        <Plus size={18} />
                        Nuevo Cliente
                    </Button>
                </div>
            </header>

            {/* Embudo de leads: conteo por etapa, clickeable para filtrar. */}
            {puedeVerFunnel && funnel && (
                <div className="lead-funnel mb-6" data-tour="cli-funnel">
                    <button
                        type="button"
                        className={`funnel-chip ${filterEstado === '' ? 'is-active' : ''}`}
                        onClick={() => { setFilterEstado(''); setPage(1); }}
                    >
                        <span className="funnel-count">{funnel.total}</span>
                        <span className="funnel-tag">Todos</span>
                    </button>
                    {ESTADOS_LEAD.map((k) => (
                        <button
                            key={k}
                            type="button"
                            className={`funnel-chip ${filterEstado === k ? 'is-active' : ''}`}
                            onClick={() => { setFilterEstado(filterEstado === k ? '' : k); setPage(1); }}
                        >
                            <span className="funnel-count">{funnel[k]}</span>
                            <Badge variant={ESTADO_LEAD_MAP[k].variant}>{ESTADO_LEAD_MAP[k].label}</Badge>
                        </button>
                    ))}
                </div>
            )}

            <div className="card glass filters-bar mb-6" data-tour="cli-filtros" style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <div className="search-box" style={{ flex: '1 1 240px' }}>
                    <Search size={18} className="text-muted" />
                    <input
                        type="text"
                        placeholder="Buscar por nombre, CUIT/CUIL o email..."
                        value={searchTerm}
                        onChange={(e) => {
                            setSearchTerm(e.target.value);
                            setPage(1);
                        }}
                        className="w-full text-sm font-medium"
                    />
                </div>
                <select
                    className="form-input"
                    value={filterEstado}
                    onChange={(e) => { setFilterEstado(e.target.value as '' | EstadoLead); setPage(1); }}
                    style={{ minWidth: 170 }}
                    aria-label="Filtrar por etapa"
                >
                    <option value="">Todas las etapas</option>
                    {ESTADOS_LEAD.map((k) => <option key={k} value={k}>{ESTADO_LEAD_MAP[k].label}</option>)}
                </select>
                <select
                    className="form-input"
                    value={filterCanal}
                    onChange={(e) => { setFilterCanal(e.target.value as '' | OrigenLead); setPage(1); }}
                    style={{ minWidth: 170 }}
                    aria-label="Filtrar por canal de entrada"
                >
                    <option value="">Todos los canales</option>
                    {ORIGENES_LEAD.map((o) => <option key={o} value={o}>{ORIGEN_LEAD_LABEL[o]}</option>)}
                </select>
                <select
                    className="form-input"
                    value={filterVendedor}
                    onChange={(e) => { setFilterVendedor(e.target.value); setPage(1); }}
                    style={{ minWidth: 170 }}
                    aria-label="Filtrar por vendedor asignado"
                >
                    <option value="">Todos los vendedores</option>
                    <option value="mios">Mis clientes</option>
                    {vendedores.map((v) => <option key={v.id} value={v.id}>{v.nombre}</option>)}
                </select>
            </div>

            <style>{`
                .lead-funnel { display: flex; gap: 0.6rem; flex-wrap: wrap; }
                .funnel-chip { display: flex; flex-direction: column; align-items: center; gap: 0.4rem; padding: 0.7rem 1rem; min-width: 100px; background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-md); cursor: pointer; transition: border-color .15s, transform .15s; }
                .funnel-chip:hover { border-color: var(--accent); transform: translateY(-1px); }
                .funnel-chip.is-active { border-color: var(--accent); box-shadow: inset 0 0 0 1px var(--accent); }
                .funnel-count { font-size: var(--text-xl); font-weight: 800; color: var(--text-primary); font-variant-numeric: tabular-nums; line-height: 1; }
                .funnel-tag { font-size: var(--text-2xs); font-weight: 800; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-muted); }
                .canal-badge { font-size: var(--text-3xs); padding: 0.1rem 0.45rem; }
            `}</style>

            <div data-tour="cli-tabla">
            <DataTable
                columns={columns}
                data={clientes}
                isLoading={isLoading}
                onRowClick={(c) => navigate(`/clientes/${c.id}`)}
                currentPage={page}
                totalPages={totalPages}
                onPageChange={setPage}
                emptyMessage="No se encontraron registros de clientes"
                emptyIcon={<Users size={40} className="text-secondary" />}
            />
            </div>

            <Modal
                isOpen={isModalOpen}
                onClose={handleCloseModal}
                title={editingCliente ? 'Editar Cliente' : 'Nuevo Cliente'}
                subtitle={editingCliente ? 'Actualiza la información del cliente.' : 'Completa los datos para registrar un nuevo cliente.'}
                maxWidth="700px"
            >
                <ClienteForm
                    initialData={editingCliente}
                    onSubmit={handleSubmit}
                    onCancel={handleCloseModal}
                    onEdit={handleEditFromVerification}
                    loading={createMutation.isPending || updateMutation.isPending}
                />
            </Modal>

            {/* Intake manual de una consulta entrante: el backend deduplica por
                teléfono/email, asigna vendedor (round-robin) y reabre terminales. */}
            <Modal
                isOpen={isConsultaOpen}
                onClose={handleCloseConsulta}
                title="Nueva Consulta"
                subtitle="Registra una consulta entrante y asignala a un vendedor."
                maxWidth="600px"
            >
                <div>
                    <div className="grid grid-cols-2 gap-4">
                        <Select
                            dense
                            label="Canal *"
                            value={consultaForm.origen}
                            onChange={(e) => setConsultaForm((f) => ({ ...f, origen: e.target.value as OrigenLead }))}
                        >
                            {ORIGENES_LEAD.map((o) => <option key={o} value={o}>{ORIGEN_LEAD_LABEL[o]}</option>)}
                        </Select>
                        <Input
                            dense
                            label="Nombre *"
                            placeholder="Nombre del interesado"
                            value={consultaForm.nombre}
                            onChange={(e) => setConsultaForm((f) => ({ ...f, nombre: e.target.value }))}
                        />
                        <Input
                            dense
                            label="Teléfono"
                            placeholder="Ej: 2611234567"
                            value={consultaForm.telefono}
                            onChange={(e) => setConsultaForm((f) => ({ ...f, telefono: e.target.value }))}
                        />
                        <Input
                            dense
                            label="Email"
                            type="email"
                            placeholder="correo@ejemplo.com"
                            value={consultaForm.email}
                            onChange={(e) => setConsultaForm((f) => ({ ...f, email: e.target.value }))}
                        />
                        <Select
                            dense
                            label="Vehículo consultado"
                            placeholder="Sin vehículo puntual"
                            value={consultaForm.vehiculoId}
                            onChange={(e) => setConsultaForm((f) => ({ ...f, vehiculoId: e.target.value }))}
                        >
                            {vehiculosPublicados.map((v) => (
                                <option key={v.id} value={v.id}>{v.marca} {v.modelo} ({v.dominio || 'S/D'})</option>
                            ))}
                        </Select>
                        <Select
                            dense
                            label="Vendedor"
                            placeholder="Asignación automática (round-robin)"
                            value={consultaForm.vendedorId}
                            onChange={(e) => setConsultaForm((f) => ({ ...f, vendedorId: e.target.value }))}
                        >
                            {vendedoresAsignables.map((v) => <option key={v.id} value={v.id}>{v.nombre}</option>)}
                        </Select>
                    </div>

                    <Textarea
                        dense
                        label="Consulta"
                        placeholder="¿Qué consultó? Ej: precio, financiación, permuta…"
                        rows={3}
                        value={consultaForm.texto}
                        onChange={(e) => setConsultaForm((f) => ({ ...f, texto: e.target.value }))}
                    />

                    <div className="form-actions">
                        <Button variant="secondary" onClick={handleCloseConsulta}>Cancelar</Button>
                        <Button
                            variant="primary"
                            onClick={handleSubmitConsulta}
                            loading={consultaMutation.isPending}
                        >
                            Registrar Consulta
                        </Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};

export default ClientesPage;
