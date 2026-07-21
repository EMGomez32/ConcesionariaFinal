import { useState } from 'react';
import { sucursalesApi } from '../../api/sucursales.api';
import { useSucursales, sucursalesKeys } from '../../hooks/useSucursales';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Sucursal, CreateSucursalDto } from '../../types/sucursal.types';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import { Plus, Search, Store, MapPin, Phone, Edit, Trash2, CheckCircle, XCircle } from 'lucide-react';
import SucursalForm from '../../components/forms/SucursalForm';
import { useUIStore } from '../../store/uiStore';
import { getApiErrorMessage } from '../../utils/error';

const SucursalesPage = () => {
    const { addToast } = useUIStore();
    const queryClient = useQueryClient();
    const [searchTerm, setSearchTerm] = useState('');
    const { data: sucursales = [], isLoading: loading, error } = useSucursales({ nombre: searchTerm });
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingSucursal, setEditingSucursal] = useState<Sucursal | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [deletingSucursal, setDeletingSucursal] = useState<Sucursal | null>(null);

    const deleteMutation = useMutation({
        mutationFn: (id: number) => sucursalesApi.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: sucursalesKeys.lists() });
            addToast('Sucursal eliminada correctamente', 'success');
        },
        onError: (error) => {
            addToast(getApiErrorMessage(error, 'Error al eliminar la sucursal'), 'error');
        }
    });

    const handleOpenModal = (sucursal?: Sucursal) => {
        setEditingSucursal(sucursal || null);
        setIsModalOpen(true);
    };

    const handleCloseModal = () => {
        setIsModalOpen(false);
        setEditingSucursal(null);
    };

    const handleSubmit = async (data: CreateSucursalDto) => {
        setSubmitting(true);
        try {
            if (editingSucursal) {
                await sucursalesApi.update(editingSucursal.id, data);
                addToast('Sucursal actualizada correctamente', 'success');
            } else {
                await sucursalesApi.create(data);
                addToast('Sucursal creada correctamente', 'success');
            }
            handleCloseModal();
            queryClient.invalidateQueries({ queryKey: sucursalesKeys.lists() });
        } catch (error) {
            addToast(getApiErrorMessage(error, 'Error al guardar los datos'), 'error');
        } finally {
            setSubmitting(false);
        }
    };

    const confirmDelete = () => {
        if (deletingSucursal) {
            deleteMutation.mutate(deletingSucursal.id);
            setDeletingSucursal(null);
        }
    };

    return (
        <div className="page-container">
            <header className="page-header">
                <div className="header-info">
                    <h1>Sucursales</h1>
                    <p>Administración de puntos de venta y centros operativos.</p>
                </div>
                <Button variant="primary" onClick={() => handleOpenModal()}>
                    <Plus size={18} />
                    Nueva Sucursal
                </Button>
            </header>

            <div className="filters-bar glass">
                <div className="search-box">
                    <Search size={18} />
                    <input
                        type="text"
                        placeholder="Buscar sucursal por nombre..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            <div className="table-container">
                <table className="data-table">
                    <thead>
                        <tr>
                            <th>Sucursal</th>
                            <th>Concesionaria</th>
                            <th>Dirección</th>
                            <th>Contacto</th>
                            <th>Estado</th>
                            <th style={{ textAlign: 'right' }}>Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            [1, 2, 3].map(i => (
                                <tr key={i}>
                                    {Array.from({ length: 6 }).map((_, idx) => (
                                        <td key={idx} style={{ padding: '1.25rem 1rem' }}>
                                            <span className="skeleton skeleton-text" style={{ width: '70%' }} />
                                        </td>
                                    ))}
                                </tr>
                            ))
                        ) : error ? (
                            <tr><td colSpan={6} style={{ textAlign: 'center', padding: '3rem' }}>
                                <div style={{ color: 'var(--danger)', marginBottom: '1rem' }}>{getApiErrorMessage(error)}</div>
                                <Button variant="secondary" size="sm" onClick={() => queryClient.invalidateQueries({ queryKey: sucursalesKeys.lists() })}>Reintentar</Button>
                            </td></tr>
                        ) : (sucursales?.length || 0) === 0 ? (
                            <tr><td colSpan={6}>
                                <div className="dt-empty">
                                    <div className="dt-empty-badge"><Store size={36} /></div>
                                    <p className="dt-empty-text">No se encontraron sucursales.</p>
                                </div>
                            </td></tr>
                        ) : (
                            sucursales?.map((s) => (
                                <tr key={s.id}>
                                    <td>
                                        <div className="user-cell">
                                            <div className="user-avatar">
                                                <Store size={18} />
                                            </div>
                                            <div>
                                                <div className="brand">{s.nombre}</div>
                                                {s.ciudad && (
                                                    <div className="location-info">
                                                        <span>{s.ciudad}</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </td>
                                    <td>
                                        <span style={{ fontWeight: 500 }}>{s.concesionaria?.nombre || '-'}</span>
                                    </td>
                                    <td>
                                        <div className="contact-link">
                                            <MapPin size={14} />
                                            <span>{s.direccion || '-'}</span>
                                        </div>
                                    </td>
                                    <td>
                                        <div className="contact-link">
                                            <Phone size={14} />
                                            <span>{s.telefono || '-'}</span>
                                        </div>
                                    </td>
                                    <td>
                                        <div className={`status-badge ${s.activo ? 'active' : 'inactive'}`}>
                                            {s.activo ? <CheckCircle size={14} /> : <XCircle size={14} />}
                                            <span>{s.activo ? 'Activa' : 'Inactiva'}</span>
                                        </div>
                                    </td>
                                    <td style={{ textAlign: 'right' }}>
                                        <div className="action-buttons">
                                            <button className="icon-btn" onClick={() => handleOpenModal(s)} aria-label="Editar">
                                                <Edit size={16} />
                                            </button>
                                            <button className="icon-btn danger" onClick={() => setDeletingSucursal(s)} aria-label="Eliminar">
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            <Modal
                isOpen={isModalOpen}
                onClose={handleCloseModal}
                title={editingSucursal ? 'Editar Sucursal' : 'Nueva Sucursal'}
                subtitle="Configure los datos de la sucursal operativa."
                maxWidth="650px"
            >
                <SucursalForm
                    initialData={editingSucursal}
                    onSubmit={handleSubmit}
                    onCancel={handleCloseModal}
                    loading={submitting}
                />
            </Modal>

            <ConfirmDialog
                isOpen={!!deletingSucursal}
                title="Eliminar sucursal"
                message={deletingSucursal
                    ? `¿Eliminar la sucursal "${deletingSucursal.nombre}"? Esta acción no se puede deshacer.`
                    : ''}
                confirmLabel="Eliminar sucursal"
                cancelLabel="Cancelar"
                type="danger"
                onConfirm={confirmDelete}
                onCancel={() => setDeletingSucursal(null)}
                loading={deleteMutation.isPending}
            />

            <style>{`
                .page-container { display: flex; flex-direction: column; gap: 2rem; }
                .page-header { display: flex; justify-content: space-between; align-items: center; }
                .header-info h1 { font-size: var(--text-3xl); font-weight: 700; letter-spacing: -0.025em; color: var(--text-primary); }
                .header-info p { color: var(--text-secondary); margin-top: 0.25rem; font-size: var(--text-base); }

                .filters-bar { padding: var(--space-3); display: flex; gap: var(--space-4); }
                .search-box { flex: 1; }

                .user-cell { display: flex; align-items: center; gap: 1rem; }
                .user-avatar {
                    width: 40px; height: 40px;
                    border-radius: var(--radius-md);
                    background: var(--accent-gradient);
                    color: white;
                    display: flex; align-items: center; justify-content: center;
                    box-shadow: 0 4px 12px -4px rgba(var(--accent-rgb), 0.4);
                }
                .brand { font-weight: 600; font-size: var(--text-sm); color: var(--text-primary); }
                .location-info { font-size: var(--text-xs); color: var(--text-muted); margin-top: 2px; }
                .contact-link { display: flex; align-items: center; gap: 0.5rem; color: var(--text-secondary); font-size: var(--text-sm); }

                .status-badge {
                    display: inline-flex; align-items: center; gap: 0.4rem;
                    padding: 0.25rem 0.625rem; border-radius: var(--radius-pill);
                    font-size: var(--text-xs); font-weight: 600;
                    text-transform: uppercase; letter-spacing: 0.06em;
                    border: 1px solid transparent;
                }
                .status-badge.active {
                    background: rgba(var(--accent-rgb), 0.10);
                    color: var(--accent);
                    border-color: rgba(var(--accent-rgb), 0.20);
                }
                .status-badge.inactive {
                    background: rgba(239, 68, 68, 0.10);
                    color: var(--danger);
                    border-color: rgba(239, 68, 68, 0.20);
                }

                .action-buttons { display: flex; justify-content: flex-end; gap: 0.5rem; }
            `}</style>
        </div>
    );
};

export default SucursalesPage;
