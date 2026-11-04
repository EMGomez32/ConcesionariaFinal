import React, { useState, useMemo } from 'react';
import { Users, Edit, Trash2, UserPlus, Key, Lock, ShieldOff } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { usuariosApi } from '../../api/usuarios.api';
import { mfaApi } from '../../api/mfa.api';
import { concesionariasApi } from '../../api/concesionarias.api';
import type { Usuario, CreateUsuarioDto, UpdateUsuarioDto } from '../../types/usuario.types';
import type { Concesionaria } from '../../types/concesionaria.types';
import { useAuthStore } from '../../store/authStore';
import { useUIStore } from '../../store/uiStore';
import { getApiErrorMessage } from '../../utils/error';
import UsuarioForm from '../../components/forms/UsuarioForm';
import Input from '../../components/ui/Input';
import Badge from '../../components/ui/Badge';
import PageTitle from '../../components/ui/PageTitle';
import { Listado, ListadoTabla, BusquedaListado, type ColumnaListado } from '../../components/listado';
import { rolLabel } from '../../api/roles.api';
import { useDebounce } from '../../hooks/useDebounce';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import ConfirmDialog from '../../components/ui/ConfirmDialog';

const UsuariosPage: React.FC = () => {
    const { addToast } = useUIStore();
    const queryClient = useQueryClient();
    const isSuperAdmin = useAuthStore((s) => s.user?.roles.includes('super_admin') ?? false);

    // Cupo de usuarios del tenant (sólo aplica al admin; el super_admin no está
    // topeado y elige la concesionaria destino en el propio form). El candado real
    // es el backend (409 USER_LIMIT_REACHED); esto es feedback de UX.
    const { data: miConcesionaria } = useQuery({
        queryKey: ['mi-concesionaria-cupo'],
        queryFn: () => concesionariasApi.getMine() as Promise<Concesionaria>,
        enabled: !isSuperAdmin,
        staleTime: 30_000,
    });
    const limiteUsuarios = miConcesionaria?.limiteUsuarios ?? null;
    const usuariosActivos = miConcesionaria?.usuariosActivos ?? null;
    const cupoLleno =
        !isSuperAdmin &&
        limiteUsuarios != null &&
        usuariosActivos != null &&
        usuariosActivos >= limiteUsuarios;

    const [searchTerm, setSearchTerm] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingUsuario, setEditingUsuario] = useState<Usuario | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [resetPasswordUserId, setResetPasswordUserId] = useState<number | null>(null);
    const [newPassword, setNewPassword] = useState('');
    const [resettingPassword, setResettingPassword] = useState(false);
    const [deletingUsuario, setDeletingUsuario] = useState<Usuario | null>(null);
    // Reset del 2FA de un usuario que perdió el dispositivo (admin).
    const [reseteando2fa, setReseteando2fa] = useState<Usuario | null>(null);
    const [enviando2fa, setEnviando2fa] = useState(false);

    const debouncedSearch = useDebounce(searchTerm, 300);
    const { data: response, isLoading: loading, isError: error, refetch } = useQuery({
        queryKey: ['usuarios', debouncedSearch],
        queryFn: async () => {
            const filters = debouncedSearch ? { nombre: debouncedSearch } : {};
            const res = await usuariosApi.getAll(filters) as { results?: Usuario[]; total?: number; page?: number; limit?: number };
            return res || { results: [], total: 0, page: 1, limit: 10 };
        }
    });

    const usuarios = useMemo(() => response?.results || [], [response]);

    const deleteMutation = useMutation({
        mutationFn: (id: number) => usuariosApi.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['usuarios'] });
            queryClient.invalidateQueries({ queryKey: ['mi-concesionaria-cupo'] });
            addToast('Usuario eliminado', 'success');
        },
        onError: (error) => {
            addToast(getApiErrorMessage(error, 'No se pudo eliminar el usuario'), 'error');
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
                addToast('Usuario actualizado', 'success');
            } else {
                await usuariosApi.create(data as CreateUsuarioDto);
                addToast('Usuario creado', 'success');
            }
            handleCloseModal();
            queryClient.invalidateQueries({ queryKey: ['usuarios'] });
            queryClient.invalidateQueries({ queryKey: ['mi-concesionaria-cupo'] });
        } catch (error) {
            addToast(getApiErrorMessage(error, 'No se pudieron guardar los datos'), 'error');
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
            addToast('Escribí la nueva contraseña', 'error');
            return;
        }
        setResettingPassword(true);
        try {
            await usuariosApi.resetPassword(resetPasswordUserId, newPassword);
            addToast('Contraseña actualizada', 'success');
            closeResetPasswordModal();
        } catch (error) {
            addToast(getApiErrorMessage(error, 'No se pudo cambiar la contraseña'), 'error');
        } finally {
            setResettingPassword(false);
        }
    };

    const columnas: ColumnaListado<Usuario>[] = [
        {
            clave: 'usuario',
            titulo: 'Usuario',
            flexible: true,
            tarjeta: 'titulo',
            celda: (usuario) => (
                <div className="user-cell">
                    <div className="user-avatar" aria-hidden="true">
                        {usuario.nombre.charAt(0).toUpperCase()}
                    </div>
                    <div className="user-info" style={{ minWidth: 0 }}>
                        <span className="listado-principal">{usuario.nombre}</span>
                        <a href={`mailto:${usuario.email}`} className="listado-secundario contact-link">{usuario.email}</a>
                        {isSuperAdmin && usuario.concesionaria && (
                            <span className="listado-secundario">{usuario.concesionaria.nombre}</span>
                        )}
                    </div>
                </div>
            ),
        },
        {
            clave: 'sucursal',
            titulo: 'Sucursal',
            celda: (usuario) => <span className="listado-nowrap">{usuario.sucursal?.nombre ?? 'Sin sucursal'}</span>,
        },
        {
            clave: 'roles',
            titulo: 'Rol',
            celda: (usuario) => (
                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                    {usuario.roles && usuario.roles.length > 0 ? (
                        usuario.roles.map((rol) => (
                            <Badge key={rol.rol.id} variant="success">{rolLabel(rol.rol.nombre)}</Badge>
                        ))
                    ) : (
                        <span className="text-muted">Sin rol</span>
                    )}
                </div>
            ),
        },
        {
            clave: 'estado',
            titulo: 'Estado',
            celda: (usuario) => <Badge variant={usuario.activo ? 'success' : 'danger'}>{usuario.activo ? 'Activo' : 'Inactivo'}</Badge>,
        },
        {
            clave: 'acciones',
            titulo: 'Acciones',
            alinear: 'right',
            ancho: '1%',
            tarjeta: 'acciones',
            celda: (usuario) => (
                <div className="listado-acciones-fila">
                    <button
                        type="button"
                        onClick={() => { setResetPasswordUserId(usuario.id); setNewPassword(''); }}
                        className="icon-btn"
                        title="Cambiar contraseña"
                        aria-label={`Cambiar la contraseña de ${usuario.nombre}`}
                    >
                        <Key size={14} aria-hidden="true" />
                    </button>
                    <button
                        type="button"
                        onClick={() => setReseteando2fa(usuario)}
                        className="icon-btn"
                        title="Resetear la verificación en dos pasos (2FA)"
                        aria-label={`Resetear la verificación en dos pasos de ${usuario.nombre}`}
                    >
                        <ShieldOff size={14} aria-hidden="true" />
                    </button>
                    <button
                        type="button"
                        onClick={() => handleOpenModal(usuario)}
                        className="icon-btn"
                        title="Editar"
                        aria-label={`Editar a ${usuario.nombre}`}
                    >
                        <Edit size={14} aria-hidden="true" />
                    </button>
                    <button
                        type="button"
                        onClick={() => setDeletingUsuario(usuario)}
                        className="icon-btn danger"
                        title="Eliminar"
                        aria-label={`Eliminar a ${usuario.nombre}`}
                    >
                        <Trash2 size={14} aria-hidden="true" />
                    </button>
                </div>
            ),
        },
    ];

    const nuevoUsuario = (
        <Button
            variant="primary"
            onClick={() => handleOpenModal()}
            disabled={cupoLleno}
            title={cupoLleno ? 'Alcanzaste el límite de usuarios de tu concesionaria' : undefined}
        >
            <UserPlus size={18} aria-hidden="true" />
            Nuevo usuario
        </Button>
    );

    return (
        <div className="page-container animate-fade-in">
            <PageTitle title="Usuarios" />
            <Listado
                titulo="Usuarios"
                subtitulo="Las personas que usan AUTENZA en tu concesionaria y su rol"
                icono={<Users size={22} />}
                acciones={!isSuperAdmin && usuariosActivos != null ? (
                    <span className={`cupo-chip ${cupoLleno ? 'is-full' : ''}`} title="Usuarios activos sobre el máximo de tu plan">
                        <Users size={14} aria-hidden="true" />
                        {limiteUsuarios != null
                            ? `${usuariosActivos} de ${limiteUsuarios} usuarios`
                            : `${usuariosActivos} usuarios · sin límite`}
                    </span>
                ) : undefined}
                accionPrincipal={nuevoUsuario}
                busqueda={<BusquedaListado valor={searchTerm} onChange={setSearchTerm} placeholder="Buscar por nombre o email" etiqueta="Buscar usuarios" />}
            >
                {cupoLleno && (
                    <div className="cupo-aviso" role="status">
                        Alcanzaste el límite de {limiteUsuarios} usuarios de tu concesionaria. Para sumar más, contactá a la administración de la plataforma o dá de baja un usuario existente.
                    </div>
                )}

                <ListadoTabla
                    etiqueta="Usuarios"
                    columnas={columnas}
                    filas={usuarios}
                    cargando={loading}
                    filasCargando={4}
                    error={error}
                    mensajeError="No se pudieron cargar los usuarios"
                    onReintentar={() => refetch()}
                    hayFiltros={!!debouncedSearch}
                    onLimpiarFiltros={() => setSearchTerm('')}
                    vacio={{
                        titulo: 'Todavía no hay usuarios',
                        descripcion: 'Sumá a tu equipo y elegí el rol de cada persona.',
                        icono: <Users size={32} aria-hidden="true" />,
                        accion: nuevoUsuario,
                    }}
                />
            </Listado>

            <Modal
                isOpen={isModalOpen}
                onClose={handleCloseModal}
                title={editingUsuario ? 'Editar usuario' : 'Nuevo usuario'}
                subtitle={editingUsuario ? 'Cambiá los datos o el rol de la persona.' : 'Completá los datos de la persona y elegí su rol.'}
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
                            Guardar
                        </Button>
                    </div>
                }
            >
                <Input
                    label="Nueva contraseña"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Mínimo 10 caracteres"
                    icon={<Lock size={16} />}
                />
            </Modal>

            <ConfirmDialog
                isOpen={!!reseteando2fa}
                title="Resetear verificación en dos pasos"
                message={reseteando2fa
                    ? `¿Resetear el 2FA de "${reseteando2fa.nombre}"? Se le apaga el segundo factor, se borran sus códigos de recuperación y se cierran todas sus sesiones. Usalo cuando perdió el teléfono.`
                    : ''}
                confirmLabel="Resetear 2FA"
                cancelLabel="Cancelar"
                type="danger"
                onConfirm={async () => {
                    if (!reseteando2fa) return;
                    setEnviando2fa(true);
                    try {
                        await mfaApi.resetDeUsuario(reseteando2fa.id);
                        addToast('2FA reseteado. El usuario deberá volver a iniciar sesión.', 'success');
                        setReseteando2fa(null);
                    } catch (err) {
                        addToast(getApiErrorMessage(err, 'No se pudo resetear el 2FA'), 'error');
                    } finally {
                        setEnviando2fa(false);
                    }
                }}
                onCancel={() => setReseteando2fa(null)}
                loading={enviando2fa}
            />

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
                .cupo-chip {
                    display: inline-flex;
                    align-items: center;
                    gap: 0.4rem;
                    padding: 0.4rem 0.75rem;
                    border-radius: var(--radius-pill);
                    background: var(--bg-secondary);
                    border: 1px solid var(--border);
                    color: var(--text-secondary);
                    font-size: var(--text-xs);
                    font-weight: 600;
                    font-variant-numeric: tabular-nums;
                    white-space: nowrap;
                }
                .cupo-chip.is-full {
                    background: rgba(var(--danger-rgb), 0.10);
                    border-color: rgba(var(--danger-rgb), 0.30);
                    color: var(--danger);
                }
                .cupo-aviso {
                    padding: 0.75rem 1rem;
                    border-radius: var(--radius-md);
                    background: rgba(var(--danger-rgb), 0.08);
                    border: 1px solid rgba(var(--danger-rgb), 0.22);
                    color: var(--danger);
                    font-size: var(--text-sm);
                }
                .user-cell { display: flex; align-items: center; gap: 0.75rem; min-width: 0; }
                .user-avatar {
                    width: 34px; height: 34px; flex-shrink: 0;
                    border-radius: var(--radius-md);
                    background: var(--accent-gradient);
                    /* Tinta sobre acento: el blanco no llega al contraste mínimo. */
                    color: var(--text-on-accent);
                    display: flex; align-items: center; justify-content: center;
                    font-family: var(--font-display);
                    font-weight: 600;
                    font-size: var(--text-md);
                }
                .user-info { display: flex; flex-direction: column; gap: 1px; }
                .contact-link { text-decoration: none; }
                .contact-link:hover { color: var(--accent); }
            `}</style>
        </div>
    );
};

export default UsuariosPage;
