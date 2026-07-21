import React, { useState, useMemo } from 'react';
import {
    Users,
    Search,
    Edit,
    Trash2,
    UserPlus,
    Key,
    Lock,
    Building2,
    Mail,
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { usuariosApi } from '../../api/usuarios.api';
import type { Usuario, CreateUsuarioDto, UpdateUsuarioDto } from '../../types/usuario.types';
import { useUIStore } from '../../store/uiStore';
import { getApiErrorMessage } from '../../utils/error';
import UsuarioForm from '../../components/forms/UsuarioForm';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import ConfirmDialog from '../../components/ui/ConfirmDialog';

const UsuariosPage: React.FC = () => {
    const { addToast } = useUIStore();
    const queryClient = useQueryClient();

    const [searchTerm, setSearchTerm] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingUsuario, setEditingUsuario] = useState<Usuario | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [resetPasswordUserId, setResetPasswordUserId] = useState<number | null>(null);
    const [newPassword, setNewPassword] = useState('');
    const [resettingPassword, setResettingPassword] = useState(false);
    const [deletingUsuario, setDeletingUsuario] = useState<Usuario | null>(null);

    const { data: response, isLoading: loading, isError: error } = useQuery({
        queryKey: ['usuarios', searchTerm],
        queryFn: async () => {
            const filters = searchTerm ? { nombre: searchTerm } : {};
            const res = await usuariosApi.getAll(filters) as { results?: Usuario[]; total?: number; page?: number; limit?: number };
            return res || { results: [], total: 0, page: 1, limit: 10 };
        }
    });

    const usuarios = useMemo(() => response?.results || [], [response]);

    const deleteMutation = useMutation({
        mutationFn: (id: number) => usuariosApi.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['usuarios'] });
            addToast('Usuario eliminado correctamente', 'success');
        },
        onError: (error) => {
            addToast(getApiErrorMessage(error, 'Error al eliminar el usuario'), 'error');
        }
    });

    const handleOpenModal = (usuario?: Usuario) => {
        setEditingUsuario(usuario || null);
        setIsModalOpen(true);
    };

    const handleCloseModal = () => {
        setIsModalOpen(false);
        setEditingUsuario(null);
    };

    const handleSubmit = async (data: CreateUsuarioDto | UpdateUsuarioDto) => {
        setSubmitting(true);
        try {
            if (editingUsuario) {
                await usuariosApi.update(editingUsuario.id, data);
                addToast('Usuario actualizado correctamente', 'success');
            } else {
                await usuariosApi.create(data as CreateUsuarioDto);
                addToast('Usuario creado correctamente', 'success');
            }
            handleCloseModal();
            queryClient.invalidateQueries({ queryKey: ['usuarios'] });
        } catch (error) {
            addToast(getApiErrorMessage(error, 'Error al guardar los datos'), 'error');
        } finally {
            setSubmitting(false);
        }
    };

    const confirmDelete = () => {
        if (deletingUsuario) {
            deleteMutation.mutate(deletingUsuario.id);
            setDeletingUsuario(null);
        }
    };

    const closeResetPasswordModal = () => {
        setResetPasswordUserId(null);
        setNewPassword('');
    };

    const handleResetPassword = async () => {
        if (!resetPasswordUserId || !newPassword.trim()) {
            addToast('Debe ingresar una nueva contraseña', 'error');
            return;
        }
        setResettingPassword(true);
        try {
            await usuariosApi.resetPassword(resetPasswordUserId, newPassword);
            addToast('Contraseña actualizada correctamente', 'success');
            closeResetPasswordModal();
        } catch (error) {
            addToast(getApiErrorMessage(error, 'Error al actualizar la contraseña'), 'error');
        } finally {
            setResettingPassword(false);
        }
    };

    if (error) {
        return (
            <div className="page-container">
                <div className="dt-empty">
                    <p className="dt-empty-text">Error al cargar los usuarios</p>
                </div>
            </div>
        );
    }

    return (
        <div className="page-container">
            <div className="page-header">
                <div className="page-title">
                    <Users size={28} />
                    <div>
                        <h1>Usuarios</h1>
                        <p>Gestión de usuarios del sistema</p>
                    </div>
                </div>
                <Button variant="primary" onClick={() => handleOpenModal()}>
                    <UserPlus size={18} />
                    Nuevo Usuario
                </Button>
            </div>

            <div className="filters-bar glass">
                <div className="input-container has-icon" style={{ maxWidth: 400, flex: 1 }}>
                    <span className="input-icon" aria-hidden="true"><Search size={16} /></span>
                    <input
                        type="text"
                        className="input-control"
                        placeholder="Buscar por nombre o email..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            {loading ? (
                <div className="table-container">
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Usuario</th>
                                <th>Email</th>
                                <th>Sucursal</th>
                                <th>Roles</th>
                                <th>Estado</th>
                                <th>Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {[1, 2, 3].map(i => (
                                <tr key={i}>
                                    {Array.from({ length: 6 }).map((_, idx) => (
                                        <td key={idx} style={{ padding: '1.25rem 1rem' }}>
                                            <span className="skeleton skeleton-text" style={{ width: '70%' }} />
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : usuarios.length === 0 ? (
                <div className="table-container">
                    <div className="dt-empty">
                        <div className="dt-empty-badge"><Users size={36} /></div>
                        <p className="dt-empty-text">No se encontraron usuarios.</p>
                    </div>
                </div>
            ) : (
                <div className="table-container">
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Usuario</th>
                                <th>Email</th>
                                <th>Sucursal</th>
                                <th>Roles</th>
                                <th>Estado</th>
                                <th>Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {usuarios.map((usuario: Usuario) => (
                                <tr key={usuario.id}>
                                    <td>
                                        <div className="user-cell">
                                            <div className="user-avatar">
                                                {usuario.nombre.charAt(0).toUpperCase()}
                                            </div>
                                            <div className="user-info">
                                                <div className="user-name">{usuario.nombre}</div>
                                                {usuario.concesionaria && (
                                                    <div className="user-location">
                                                        <Building2 size={12} />
                                                        {usuario.concesionaria.nombre}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </td>
                                    <td>
                                        <a href={`mailto:${usuario.email}`} className="contact-link">
                                            <Mail size={14} />
                                            {usuario.email}
                                        </a>
                                    </td>
                                    <td>{usuario.sucursal?.nombre || '-'}</td>
                                    <td>
                                        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                                            {usuario.roles && usuario.roles.length > 0 ? (
                                                usuario.roles.map((rol) => (
                                                    <span key={rol.rol.id} className="badge badge-emerald">
                                                        {rol.rol.nombre}
                                                    </span>
                                                ))
                                            ) : (
                                                <span style={{ color: 'var(--text-muted)' }}>Sin roles</span>
                                            )}
                                        </div>
                                    </td>
                                    <td>
                                        <span className={`badge ${usuario.activo ? 'badge-emerald' : 'badge-danger'}`}>
                                            {usuario.activo ? 'Activo' : 'Inactivo'}
                                        </span>
                                    </td>
                                    <td>
                                        <div className="action-buttons">
                                            <button
                                                onClick={() => { setResetPasswordUserId(usuario.id); setNewPassword(''); }}
                                                className="icon-btn"
                                                title="Cambiar contraseña"
                                                aria-label="Cambiar contraseña"
                                            >
                                                <Key size={16} />
                                            </button>
                                            <button
                                                onClick={() => handleOpenModal(usuario)}
                                                className="icon-btn"
                                                title="Editar"
                                                aria-label="Editar"
                                            >
                                                <Edit size={16} />
                                            </button>
                                            <button
                                                onClick={() => setDeletingUsuario(usuario)}
                                                className="icon-btn danger"
                                                title="Eliminar"
                                                aria-label="Eliminar"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            <Modal
                isOpen={isModalOpen}
                onClose={handleCloseModal}
                title={editingUsuario ? 'Editar Usuario' : 'Nuevo Usuario'}
                subtitle={`Completa los datos para ${editingUsuario ? 'actualizar' : 'registrar'} el usuario.`}
                maxWidth="650px"
            >
                <UsuarioForm
                    usuario={editingUsuario || undefined}
                    onSave={handleSubmit}
                    onCancel={handleCloseModal}
                    loading={submitting}
                />
            </Modal>

            <Modal
                isOpen={resetPasswordUserId !== null}
                onClose={closeResetPasswordModal}
                title="Cambiar contraseña"
                subtitle="Ingresá la nueva contraseña para el usuario."
                maxWidth="450px"
                footer={
                    <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', width: '100%' }}>
                        <Button variant="secondary" onClick={closeResetPasswordModal}>Cancelar</Button>
                        <Button variant="primary" onClick={handleResetPassword} loading={resettingPassword}>
                            Actualizar
                        </Button>
                    </div>
                }
            >
                <Input
                    label="Nueva contraseña"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Mínimo 6 caracteres"
                    icon={<Lock size={16} />}
                />
            </Modal>

            <ConfirmDialog
                isOpen={!!deletingUsuario}
                title="Eliminar usuario"
                message={deletingUsuario
                    ? `¿Eliminar al usuario "${deletingUsuario.nombre}"? Esta acción no se puede deshacer.`
                    : ''}
                confirmLabel="Eliminar usuario"
                cancelLabel="Cancelar"
                type="danger"
                onConfirm={confirmDelete}
                onCancel={() => setDeletingUsuario(null)}
                loading={deleteMutation.isPending}
            />

            <style>{`
                .page-container {
                    padding: 2rem 0;
                    max-width: 1400px;
                    margin: 0 auto;
                    display: flex;
                    flex-direction: column;
                    gap: 1.5rem;
                }

                .page-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }

                .page-title {
                    display: flex;
                    align-items: center;
                    gap: 0.875rem;
                    color: var(--text-primary);
                }

                .page-title svg {
                    color: var(--accent);
                }

                .page-title h1 {
                    font-family: var(--font-display);
                    font-size: var(--text-3xl);
                    font-weight: 700;
                    margin: 0;
                    letter-spacing: -0.025em;
                }

                .page-title p {
                    margin: 0;
                    color: var(--text-secondary);
                    font-size: var(--text-sm);
                }

                .filters-bar {
                    padding: var(--space-3);
                    display: flex;
                    gap: var(--space-4);
                    align-items: center;
                }

                .user-cell { display: flex; align-items: center; gap: 0.875rem; }
                .user-avatar {
                    width: 38px; height: 38px;
                    border-radius: var(--radius-md);
                    background: var(--accent-gradient);
                    color: white;
                    display: flex; align-items: center; justify-content: center;
                    font-family: var(--font-display);
                    font-weight: 600;
                    font-size: var(--text-md);
                    box-shadow: 0 4px 12px -4px rgba(var(--accent-rgb), 0.4);
                }
                .user-info { display: flex; flex-direction: column; gap: 2px; }
                .user-name { font-weight: 600; color: var(--text-primary); font-size: var(--text-sm); }
                .user-location {
                    display: flex; align-items: center; gap: 0.35rem;
                    color: var(--text-muted);
                    font-size: var(--text-xs);
                }

                .contact-link {
                    display: inline-flex;
                    align-items: center;
                    gap: 0.5rem;
                    color: var(--text-secondary);
                    text-decoration: none;
                    font-size: var(--text-sm);
                    transition: color var(--duration-base) var(--easing-soft);
                }
                .contact-link:hover { color: var(--accent); }

                .action-buttons { display: flex; gap: 0.4rem; }
            `}</style>
        </div>
    );
};

export default UsuariosPage;
