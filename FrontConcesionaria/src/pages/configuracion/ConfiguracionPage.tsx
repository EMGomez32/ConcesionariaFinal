import { useEffect, useState } from 'react';
import { Building2, User as UserIcon, Lock, Save, RefreshCw } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useUIStore } from '../../store/uiStore';
import { concesionariasApi } from '../../api/concesionarias.api';
import { usuariosApi } from '../../api/usuarios.api';
import Button from '../../components/ui/Button';
import type { Concesionaria } from '../../types/concesionaria.types';
import { getApiErrorMessage } from '../../utils/error';

type Tab = 'concesionaria' | 'perfil' | 'password';

const ConfiguracionPage = () => {
    const { user, setUser } = useAuthStore();
    const { addToast } = useUIStore();

    const [tab, setTab] = useState<Tab>('concesionaria');

    // Concesionaria state
    const [concesionaria, setConcesionaria] = useState<Concesionaria | null>(null);
    const [concesionariaLoading, setConcesionariaLoading] = useState(false);
    const [concesionariaForm, setConcesionariaForm] = useState({
        nombre: '', cuit: '', email: '', telefono: '', direccion: '',
    });
    const [savingConcesionaria, setSavingConcesionaria] = useState(false);

    // Perfil state
    const [perfilForm, setPerfilForm] = useState({
        nombre: user?.nombre || '',
        email: user?.email || '',
    });
    const [savingPerfil, setSavingPerfil] = useState(false);

    // Password state
    const [passForm, setPassForm] = useState({ current: '', password: '', confirm: '' });
    const [savingPass, setSavingPass] = useState(false);

    const isAdmin = user?.roles?.includes('super_admin') || user?.roles?.includes('admin');
    const concesionariaId = user?.concesionariaId;

    useEffect(() => {
        if (!concesionariaId) return;
        setConcesionariaLoading(true);
        // `/concesionarias/me`: la concesionaria sale del token, no de un id
        // arbitrario. Cualquier usuario del tenant puede leerla.
        concesionariasApi.getMine()
            .then((res: unknown) => {
                const data = res as Concesionaria | undefined;
                if (data && 'id' in data) {
                    setConcesionaria(data);
                    setConcesionariaForm({
                        nombre: data.nombre || '',
                        cuit: data.cuit || '',
                        email: data.email || '',
                        telefono: data.telefono || '',
                        direccion: data.direccion || '',
                    });
                }
            })
            .catch(() => addToast('Error al cargar la concesionaria', 'error'))
            .finally(() => setConcesionariaLoading(false));
    }, [concesionariaId, addToast]);

    useEffect(() => {
        setPerfilForm({ nombre: user?.nombre || '', email: user?.email || '' });
    }, [user?.nombre, user?.email]);

    const handleSaveConcesionaria = async () => {
        if (!concesionariaForm.nombre.trim()) {
            addToast('El nombre es requerido', 'error');
            return;
        }
        setSavingConcesionaria(true);
        try {
            await concesionariasApi.updateMine({
                nombre: concesionariaForm.nombre.trim(),
                cuit: concesionariaForm.cuit.trim(),
                email: concesionariaForm.email.trim(),
                telefono: concesionariaForm.telefono.trim(),
                direccion: concesionariaForm.direccion.trim(),
            });
            addToast('Concesionaria actualizada', 'success');
        } catch (err) {
            addToast(getApiErrorMessage(err, 'Error al actualizar la concesionaria'), 'error');
        } finally {
            setSavingConcesionaria(false);
        }
    };

    const handleSavePerfil = async () => {
        if (!perfilForm.nombre.trim() || !perfilForm.email.trim()) {
            addToast('Nombre y email son requeridos', 'error');
            return;
        }
        setSavingPerfil(true);
        try {
            await usuariosApi.updateMe({
                nombre: perfilForm.nombre.trim(),
                email: perfilForm.email.trim(),
            });
            setUser({ nombre: perfilForm.nombre.trim(), email: perfilForm.email.trim() });
            addToast('Perfil actualizado', 'success');
        } catch (err) {
            addToast(getApiErrorMessage(err, 'Error al actualizar el perfil'), 'error');
        } finally {
            setSavingPerfil(false);
        }
    };

    const handleSavePassword = async () => {
        if (!passForm.current) {
            addToast('Ingresá tu contraseña actual', 'error');
            return;
        }
        if (passForm.password.length < 6) {
            addToast('La nueva contraseña debe tener al menos 6 caracteres', 'error');
            return;
        }
        if (passForm.password !== passForm.confirm) {
            addToast('Las contraseñas no coinciden', 'error');
            return;
        }
        setSavingPass(true);
        try {
            await usuariosApi.changeMyPassword(passForm.current, passForm.password);
            addToast('Contraseña actualizada con éxito', 'success');
            setPassForm({ current: '', password: '', confirm: '' });
        } catch (err) {
            addToast(getApiErrorMessage(err, 'Error al actualizar la contraseña'), 'error');
        } finally {
            setSavingPass(false);
        }
    };

    return (
        <div className="page-container animate-fade-in" style={{ maxWidth: '900px' }}>
            <header className="page-header">
                <div className="header-title">
                    <h1>Configuración</h1>
                    <p>Administrá tu concesionaria, tu perfil y la seguridad de tu cuenta.</p>
                </div>
            </header>

            <div className="segmented" style={{ marginBottom: '0.5rem' }}>
                <button className={`segmented-btn ${tab === 'concesionaria' ? 'is-active' : ''}`} onClick={() => setTab('concesionaria')}>
                    <Building2 size={16} /> Mi concesionaria
                </button>
                <button className={`segmented-btn ${tab === 'perfil' ? 'is-active' : ''}`} onClick={() => setTab('perfil')}>
                    <UserIcon size={16} /> Mi perfil
                </button>
                <button className={`segmented-btn ${tab === 'password' ? 'is-active' : ''}`} onClick={() => setTab('password')}>
                    <Lock size={16} /> Cambiar contraseña
                </button>
            </div>

            {tab === 'concesionaria' && (
                <div className="card">
                    {concesionariaLoading ? (
                        <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                            <RefreshCw size={20} className="animate-spin" style={{ display: 'inline-block', marginRight: '0.5rem' }} /> Cargando...
                        </div>
                    ) : !concesionariaId ? (
                        <p style={{ color: 'var(--text-muted)' }}>No estás asociado a ninguna concesionaria.</p>
                    ) : !concesionaria ? (
                        <p style={{ color: 'var(--text-muted)' }}>No se pudo cargar la concesionaria.</p>
                    ) : (
                        <>
                            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <Building2 size={18} /> Datos de la concesionaria
                                {!isAdmin && <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 500 }}>(solo lectura)</span>}
                            </h2>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                <div className="form-group">
                                    <label className="form-label-xs">Nombre *</label>
                                    <input type="text" className="form-input" value={concesionariaForm.nombre} disabled={!isAdmin}
                                        onChange={e => setConcesionariaForm(f => ({ ...f, nombre: e.target.value }))} />
                                </div>
                                <div className="form-group">
                                    <label className="form-label-xs">CUIT</label>
                                    <input type="text" className="form-input" value={concesionariaForm.cuit} disabled={!isAdmin}
                                        onChange={e => setConcesionariaForm(f => ({ ...f, cuit: e.target.value }))} />
                                </div>
                                <div className="form-group">
                                    <label className="form-label-xs">Email</label>
                                    <input type="email" className="form-input" value={concesionariaForm.email} disabled={!isAdmin}
                                        onChange={e => setConcesionariaForm(f => ({ ...f, email: e.target.value }))} />
                                </div>
                                <div className="form-group">
                                    <label className="form-label-xs">Teléfono</label>
                                    <input type="text" className="form-input" value={concesionariaForm.telefono} disabled={!isAdmin}
                                        onChange={e => setConcesionariaForm(f => ({ ...f, telefono: e.target.value }))} />
                                </div>
                                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                                    <label className="form-label-xs">Dirección</label>
                                    <input type="text" className="form-input" value={concesionariaForm.direccion} disabled={!isAdmin}
                                        onChange={e => setConcesionariaForm(f => ({ ...f, direccion: e.target.value }))} />
                                </div>
                            </div>
                            {isAdmin && (
                                <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end' }}>
                                    <Button variant="primary" onClick={handleSaveConcesionaria} disabled={savingConcesionaria}>
                                        <Save size={16} /> {savingConcesionaria ? 'Guardando...' : 'Guardar cambios'}
                                    </Button>
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}

            {tab === 'perfil' && (
                <div className="card">
                    <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <UserIcon size={18} /> Mi perfil
                    </h2>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        <div className="form-group">
                            <label className="form-label-xs">Nombre *</label>
                            <input type="text" className="form-input" value={perfilForm.nombre}
                                onChange={e => setPerfilForm(f => ({ ...f, nombre: e.target.value }))} />
                        </div>
                        <div className="form-group">
                            <label className="form-label-xs">Email *</label>
                            <input type="email" className="form-input" value={perfilForm.email}
                                onChange={e => setPerfilForm(f => ({ ...f, email: e.target.value }))} />
                        </div>
                    </div>
                    <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end' }}>
                        <Button variant="primary" onClick={handleSavePerfil} disabled={savingPerfil}>
                            <Save size={16} /> {savingPerfil ? 'Guardando...' : 'Guardar cambios'}
                        </Button>
                    </div>
                </div>
            )}

            {tab === 'password' && (
                <div className="card">
                    <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Lock size={18} /> Cambiar contraseña
                    </h2>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                            <label className="form-label-xs">Contraseña actual *</label>
                            <input type="password" className="form-input" value={passForm.current} autoComplete="current-password"
                                onChange={e => setPassForm(f => ({ ...f, current: e.target.value }))}
                                placeholder="Tu contraseña actual" />
                        </div>
                        <div className="form-group">
                            <label className="form-label-xs">Nueva contraseña *</label>
                            <input type="password" className="form-input" value={passForm.password} autoComplete="new-password"
                                onChange={e => setPassForm(f => ({ ...f, password: e.target.value }))}
                                placeholder="Mínimo 6 caracteres" />
                        </div>
                        <div className="form-group">
                            <label className="form-label-xs">Confirmar nueva contraseña *</label>
                            <input type="password" className="form-input" value={passForm.confirm} autoComplete="new-password"
                                onChange={e => setPassForm(f => ({ ...f, confirm: e.target.value }))} />
                        </div>
                    </div>
                    <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end' }}>
                        <Button variant="primary" onClick={handleSavePassword} disabled={savingPass}>
                            <Lock size={16} /> {savingPass ? 'Guardando...' : 'Cambiar contraseña'}
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ConfiguracionPage;
