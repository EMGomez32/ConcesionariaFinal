import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { clientesApi } from '../../api/clientes.api';
import { reportesApi } from '../../api/reportes.api';
import { ESTADO_LEAD_MAP, ESTADOS_LEAD } from '../../types/cliente.types';
import type { Cliente, ClienteFilter, EstadoLead } from '../../types/cliente.types';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
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
    Building2
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

    const [searchTerm, setSearchTerm] = useState('');
    const debouncedSearch = useDebounce(searchTerm, 500);
    const [filterEstado, setFilterEstado] = useState<'' | EstadoLead>('');
    const [page, setPage] = useState(1);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingCliente, setEditingCliente] = useState<Cliente | null>(null);

    // Queries
    const { data: response, isLoading, refetch } = useQuery<PaginatedResponse<Cliente>, ApiError>({
        queryKey: ['clientes', page, debouncedSearch, filterEstado],
        queryFn: async () => {
            const filters: ClienteFilter = {};
            // `search` busca en nombre, DNI/CUIT, email y teléfono, que es lo
            // que ofrece el placeholder del buscador.
            if (debouncedSearch.trim()) filters.search = debouncedSearch;
            if (filterEstado) filters.estadoLead = filterEstado;
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
                    <div className="bg-accent/20 text-accent font-black text-sm w-10 h-10 rounded-xl flex items-center justify-center border border-accent/20">
                        {c.nombre.charAt(0).toUpperCase()}
                    </div>
                    <div>
                        <h3 className="font-bold text-white uppercase text-xs">{c.nombre}</h3>
                        <div className="flex items-center gap-1.5 text-slate-500 text-[10px] font-black uppercase tracking-wider">
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
                    <div className="flex items-center gap-2 text-slate-400 text-xs">
                        <Building2 size={12} className="text-accent/60" />
                        <span className="truncate max-w-[150px]">{c.concesionaria.nombre}</span>
                    </div>
                ) : (
                    <span className="text-slate-600">-</span>
                )
            )
        },
        {
            header: 'Contacto',
            accessor: (c) => (
                <div className="space-y-1">
                    <div className="flex items-center gap-2 text-slate-400 text-xs">
                        <Mail size={12} className="text-accent/60" />
                        <span className="truncate max-w-[150px]">{c.email || 'Sin email'}</span>
                    </div>
                    <div className="flex items-center gap-2 text-slate-400 text-xs">
                        <Phone size={12} className="text-accent/60" />
                        <span>{c.telefono || 'Sin teléfono'}</span>
                    </div>
                </div>
            )
        },
        {
            header: 'Localización',
            accessor: (c) => (
                c.direccion ? (
                    <div className="flex items-center gap-2 text-slate-500 text-[10px] font-black uppercase italic">
                        <MapPin size={10} />
                        <span className="truncate max-w-[150px]">{c.direccion}</span>
                    </div>
                ) : <span className="text-slate-600">-</span>
            )
        },
        {
            header: 'Etapa',
            accessor: (c) => {
                const e = ESTADO_LEAD_MAP[c.estadoLead ?? 'nuevo'];
                return <Badge variant={e.variant}>{e.label}</Badge>;
            }
        },
        {
            header: 'Acciones',
            align: 'right',
            accessor: (c) => (
                <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
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
                    <Button variant="primary" onClick={() => handleOpenModal()}>
                        <Plus size={18} />
                        Nuevo Cliente
                    </Button>
                </div>
            </header>

            {/* Embudo de leads: conteo por etapa, clickeable para filtrar. */}
            {puedeVerFunnel && funnel && (
                <div className="lead-funnel mb-6">
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

            <div className="card glass filters-bar mb-6" style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <div className="search-box" style={{ flex: '1 1 240px' }}>
                    <Search size={18} className="text-slate-500" />
                    <input
                        type="text"
                        placeholder="Buscar por nombre, CUIT/CUIL o email..."
                        value={searchTerm}
                        onChange={(e) => {
                            setSearchTerm(e.target.value);
                            setPage(1);
                        }}
                        className="bg-transparent border-none outline-none text-white w-full text-sm font-medium"
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
            </div>

            <style>{`
                .lead-funnel { display: flex; gap: 0.6rem; flex-wrap: wrap; }
                .funnel-chip { display: flex; flex-direction: column; align-items: center; gap: 0.4rem; padding: 0.7rem 1rem; min-width: 100px; background: var(--bg-card); border: 1px solid var(--border); border-radius: 0.8rem; cursor: pointer; transition: border-color .15s, transform .15s; }
                .funnel-chip:hover { border-color: var(--accent); transform: translateY(-1px); }
                .funnel-chip.is-active { border-color: var(--accent); box-shadow: inset 0 0 0 1px var(--accent); }
                .funnel-count { font-size: 1.5rem; font-weight: 800; color: var(--text-primary); font-variant-numeric: tabular-nums; line-height: 1; }
                .funnel-tag { font-size: 0.68rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-muted); }
            `}</style>

            <DataTable
                columns={columns}
                data={clientes}
                isLoading={isLoading}
                onRowClick={(c) => navigate(`/clientes/${c.id}`)}
                currentPage={page}
                totalPages={totalPages}
                onPageChange={setPage}
                emptyMessage="No se encontraron registros de clientes"
                emptyIcon={<Users size={40} className="text-slate-600" />}
            />

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
        </div>
    );
};

export default ClientesPage;
