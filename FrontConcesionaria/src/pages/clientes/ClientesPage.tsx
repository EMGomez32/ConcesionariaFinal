import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { clientesApi } from '../../api/clientes.api';
import type { Cliente, ClienteFilter } from '../../types/cliente.types';
import Button from '../../components/ui/Button';
import ClienteForm from '../../components/forms/ClienteForm';
import { useUIStore } from '../../store/uiStore';
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

    const [searchTerm, setSearchTerm] = useState('');
    const debouncedSearch = useDebounce(searchTerm, 500);
    const [page, setPage] = useState(1);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingCliente, setEditingCliente] = useState<Cliente | null>(null);

    // Queries
    const { data: response, isLoading, refetch } = useQuery<PaginatedResponse<Cliente>, ApiError>({
        queryKey: ['clientes', page, debouncedSearch],
        queryFn: async () => {
            const filters: ClienteFilter = {};
            // `search` busca en nombre, DNI/CUIT, email y teléfono, que es lo
            // que ofrece el placeholder del buscador.
            if (debouncedSearch.trim()) filters.search = debouncedSearch;
            const res = await clientesApi.getAll(filters, { page, limit: 12 });
            // El interceptor devuelve response.data directamente
            // La estructura es: { results: [...], page, limit, totalPages, totalResults }
            return res;
        }
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

            <div className="card glass filters-bar mb-6">
                <div className="search-box">
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
            </div>

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
