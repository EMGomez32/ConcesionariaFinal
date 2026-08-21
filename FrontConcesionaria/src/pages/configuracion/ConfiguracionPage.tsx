import { useEffect, useState } from 'react';
import { Building2, User as UserIcon, Lock, Save, RefreshCw, Palette, Trash2, Image as ImageIcon, Sparkles, PlayCircle, Receipt } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { useUIStore } from '../../store/uiStore';
import { useTour } from '../../onboarding/useTour';
import { useTourStore } from '../../store/tourStore';
import { concesionariasApi } from '../../api/concesionarias.api';
import { usuariosApi } from '../../api/usuarios.api';
import Button from '../../components/ui/Button';
import { FileUploader } from '../../components/ui/FileUploader';
import type { Concesionaria, UpdateConcesionariaDto } from '../../types/concesionaria.types';
import { CONDICION_IVA_EMISOR_LABEL } from '../../types/concesionaria.types';
import { getApiErrorMessage } from '../../utils/error';

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

type Tab = 'concesionaria' | 'perfil' | 'password' | 'preferencias';

// Selector de color de marca: swatch nativo + hex editable + botón para volver
// al color por defecto (valor vacío = el PDF usa el color AUTENZA).
function ColorField({ label, value, onChange, fallback }: {
    label: string; value: string; onChange: (v: string) => void; fallback: string;
}) {
    return (
        <div className="form-group">
            <label className="form-label-xs">{label}</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input
                    type="color"
                    value={value && HEX_RE.test(value) ? value : fallback}
                    onChange={e => onChange(e.target.value)}
                    aria-label={label}
                    style={{ width: 42, height: 38, padding: 2, border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'var(--bg-card)', cursor: 'pointer', flexShrink: 0 }}
                />
                <input
                    type="text"
                    className="form-input"
                    value={value}
                    placeholder={fallback}
                    maxLength={7}
                    onChange={e => onChange(e.target.value)}
                    style={{ flex: 1 }}
                />
                {value && (
                    <button
                        type="button"
                        onClick={() => onChange('')}
                        title="Usar color por defecto"
                        style={{ flexShrink: 0, width: 34, height: 34, background: 'transparent', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-muted)', cursor: 'pointer' }}
                    >
                        ✕
                    </button>
                )}
            </div>
        </div>
    );
}

const ConfiguracionPage = () => {
    const { user, setUser } = useAuthStore();
    const { addToast } = useUIStore();
    const navigate = useNavigate();

    // Tour de bienvenida (preferencia por usuario, persistida en localStorage).
    const { startTour } = useTour();
    const tourAutoStart = useTourStore((s) => s.autoStart);
    const setTourAutoStart = useTourStore((s) => s.setAutoStart);
    const replayTour = useTourStore((s) => s.replay);
    const toggleTour = () => {
        const next = !tourAutoStart;
        setTourAutoStart(next);
        // Al reactivarlo, reseteamos el "ya visto" para que vuelva a aparecer solo.
        if (next) replayTour();
    };
    const verTourAhora = () => {
        navigate('/');
        window.setTimeout(() => startTour(), 450);
    };

    const [tab, setTab] = useState<Tab>('concesionaria');

    // Concesionaria state
    const [concesionaria, setConcesionaria] = useState<Concesionaria | null>(null);
    const [concesionariaLoading, setConcesionariaLoading] = useState(false);
    const [concesionariaForm, setConcesionariaForm] = useState({
        nombre: '', cuit: '', email: '', telefono: '', direccion: '',
        colorPrimario: '', colorSecundario: '', pdfPie: '', sitioWeb: '',
        razonSocial: '', condicionIva: '', puntoVenta: '',
    });
    const [savingConcesionaria, setSavingConcesionaria] = useState(false);
    const [deletingLogo, setDeletingLogo] = useState(false);

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
                        colorPrimario: data.colorPrimario || '',
                        colorSecundario: data.colorSecundario || '',
                        pdfPie: data.pdfPie || '',
                        sitioWeb: data.sitioWeb || '',
                        razonSocial: data.razonSocial || '',
                        condicionIva: data.condicionIva || '',
                        puntoVenta: data.puntoVenta != null ? String(data.puntoVenta) : '',
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
        const prim = concesionariaForm.colorPrimario.trim();
        const sec = concesionariaForm.colorSecundario.trim();
        if (prim && !HEX_RE.test(prim)) {
            addToast('El color primario debe ser un hex tipo #10b981', 'error');
            return;
        }
        if (sec && !HEX_RE.test(sec)) {
            addToast('El color secundario debe ser un hex tipo #06b6d4', 'error');
            return;
        }
        setSavingConcesionaria(true);
        try {
            const updated = await concesionariasApi.updateMine({
                nombre: concesionariaForm.nombre.trim(),
                cuit: concesionariaForm.cuit.trim(),
                email: concesionariaForm.email.trim(),
                telefono: concesionariaForm.telefono.trim(),
                direccion: concesionariaForm.direccion.trim(),
                colorPrimario: prim,
                colorSecundario: sec,
                pdfPie: concesionariaForm.pdfPie.trim(),
                sitioWeb: concesionariaForm.sitioWeb.trim(),
                // Datos fiscales del emisor (AFIP). '' → el backend lo persiste como null.
                razonSocial: concesionariaForm.razonSocial.trim(),
                condicionIva: concesionariaForm.condicionIva as UpdateConcesionariaDto['condicionIva'],
                puntoVenta: concesionariaForm.puntoVenta.trim(),
            });
            // El PATCH devuelve la concesionaria ya actualizada: se refleja en el
            // preview (logo, etc.) sin necesidad de recargar.
            if (updated && typeof updated === 'object' && 'id' in updated) {
                setConcesionaria(updated as Concesionaria);
            }
            addToast('Concesionaria actualizada', 'success');
        } catch (err) {
            addToast(getApiErrorMessage(err, 'Error al actualizar la concesionaria'), 'error');
        } finally {
            setSavingConcesionaria(false);
        }
    };

    // El logo se sube/quita por su propio endpoint (multipart), no por el PATCH.
    const handleLogoUploaded = (result: unknown) => {
        if (result && typeof result === 'object' && 'id' in result) {
            setConcesionaria(result as Concesionaria);
        }
        addToast('Logo actualizado', 'success');
    };

    const handleDeleteLogo = async () => {
        setDeletingLogo(true);
        try {
            const updated = await concesionariasApi.deleteLogo();
            if (updated && typeof updated === 'object' && 'id' in updated) {
                setConcesionaria(updated as Concesionaria);
            }
            addToast('Logo eliminado', 'success');
        } catch (err) {
            addToast(getApiErrorMessage(err, 'Error al quitar el logo'), 'error');
        } finally {
            setDeletingLogo(false);
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
                <button className={`segmented-btn ${tab === 'preferencias' ? 'is-active' : ''}`} onClick={() => setTab('preferencias')}>
                    <Sparkles size={16} /> Preferencias
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
                                <>
                                    {/* ── Datos fiscales (facturación AFIP) ──────────────────── */}
                                    <div style={{ marginTop: '1.75rem', paddingTop: '1.25rem', borderTop: '1px solid var(--border)' }}>
                                        <h3 style={{ fontSize: '0.98rem', fontWeight: 700, marginBottom: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            <Receipt size={16} /> Datos fiscales (facturación AFIP)
                                        </h3>
                                        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '1rem', lineHeight: 1.5 }}>
                                            Necesarios para emitir facturas electrónicas. La condición frente al IVA determina qué comprobante emitís
                                            (Responsable Inscripto → Factura A/B). Hoy las facturas se emiten en <strong>modo demo</strong> (CAE simulado,
                                            sin validez fiscal) hasta cargar un certificado AFIP.
                                        </p>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                                                <label className="form-label-xs">Razón social (denominación fiscal)</label>
                                                <input type="text" className="form-input" value={concesionariaForm.razonSocial} maxLength={200}
                                                    placeholder="Ej: Autos del Valle S.A."
                                                    onChange={e => setConcesionariaForm(f => ({ ...f, razonSocial: e.target.value }))} />
                                            </div>
                                            <div className="form-group">
                                                <label className="form-label-xs">Condición frente al IVA</label>
                                                <select className="form-input" value={concesionariaForm.condicionIva}
                                                    onChange={e => setConcesionariaForm(f => ({ ...f, condicionIva: e.target.value }))}>
                                                    <option value="">— Sin definir —</option>
                                                    {(Object.keys(CONDICION_IVA_EMISOR_LABEL) as Array<keyof typeof CONDICION_IVA_EMISOR_LABEL>).map((k) => (
                                                        <option key={k} value={k}>{CONDICION_IVA_EMISOR_LABEL[k]}</option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div className="form-group">
                                                <label className="form-label-xs">Punto de venta</label>
                                                <input type="number" min={1} max={99999} className="form-input" value={concesionariaForm.puntoVenta}
                                                    placeholder="Ej: 1"
                                                    onChange={e => setConcesionariaForm(f => ({ ...f, puntoVenta: e.target.value }))} />
                                            </div>
                                        </div>
                                    </div>

                                    {/* ── Marca de los documentos (PDF) ──────────────────────── */}
                                    <div style={{ marginTop: '1.75rem', paddingTop: '1.25rem', borderTop: '1px solid var(--border)' }}>
                                        <h3 style={{ fontSize: '0.98rem', fontWeight: 700, marginBottom: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            <Palette size={16} /> Marca de los documentos (PDF)
                                        </h3>
                                        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '1rem', lineHeight: 1.5 }}>
                                            Tu logo, colores y pie aparecen en los comprobantes, recibos y presupuestos que genera el sistema.
                                            Si no cargás nada, se usa la marca AUTENZA por defecto (pensada para demostraciones).
                                        </p>

                                        {/* Logo */}
                                        <div className="form-group">
                                            <label className="form-label-xs">Logo (PNG o JPG, máx. 3 MB)</label>
                                            <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                                                <div style={{ width: 170, height: 66, borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', background: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
                                                    {concesionaria.logoUrl
                                                        ? <img src={concesionaria.logoUrl} alt="Logo de la concesionaria" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                                                        : <ImageIcon size={22} style={{ color: 'var(--text-muted)' }} />}
                                                </div>
                                                <div style={{ flex: 1, minWidth: 230 }}>
                                                    <FileUploader
                                                        endpoint={concesionariasApi.logoUploadEndpoint}
                                                        accept="image/png,image/jpeg"
                                                        maxBytes={3 * 1024 * 1024}
                                                        label=""
                                                        onUploaded={handleLogoUploaded}
                                                    />
                                                    {concesionaria.logoUrl && (
                                                        <button
                                                            type="button"
                                                            onClick={handleDeleteLogo}
                                                            disabled={deletingLogo}
                                                            style={{ marginTop: '0.5rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem', background: 'transparent', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '0.3rem 0.6rem', color: 'var(--danger)', cursor: deletingLogo ? 'not-allowed' : 'pointer', fontSize: '0.8rem' }}
                                                        >
                                                            <Trash2 size={14} /> {deletingLogo ? 'Quitando...' : 'Quitar logo'}
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Colores + sitio + pie */}
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1rem' }}>
                                            <ColorField label="Color primario" value={concesionariaForm.colorPrimario}
                                                onChange={v => setConcesionariaForm(f => ({ ...f, colorPrimario: v }))} fallback="#10b981" />
                                            <ColorField label="Color secundario" value={concesionariaForm.colorSecundario}
                                                onChange={v => setConcesionariaForm(f => ({ ...f, colorSecundario: v }))} fallback="#06b6d4" />
                                            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                                                <label className="form-label-xs">Sitio web</label>
                                                <input type="text" className="form-input" value={concesionariaForm.sitioWeb} placeholder="www.miconcesionaria.com" maxLength={200}
                                                    onChange={e => setConcesionariaForm(f => ({ ...f, sitioWeb: e.target.value }))} />
                                            </div>
                                            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                                                <label className="form-label-xs">Pie de página de los documentos</label>
                                                <textarea className="form-input" rows={2} maxLength={500} value={concesionariaForm.pdfPie}
                                                    placeholder="Datos de contacto, condiciones o leyenda legal al pie del PDF"
                                                    onChange={e => setConcesionariaForm(f => ({ ...f, pdfPie: e.target.value }))} />
                                            </div>
                                        </div>
                                    </div>

                                    <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end' }}>
                                        <Button variant="primary" onClick={handleSaveConcesionaria} disabled={savingConcesionaria}>
                                            <Save size={16} /> {savingConcesionaria ? 'Guardando...' : 'Guardar cambios'}
                                        </Button>
                                    </div>
                                </>
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

            {tab === 'preferencias' && (
                <div className="card">
                    <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Sparkles size={18} /> Preferencias
                    </h2>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                        <div style={{ maxWidth: 460 }}>
                            <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Tour de bienvenida</div>
                            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.5 }}>
                                Mostrar el recorrido guiado automáticamente la primera vez que entrás. Podés apagarlo cuando ya lo conozcas, y volver a verlo cuando quieras con el botón <strong>?</strong> del encabezado.
                            </p>
                        </div>
                        <button
                            type="button"
                            role="switch"
                            aria-checked={tourAutoStart}
                            aria-label="Tour de bienvenida automático"
                            onClick={toggleTour}
                            style={{
                                flexShrink: 0, width: 46, height: 26, borderRadius: 'var(--radius-pill)',
                                border: '1px solid var(--border)',
                                background: tourAutoStart ? 'var(--accent-gradient)' : 'var(--bg-secondary)',
                                position: 'relative', cursor: 'pointer', transition: 'background 0.2s',
                                boxShadow: tourAutoStart ? '0 2px 8px rgba(var(--accent-rgb), 0.35)' : 'none',
                            }}
                        >
                            <span style={{
                                position: 'absolute', top: 2, left: tourAutoStart ? 22 : 2,
                                width: 20, height: 20, borderRadius: '50%', background: '#fff',
                                transition: 'left 0.2s var(--easing-out, ease)', boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                            }} />
                        </button>
                    </div>
                    <div style={{ marginTop: '1.25rem', paddingTop: '1.25rem', borderTop: '1px solid var(--border)' }}>
                        <Button variant="secondary" onClick={verTourAhora}>
                            <PlayCircle size={16} /> Ver el tour ahora
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ConfiguracionPage;
