import { useState } from 'react';
import { concesionariasApi } from '../../api/concesionarias.api';
import { useConcesionarias, concesionariasKeys } from '../../hooks/useConcesionarias';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Concesionaria, CreateConcesionariaDto } from '../../types/concesionaria.types';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import { Plus, Search, Building2, MapPin, Mail, Edit, Trash2, Calendar, Phone, Hash } from 'lucide-react';
import ConcesionariaForm from '../../components/forms/ConcesionariaForm';
import { useUIStore } from '../../store/uiStore';
import { getApiErrorMessage } from '../../utils/error';

const ConcesionariasPage = () => {
    const { addToast } = useUIStore();
    const queryClient = useQueryClient();
    const [searchTerm, setSearchTerm] = useState('');
    const { data, isLoading: loading, error } = useConcesionarias({ nombre: searchTerm });
    const concesionarias = data?.results || [];

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingConcesionaria, setEditingConcesionaria] = useState<Concesionaria | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [deletingConcesionaria, setDeletingConcesionaria] = useState<Concesionaria | null>(null);

    const deleteMutation = useMutation({
        mutationFn: (id: number) => concesionariasApi.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: concesionariasKeys.lists() });
            addToast('Concesionaria eliminada correctamente (soft delete)', 'success');
        },
        onError: (error) => {
            addToast(getApiErrorMessage(error, 'Error al eliminar la concesionaria'), 'error');
        }
    });

    const handleOpenModal = (concesionaria?: Concesionaria) => {
        setEditingConcesionaria(concesionaria || null);
        setIsModalOpen(true);
    };

    const handleCloseModal = () => {
        setIsModalOpen(false);
        setEditingConcesionaria(null);
    };

    const handleSubmit = async (data: CreateConcesionariaDto) => {
        setSubmitting(true);
        try {
            if (editingConcesionaria) {
                await concesionariasApi.update(editingConcesionaria.id, data);
                addToast('Concesionaria actualizada correctamente', 'success');
            } else {
                await concesionariasApi.create(data);
                addToast('Concesionaria creada correctamente', 'success');
            }
            handleCloseModal();
            queryClient.invalidateQueries({ queryKey: concesionariasKeys.lists() });
        } catch (error) {
            addToast(getApiErrorMessage(error, 'Error al guardar los datos'), 'error');
        } finally {
            setSubmitting(false);
        }
    };

    const confirmDelete = () => {
        if (deletingConcesionaria) {
            deleteMutation.mutate(deletingConcesionaria.id);
            setDeletingConcesionaria(null);
        }
    };

    return (
        <div className="page-container">
            <header className="page-header">
                <div className="header-info">
                    <h1>Concesionarias</h1>
                    <p>Administración global de los tenants de la plataforma.</p>
                </div>
                <Button variant="primary" onClick={() => handleOpenModal()}>
                    <Plus size={18} />
                    Nueva Concesionaria
                </Button>
            </header>

            <div className="filters-bar glass">
                <div className="search-box">
                    <Search size={18} />
                    <input
                        type="text"
                        placeholder="Buscar por nombre o CUIT..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            <div className="table-container">
                <table className="data-table">
                    <thead>
                        <tr>
                            <th>Nombre</th>
                            <th>CUIT</th>
                            <th>Contacto</th>
                            <th>Email</th>
                            <th>Fecha Registro</th>
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
                                <Button variant="secondary" size="sm" onClick={() => queryClient.invalidateQueries({ queryKey: concesionariasKeys.lists() })}>Reintentar</Button>
                            </td></tr>
                        ) : (concesionarias?.length || 0) === 0 ? (
                            <tr><td colSpan={6}>
                                <div className="dt-empty">
                                    <div className="dt-empty-badge"><Building2 size={36} /></div>
                                    <p className="dt-empty-text">No se encontraron concesionarias.</p>
                                    {!searchTerm && (
                                        <small style={{ color: 'var(--text-muted)' }}>
                                            Es posible que debas ejecutar el seed de la base de datos.
                                        </small>
                                    )}
                                </div>
                            </td></tr>
                        ) : (
                            concesionarias?.map((c) => (
                                <tr key={c.id}>
                                    <td>
                                        <div className="user-cell">
                                            <div className="user-avatar">
                                                <Building2 size={16} />
                                            </div>
                                            <div>
                                                <div className="brand">{c.nombre}</div>
                                                <div className="location-info">
                                                    <MapPin size={12} />
                                                    <span>{c.direccion || 'Sin dirección'}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </td>
                                    <td><div className="contact-link"><Hash size={14} /><span>{c.cuit || '-'}</span></div></td>
                                    <td><div className="contact-link"><Phone size={14} /><span>{c.telefono || '-'}</span></div></td>
                                    <td><div className="contact-link"><Mail size={14} /><span>{c.email || '-'}</span></div></td>
                                    <td><div className="contact-link"><Calendar size={14} /><span>{new Date(c.createdAt).toLocaleDateString()}</span></div></td>
                                    <td style={{ textAlign: 'right' }}>
                                        <div className="action-buttons">
                                            <button className="icon-btn" onClick={() => handleOpenModal(c)} aria-label="Editar">
                                                <Edit size={16} />
                                            </button>
                                            <button className="icon-btn danger" onClick={() => setDeletingConcesionaria(c)} aria-label="Eliminar">
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
                title={editingConcesionaria ? 'Editar Concesionaria' : 'Nueva Concesionaria'}
                subtitle={`Completa los datos para ${editingConcesionaria ? 'actualizar' : 'registrar'} la concesionaria.`}
                maxWidth="650px"
            >
                <ConcesionariaForm
                    key={editingConcesionaria?.id ?? 'new'}
                    initialData={editingConcesionaria}
                    onSubmit={handleSubmit}
                    onCancel={handleCloseModal}
                    loading={submitting}
                />
            </Modal>

            <ConfirmDialog
                isOpen={!!deletingConcesionaria}
                title="Eliminar concesionaria"
                message={deletingConcesionaria
                    ? `¿Eliminar "${deletingConcesionaria.nombre}"? Es un soft-delete: se desactiva pero no se borran los datos.`
                    : ''}
                confirmLabel="Eliminar concesionaria"
                cancelLabel="Cancelar"
                type="danger"
                onConfirm={confirmDelete}
                onCancel={() => setDeletingConcesionaria(null)}
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
                .location-info { display: flex; align-items: center; gap: 0.375rem; color: var(--text-muted); font-size: var(--text-xs); margin-top: 2px; }
                .contact-link { display: flex; align-items: center; gap: 0.5rem; color: var(--text-secondary); font-size: var(--text-sm); }
                .action-buttons { display: flex; justify-content: flex-end; gap: 0.5rem; }
            `}</style>
        </div>
    );
};

export default ConcesionariasPage;
