import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { proveedoresApi } from '../../api/proveedores.api';
import type { Proveedor } from '../../types/proveedor.types';
import Button from '../../components/ui/Button';
import ProveedorForm from '../../components/forms/ProveedorForm';
import { useUIStore } from '../../store/uiStore';
import { TIPOS_PROVEEDOR, labelTipoProveedor } from '../../constants/proveedorTipos';
import {
    Plus,
    Search,
    Building2,
    Phone,
    Mail,
    Edit,
    Trash2,
    Truck,
    RefreshCw,
    MapPin,
    ChevronRight,
    CheckCircle2,
    XCircle
} from 'lucide-react';
import Modal from '../../components/ui/Modal';
import PageTitle from '../../components/ui/PageTitle';
import { EstadoListado } from '../../components/listado';
import { useConfirm } from '../../hooks/useConfirm';
import type { PaginatedResponse } from '../../types/api.types';
import type { ProveedorFilter } from '../../types/proveedor.types';
import { getApiErrorMessage } from '../../utils/error';

const TIPO_COLORS: Record<string, string> = {
    importadora: 'text-accent-2',
    taller: 'text-warning',
    particular: 'text-accent',
    financiera: 'text-info',
    otro: 'text-muted',
};

const ProveedoresPage: React.FC = () => {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const { addToast } = useUIStore();
    const confirm = useConfirm();

    const [searchTerm, setSearchTerm] = useState('');
    const [filterTipo, setFilterTipo] = useState('');
    const [filterActivo, setFilterActivo] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingProveedor, setEditingProveedor] = useState<Proveedor | null>(null);

    // Queries
    const { data: response, isLoading, isError, refetch } = useQuery<PaginatedResponse<Proveedor>, Error>({
        queryKey: ['proveedores', searchTerm, filterTipo, filterActivo],
        queryFn: async () => {
            const filters: ProveedorFilter = {};
            if (searchTerm.trim()) filters.nombre = searchTerm;
            if (filterTipo) filters.tipo = filterTipo;
            if (filterActivo !== '') filters.activo = filterActivo === 'true';
            const res = await proveedoresApi.getAll(filters);
            return res;
        }
    });

    const proveedores = response?.results || [];

    // Mutations
    const createMutation = useMutation({
        mutationFn: (data: Partial<Proveedor>) => proveedoresApi.create(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['proveedores'] });
            addToast('Proveedor creado', 'success');
            handleCloseModal();
        },
        onError: (err) => {
            addToast(getApiErrorMessage(err, 'No se pudo crear el proveedor'), 'error');
        }
    });

    const updateMutation = useMutation({
        mutationFn: ({ id, data }: { id: number, data: Partial<Proveedor> }) => proveedoresApi.update(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['proveedores'] });
            addToast('Proveedor actualizado', 'success');
            handleCloseModal();
        },
        onError: (err) => {
            addToast(getApiErrorMessage(err, 'No se pudo guardar el proveedor'), 'error');
        }
    });

    const deleteMutation = useMutation({
        mutationFn: (id: number) => proveedoresApi.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['proveedores'] });
            addToast('Proveedor eliminado', 'success');
        },
        onError: (err) => {
            addToast(getApiErrorMessage(err, 'No se pudo eliminar el proveedor'), 'error');
        }
    });

    const handleOpenModal = (proveedor?: Proveedor) => {
        setEditingProveedor(proveedor || null);
        setIsModalOpen(true);
    };

    const handleCloseModal = () => {
        setIsModalOpen(false);
        setEditingProveedor(null);
    };

    const handleSubmit = async (data: Partial<Proveedor>) => {
        if (editingProveedor) {
            updateMutation.mutate({ id: editingProveedor.id, data });
        } else {
            createMutation.mutate(data);
        }
    };

    const handleDelete = (p: Proveedor) => {
        confirm({
            title: 'Eliminar proveedor',
            message: `¿Eliminar a "${p.nombre}"? Si ya tiene gastos o ítems de postventa cargados, no se puede eliminar: marcalo como inactivo.`,
            type: 'danger',
            confirmLabel: 'Eliminar Permanentemente',
            onConfirm: async () => {
                await deleteMutation.mutateAsync(p.id);
            }
        });
    };

    const nuevoProveedor = (
        <Button variant="primary" onClick={() => handleOpenModal()}>
            <Plus size={18} aria-hidden="true" />
            Nuevo proveedor
        </Button>
    );

    return (
        <div className="page-container animate-fade-in">
            <PageTitle title="Proveedores" />
            <header className="page-header">
                <div className="header-title">
                    <div className="flex items-center gap-3 mb-1">
                        <div className="icon-badge primary shadow-glow">
                            <Truck size={22} />
                        </div>
                        <h1>Proveedores</h1>
                    </div>
                    <p>Talleres, gestorías, financieras y otras empresas con las que trabajás</p>
                </div>

                <div className="flex gap-3">
                    <Button variant="secondary" onClick={() => refetch()} aria-label="Actualizar la lista" title="Actualizar">
                        <RefreshCw size={18} className={isLoading ? 'animate-spin' : ''} aria-hidden="true" />
                    </Button>
                    {nuevoProveedor}
                </div>
            </header>

            <div className="card glass filters-bar mb-6 flex-wrap lg:flex-nowrap gap-4">
                <div className="search-box flex-1">
                    <Search size={18} className="text-muted" aria-hidden="true" />
                    <input
                        type="search"
                        aria-label="Buscar proveedores"
                        placeholder="Buscar por nombre o empresa"
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        className="w-full text-sm font-medium"
                    />
                </div>

                <div className="flex gap-3 w-full lg:w-auto">
                    <select
                        className="text-muted text-xs font-bold"
                        aria-label="Tipo de proveedor"
                        value={filterTipo}
                        onChange={e => setFilterTipo(e.target.value)}
                    >
                        <option value="">Todos los tipos</option>
                        {TIPOS_PROVEEDOR.map(t => (
                            <option key={t.value} value={t.value}>{t.label}</option>
                        ))}
                    </select>

                    <select
                        className="text-muted text-xs font-bold"
                        aria-label="Estado"
                        value={filterActivo}
                        onChange={e => setFilterActivo(e.target.value)}
                    >
                        <option value="">Activos e inactivos</option>
                        <option value="true">Activos</option>
                        <option value="false">Inactivos</option>
                    </select>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {isLoading && !proveedores.length ? (
                    [1, 2, 3, 4, 5, 6].map(i => (
                        <div key={i} className="card" style={{ height: '220px', background: 'color-mix(in srgb, var(--text-primary) 5%, transparent)' }}></div>
                    ))
                ) : isError ? (
                    <div className="col-span-full card">
                        <EstadoListado tipo="error" mensaje="No se pudieron cargar los proveedores" onReintentar={() => refetch()} />
                    </div>
                ) : proveedores.length === 0 ? (
                    <div className="col-span-full card">
                        {searchTerm.trim() || filterTipo || filterActivo
                            ? <EstadoListado tipo="sin-resultados" onLimpiarFiltros={() => { setSearchTerm(''); setFilterTipo(''); setFilterActivo(''); }} />
                            : <EstadoListado
                                tipo="vacio"
                                titulo="Todavía no cargaste proveedores"
                                descripcion="Sumá los talleres, gestorías y demás empresas con las que trabajás: los vas a usar al cargar gastos y al mandar unidades a preparación."
                                icono={<Truck size={32} aria-hidden="true" />}
                                accion={nuevoProveedor}
                            />}
                    </div>
                ) : (
                    proveedores.map((p: Proveedor) => (
                        <div key={p.id} className="card glass flex flex-col">
                            <div className="flex justify-between items-start mb-6">
                                <div className="flex items-center gap-4">
                                    <div className="text-accent-2 flex items-center justify-center">
                                        <Building2 size={24} />
                                    </div>
                                    <div>
                                        <h3 className="cell-heading text-lg leading-tight">{p.nombre}</h3>
                                        <span className={`text-3xs font-black uppercase tracking-wider ${TIPO_COLORS[p.tipo || 'otro']}`}>
                                            {p.tipo ? labelTipoProveedor(p.tipo) : 'Sin tipo'}
                                        </span>
                                    </div>
                                </div>

                                <div className="flex gap-1">
                                    <button type="button" className="icon-btn small" onClick={() => handleOpenModal(p)} aria-label={`Editar ${p.nombre}`} title="Editar">
                                        <Edit size={14} aria-hidden="true" />
                                    </button>
                                    <button type="button" className="icon-btn small danger" onClick={() => handleDelete(p)} aria-label={`Eliminar ${p.nombre}`} title="Eliminar">
                                        <Trash2 size={14} aria-hidden="true" />
                                    </button>
                                </div>
                            </div>

                            <div className="flex-1">
                                <div className="flex items-center gap-3 text-muted">
                                    <div className="flex items-center justify-center">
                                        <Mail size={14} className="text-accent-2" />
                                    </div>
                                    <span className="text-sm font-medium truncate">{p.email || 'Sin email'}</span>
                                </div>
                                <div className="flex items-center gap-3 text-muted">
                                    <div className="flex items-center justify-center">
                                        <Phone size={14} className="text-accent-2" />
                                    </div>
                                    <span className="text-sm font-medium">{p.telefono || 'Sin teléfono'}</span>
                                </div>
                                {p.direccion && (
                                    <div className="flex items-center gap-3 text-muted">
                                        <div className="flex items-center justify-center">
                                            <MapPin size={14} />
                                        </div>
                                        <span className="text-xs italic truncate">{p.direccion}</span>
                                    </div>
                                )}
                            </div>

                            <div className="flex justify-between items-center">
                                <div className={`flex items-center text-3xs font-black uppercase tracking-widest ${p.activo ? 'text-success' : 'text-muted'}`}>
                                    {p.activo ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                                    {p.activo ? 'Activo' : 'Inactivo'}
                                </div>
                                <button
                                    type="button"
                                    className="text-muted flex items-center gap-1 text-3xs font-bold uppercase"
                                    onClick={() => navigate(`/proveedores/${p.id}`)}
                                    aria-label={`Ver la ficha de ${p.nombre}`}
                                >
                                    Ver ficha
                                    <ChevronRight size={14} aria-hidden="true" />
                                </button>
                            </div>
                        </div>
                    ))
                )}
            </div>

            <Modal
                isOpen={isModalOpen}
                onClose={handleCloseModal}
                title={editingProveedor ? 'Editar proveedor' : 'Nuevo proveedor'}
                maxWidth="600px"
            >
                <ProveedorForm
                    initialData={editingProveedor}
                    onSubmit={handleSubmit}
                    onCancel={handleCloseModal}
                    loading={createMutation.isPending || updateMutation.isPending}
                />
            </Modal>
        </div>
    );
};

export default ProveedoresPage;

