import { useCallback, useEffect, useState } from 'react';
import { Building2, User as UserIcon, Lock, Save, RefreshCw, Palette, Trash2, Image as ImageIcon, Sparkles, PlayCircle, Receipt, Plug, Plus, Edit, Copy, Link2, ChevronRight, ChevronDown } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { useUIStore } from '../../store/uiStore';
import { useTour } from '../../onboarding/useTour';
import { useTourStore } from '../../store/tourStore';
import { concesionariasApi } from '../../api/concesionarias.api';
import { usuariosApi } from '../../api/usuarios.api';
import { integracionesApi } from '../../api/integraciones.api';
import type { Integracion, IntegracionConfig, IntegracionTipo } from '../../api/integraciones.api';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Textarea from '../../components/ui/Textarea';
import Modal from '../../components/ui/Modal';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import { FileUploader } from '../../components/ui/FileUploader';
import type { Concesionaria, UpdateConcesionariaDto } from '../../types/concesionaria.types';
import { CONDICION_IVA_EMISOR_LABEL } from '../../types/concesionaria.types';
import { getApiErrorMessage } from '../../utils/error';
import { formatFecha } from '../../utils/fecha';

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

// ─── Integraciones de consultas (canales que ingresan leads solos) ──────────

const TIPO_INTEGRACION_LABEL: Record<IntegracionTipo, string> = {
    meta: 'Meta (Instagram/Facebook)',
    email: 'Casilla de email (DeRuedas)',
};

const ORIGEN_EMAIL_OPTIONS = [
    { value: 'deruedas', label: 'DeRuedas' },
    { value: 'web', label: 'Web' },
    { value: 'otro', label: 'Otro' },
];

// Los listados del backend vienen en formas distintas según el módulo
// ([], {data}, {results}); se cubren todas, como en useSucursales.
const normalizarListaIntegraciones = (res: unknown): Integracion[] => {
    if (Array.isArray(res)) return res as Integracion[];
    const o = (res ?? {}) as { results?: Integracion[]; data?: Integracion[] | { results?: Integracion[] } };
    if (Array.isArray(o.results)) return o.results;
    if (Array.isArray(o.data)) return o.data;
    const dr = (o.data as { results?: Integracion[] } | undefined)?.results;
    return Array.isArray(dr) ? dr : [];
};

const unwrapIntegracion = (res: unknown): Integracion | null => {
    if (res && typeof res === 'object') {
        if ('id' in res) return res as Integracion;
        const data = (res as { data?: unknown }).data;
        if (data && typeof data === 'object' && 'id' in data) return data as Integracion;
    }
    return null;
};

const webhookMetaUrl = (integracionId: number) =>
    `${window.location.origin}/api/webhooks/meta/${integracionId}`;

interface IntegracionFormState {
    tipo: IntegracionTipo;
    nombre: string;
    // meta
    metaOrigen: 'instagram' | 'facebook';
    verifyToken: string;
    appSecret: string;
    pageAccessToken: string;
    // email
    host: string;
    port: string;
    secure: boolean;
    emailUser: string;
    pass: string;
    carpeta: string;
    emailOrigen: string;
}

const INTEGRACION_FORM_INICIAL: IntegracionFormState = {
    tipo: 'meta', nombre: '',
    metaOrigen: 'instagram', verifyToken: '', appSecret: '', pageAccessToken: '',
    host: '', port: '993', secure: true, emailUser: '', pass: '', carpeta: 'INBOX', emailOrigen: 'deruedas',
};

// URL del webhook para pegar en Meta + guía plegable de 4 pasos. Se muestra
// tras crear una integración meta y al editarla.
function WebhookMetaInfo({ integracionId }: { integracionId: number }) {
    const { addToast } = useUIStore();
    const [pasosVisibles, setPasosVisibles] = useState(false);
    const url = webhookMetaUrl(integracionId);

    const copiar = () => {
        navigator.clipboard.writeText(url)
            .then(() => addToast('URL del webhook copiada', 'success'))
            .catch(() => addToast('No se pudo copiar la URL', 'error'));
    };

    return (
        <div style={{ marginTop: '1rem', padding: '0.85rem', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', background: 'var(--bg-secondary)' }}>
            <div style={{ fontSize: '0.8rem', fontWeight: 700, marginBottom: '0.45rem', display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--text-primary)' }}>
                <Link2 size={14} /> URL del webhook (pegala en Meta)
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <code style={{ flex: 1, fontSize: '0.75rem', padding: '0.45rem 0.55rem', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'var(--bg-card)', overflowX: 'auto', whiteSpace: 'nowrap' }}>
                    {url}
                </code>
                <Button type="button" variant="secondary" size="sm" onClick={copiar}>
                    <Copy size={14} /> Copiar
                </Button>
            </div>
            <button
                type="button"
                onClick={() => setPasosVisibles(v => !v)}
                style={{ marginTop: '0.6rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem', background: 'transparent', border: 'none', padding: 0, color: 'var(--accent)', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600 }}
            >
                {pasosVisibles ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                ¿Cómo la conecto a Meta? (4 pasos)
            </button>
            {pasosVisibles && (
                <ol style={{ margin: '0.5rem 0 0', paddingLeft: '1.2rem', fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.65 }}>
                    <li>Creá una app en <strong>developers.facebook.com</strong> y vinculala a tu página.</li>
                    <li>Agregale el producto <strong>Webhooks</strong> y conectá la página.</li>
                    <li>Suscribí el campo <strong>leadgen</strong> usando esta URL de callback y el verify token que inventaste acá.</li>
                    <li>Generá el token de acceso de la página y pegalo en el campo "Token de página" de esta integración.</li>
                </ol>
            )}
        </div>
    );
}

function SwitchActivo({ activo, disabled, onToggle }: { activo: boolean; disabled?: boolean; onToggle: () => void }) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={activo}
            aria-label={activo ? 'Desactivar integración' : 'Activar integración'}
            onClick={onToggle}
            disabled={disabled}
            style={{
                flexShrink: 0, width: 40, height: 22, borderRadius: 'var(--radius-pill)',
                border: '1px solid var(--border)',
                background: activo ? 'var(--accent-gradient)' : 'var(--bg-secondary)',
                position: 'relative', cursor: disabled ? 'wait' : 'pointer', transition: 'background 0.2s',
                opacity: disabled ? 0.6 : 1,
            }}
        >
            <span style={{
                position: 'absolute', top: 2, left: activo ? 19 : 2,
                width: 16, height: 16, borderRadius: '50%', background: '#fff',
                transition: 'left 0.2s var(--easing-out, ease)', boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
            }} />
        </button>
    );
}

function IntegracionesConsultas() {
    const { addToast } = useUIStore();
    const [integraciones, setIntegraciones] = useState<Integracion[]>([]);
    const [loading, setLoading] = useState(true);
    const [modalOpen, setModalOpen] = useState(false);
    const [editing, setEditing] = useState<Integracion | null>(null);
    // Integración meta recién creada: el modal pasa a mostrar la URL del webhook.
    const [creada, setCreada] = useState<Integracion | null>(null);
    const [deleting, setDeleting] = useState<Integracion | null>(null);
    const [deletingBusy, setDeletingBusy] = useState(false);
    const [saving, setSaving] = useState(false);
    const [togglingId, setTogglingId] = useState<number | null>(null);
    const [form, setForm] = useState<IntegracionFormState>(INTEGRACION_FORM_INICIAL);

    const cargar = useCallback(() => {
        integracionesApi.getAll()
            .then((res: unknown) => setIntegraciones(normalizarListaIntegraciones(res)))
            .catch(() => addToast('Error al cargar las integraciones', 'error'))
            .finally(() => setLoading(false));
    }, [addToast]);

    useEffect(() => { cargar(); }, [cargar]);

    const abrirAlta = () => {
        setEditing(null);
        setCreada(null);
        setForm(INTEGRACION_FORM_INICIAL);
        setModalOpen(true);
    };

    const abrirEdicion = (integracion: Integracion) => {
        const cfg: IntegracionConfig = integracion.config || {};
        setForm({
            tipo: integracion.tipo,
            nombre: integracion.nombre,
            metaOrigen: cfg.origen === 'facebook' ? 'facebook' : 'instagram',
            verifyToken: cfg.verifyToken || '',
            // Los secretos vienen enmascarados: vacío = "no cambiar".
            appSecret: '',
            pageAccessToken: '',
            host: cfg.host || '',
            port: cfg.port != null ? String(cfg.port) : '993',
            secure: cfg.secure ?? true,
            emailUser: cfg.user || '',
            pass: '',
            carpeta: cfg.carpeta || 'INBOX',
            emailOrigen: integracion.tipo === 'email' ? (cfg.origen || 'deruedas') : 'deruedas',
        });
        setEditing(integracion);
        setCreada(null);
        setModalOpen(true);
    };

    const cerrarModal = () => {
        setModalOpen(false);
        setEditing(null);
        setCreada(null);
    };

    const guardar = async () => {
        if (!form.nombre.trim()) {
            addToast('El nombre es requerido', 'error');
            return;
        }
        if (form.tipo === 'meta') {
            if (!form.verifyToken.trim()) {
                addToast('El verify token es requerido', 'error');
                return;
            }
            if (!editing && (!form.appSecret || !form.pageAccessToken)) {
                addToast('Completá el app secret y el token de página', 'error');
                return;
            }
        } else {
            if (!form.host.trim() || !form.emailUser.trim()) {
                addToast('Completá el servidor y el usuario de la casilla', 'error');
                return;
            }
            if (!editing && !form.pass) {
                addToast('La contraseña de la casilla es requerida', 'error');
                return;
            }
        }

        // Un secreto vacío no se manda: el backend conserva el guardado.
        const config: IntegracionConfig = form.tipo === 'meta'
            ? {
                origen: form.metaOrigen,
                verifyToken: form.verifyToken.trim(),
                ...(form.appSecret ? { appSecret: form.appSecret } : {}),
                ...(form.pageAccessToken ? { pageAccessToken: form.pageAccessToken } : {}),
            }
            : {
                origen: form.emailOrigen || 'deruedas',
                host: form.host.trim(),
                port: Number(form.port) || 993,
                secure: form.secure,
                user: form.emailUser.trim(),
                ...(form.pass ? { pass: form.pass } : {}),
                carpeta: form.carpeta.trim() || 'INBOX',
            };

        setSaving(true);
        try {
            if (editing) {
                await integracionesApi.update(editing.id, { nombre: form.nombre.trim(), config });
                addToast('Integración actualizada', 'success');
                cerrarModal();
            } else {
                const res = await integracionesApi.create({ tipo: form.tipo, nombre: form.nombre.trim(), config });
                addToast('Integración creada', 'success');
                const nueva = unwrapIntegracion(res);
                if (form.tipo === 'meta' && nueva) {
                    // No cerramos: mostramos la URL del webhook para pegar en Meta.
                    setEditing(null);
                    setCreada(nueva);
                } else {
                    cerrarModal();
                }
            }
            cargar();
        } catch (err) {
            addToast(getApiErrorMessage(err, 'Error al guardar la integración'), 'error');
        } finally {
            setSaving(false);
        }
    };

    const toggleActivo = async (integracion: Integracion) => {
        setTogglingId(integracion.id);
        try {
            await integracionesApi.update(integracion.id, { activo: !integracion.activo });
            setIntegraciones(prev => prev.map(i => i.id === integracion.id ? { ...i, activo: !integracion.activo } : i));
        } catch (err) {
            addToast(getApiErrorMessage(err, 'Error al cambiar el estado'), 'error');
        } finally {
            setTogglingId(null);
        }
    };

    const confirmarEliminar = async () => {
        if (!deleting) return;
        setDeletingBusy(true);
        try {
            await integracionesApi.delete(deleting.id);
            addToast('Integración eliminada', 'success');
            setDeleting(null);
            cargar();
        } catch (err) {
            addToast(getApiErrorMessage(err, 'Error al eliminar la integración'), 'error');
        } finally {
            setDeletingBusy(false);
        }
    };

    const copiarWebhook = (integracion: Integracion) => {
        navigator.clipboard.writeText(webhookMetaUrl(integracion.id))
            .then(() => addToast('URL del webhook copiada', 'success'))
            .catch(() => addToast('No se pudo copiar la URL', 'error'));
    };

    return (
        <div className="card" style={{ marginTop: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
                <div>
                    <h2 style={{ fontSize: '1.1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Plug size={18} /> Integraciones de consultas
                    </h2>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.5, maxWidth: 520 }}>
                        Conectá los canales por donde te llegan consultas (Meta, DeRuedas) y se cargan solas
                        como clientes con su vendedor asignado.
                    </p>
                </div>
                <Button variant="primary" onClick={abrirAlta}>
                    <Plus size={16} /> Agregar integración
                </Button>
            </div>

            {loading ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                    <RefreshCw size={20} className="animate-spin" style={{ display: 'inline-block', marginRight: '0.5rem' }} /> Cargando...
                </div>
            ) : integraciones.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', padding: '0.5rem 0' }}>
                    Todavía no conectaste ningún canal. Agregá una integración para empezar a recibir consultas automáticamente.
                </p>
            ) : (
                <div className="table-container">
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Nombre</th>
                                <th>Tipo</th>
                                <th>Origen</th>
                                <th>Activa</th>
                                <th>Último evento</th>
                                <th>Último error</th>
                                <th style={{ textAlign: 'right' }}>Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {integraciones.map((i) => (
                                <tr key={i.id}>
                                    <td style={{ fontWeight: 600 }}>{i.nombre}</td>
                                    <td>{i.tipo === 'meta' ? 'Meta' : 'Email'}</td>
                                    <td>{i.config?.origen || '—'}</td>
                                    <td>
                                        <SwitchActivo
                                            activo={i.activo}
                                            disabled={togglingId === i.id}
                                            onToggle={() => toggleActivo(i)}
                                        />
                                    </td>
                                    <td>{i.ultimoEvento ? formatFecha(i.ultimoEvento) : '—'}</td>
                                    <td>
                                        {i.ultimoError ? (
                                            <span
                                                className="text-danger"
                                                title={i.ultimoError}
                                                style={{ display: 'inline-block', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', verticalAlign: 'bottom', fontSize: '0.8rem' }}
                                            >
                                                {i.ultimoError}
                                            </span>
                                        ) : '—'}
                                    </td>
                                    <td style={{ textAlign: 'right' }}>
                                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                                            {i.tipo === 'meta' && (
                                                <button className="icon-btn" onClick={() => copiarWebhook(i)} aria-label="Copiar URL del webhook" title="Copiar URL del webhook">
                                                    <Link2 size={16} />
                                                </button>
                                            )}
                                            <button className="icon-btn" onClick={() => abrirEdicion(i)} aria-label="Editar" title="Editar">
                                                <Edit size={16} />
                                            </button>
                                            <button className="icon-btn danger" onClick={() => setDeleting(i)} aria-label="Eliminar" title="Eliminar">
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
                isOpen={modalOpen}
                onClose={cerrarModal}
                title={creada ? 'Integración creada' : editing ? 'Editar integración' : 'Agregar integración'}
                subtitle={creada ? 'Último paso: conectala en Meta con esta URL.' : 'Canal por donde entran consultas automáticamente.'}
                maxWidth="640px"
                footer={creada ? (
                    <div style={{ display: 'flex', justifyContent: 'flex-end', width: '100%' }}>
                        <Button variant="primary" onClick={cerrarModal}>Listo</Button>
                    </div>
                ) : (
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', width: '100%' }}>
                        <Button variant="secondary" onClick={cerrarModal} disabled={saving}>Cancelar</Button>
                        <Button variant="primary" onClick={guardar} loading={saving}>
                            <Save size={16} /> {editing ? 'Guardar cambios' : 'Crear integración'}
                        </Button>
                    </div>
                )}
            >
                {creada ? (
                    <WebhookMetaInfo integracionId={creada.id} />
                ) : (
                    <>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                            <Select dense label="Tipo de canal" containerClassName="col-span-full"
                                value={form.tipo} disabled={!!editing}
                                onChange={e => setForm(f => ({ ...f, tipo: e.target.value as IntegracionTipo }))}>
                                <option value="meta">{TIPO_INTEGRACION_LABEL.meta}</option>
                                <option value="email">{TIPO_INTEGRACION_LABEL.email}</option>
                            </Select>
                            <Input dense label="Nombre *" type="text" containerClassName="col-span-full"
                                value={form.nombre} placeholder="Ej: Instagram de la agencia"
                                onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} />

                            {form.tipo === 'meta' ? (
                                <>
                                    <Select dense label="Origen" value={form.metaOrigen}
                                        onChange={e => setForm(f => ({ ...f, metaOrigen: e.target.value as 'instagram' | 'facebook' }))}>
                                        <option value="instagram">Instagram</option>
                                        <option value="facebook">Facebook</option>
                                    </Select>
                                    <Input dense label="Verify token *" type="text"
                                        value={form.verifyToken} hint="inventá un token y usalo igual en Meta"
                                        onChange={e => setForm(f => ({ ...f, verifyToken: e.target.value }))} />
                                    <Input dense label={editing ? 'App secret' : 'App secret *'} type="password"
                                        value={form.appSecret} autoComplete="new-password"
                                        placeholder={editing ? '(sin cambios)' : ''}
                                        onChange={e => setForm(f => ({ ...f, appSecret: e.target.value }))} />
                                    <Input dense label={editing ? 'Token de página' : 'Token de página *'} type="password"
                                        value={form.pageAccessToken} autoComplete="new-password"
                                        placeholder={editing ? '(sin cambios)' : ''}
                                        onChange={e => setForm(f => ({ ...f, pageAccessToken: e.target.value }))} />
                                </>
                            ) : (
                                <>
                                    <p className="col-span-full" style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.5, margin: 0 }}>
                                        Usá la casilla donde te llegan los avisos de DeRuedas; el sistema la revisa cada 5 minutos.
                                    </p>
                                    <Input dense label="Servidor IMAP (host) *" type="text"
                                        value={form.host} placeholder="imap.gmail.com"
                                        onChange={e => setForm(f => ({ ...f, host: e.target.value }))} />
                                    <Input dense label="Puerto" type="number" min={1} max={65535}
                                        value={form.port}
                                        onChange={e => setForm(f => ({ ...f, port: e.target.value }))} />
                                    <Input dense label="Usuario (email) *" type="text"
                                        value={form.emailUser} placeholder="ventas@miconcesionaria.com" autoComplete="off"
                                        onChange={e => setForm(f => ({ ...f, emailUser: e.target.value }))} />
                                    <Input dense label={editing ? 'Contraseña' : 'Contraseña *'} type="password"
                                        value={form.pass} autoComplete="new-password"
                                        placeholder={editing ? '(sin cambios)' : ''}
                                        onChange={e => setForm(f => ({ ...f, pass: e.target.value }))} />
                                    <Input dense label="Carpeta" type="text"
                                        value={form.carpeta} placeholder="INBOX"
                                        onChange={e => setForm(f => ({ ...f, carpeta: e.target.value }))} />
                                    <Select dense label="Origen de los leads" value={form.emailOrigen}
                                        onChange={e => setForm(f => ({ ...f, emailOrigen: e.target.value }))}>
                                        {ORIGEN_EMAIL_OPTIONS.map(o => (
                                            <option key={o.value} value={o.value}>{o.label}</option>
                                        ))}
                                    </Select>
                                    <label className="col-span-full" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                        <input type="checkbox" checked={form.secure}
                                            onChange={e => setForm(f => ({ ...f, secure: e.target.checked }))} />
                                        <span>Conexión segura (SSL/TLS)</span>
                                    </label>
                                </>
                            )}
                        </div>
                        {editing && editing.tipo === 'meta' && (
                            <WebhookMetaInfo integracionId={editing.id} />
                        )}
                    </>
                )}
            </Modal>

            <ConfirmDialog
                isOpen={!!deleting}
                title="Eliminar integración"
                message={deleting
                    ? `¿Eliminar la integración "${deleting.nombre}"? Dejás de recibir consultas por este canal.`
                    : ''}
                confirmLabel="Eliminar integración"
                cancelLabel="Cancelar"
                type="danger"
                onConfirm={confirmarEliminar}
                onCancel={() => setDeleting(null)}
                loading={deletingBusy}
            />
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
                                <Input dense label="Nombre *" type="text" value={concesionariaForm.nombre} disabled={!isAdmin}
                                    onChange={e => setConcesionariaForm(f => ({ ...f, nombre: e.target.value }))} />
                                <Input dense label="CUIT" type="text" value={concesionariaForm.cuit} disabled={!isAdmin}
                                    onChange={e => setConcesionariaForm(f => ({ ...f, cuit: e.target.value }))} />
                                <Input dense label="Email" type="email" value={concesionariaForm.email} disabled={!isAdmin}
                                    onChange={e => setConcesionariaForm(f => ({ ...f, email: e.target.value }))} />
                                <Input dense label="Teléfono" type="text" value={concesionariaForm.telefono} disabled={!isAdmin}
                                    onChange={e => setConcesionariaForm(f => ({ ...f, telefono: e.target.value }))} />
                                <Input dense label="Dirección" type="text" containerClassName="col-span-full" value={concesionariaForm.direccion} disabled={!isAdmin}
                                    onChange={e => setConcesionariaForm(f => ({ ...f, direccion: e.target.value }))} />
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
                                            <Input dense label="Razón social (denominación fiscal)" type="text" containerClassName="col-span-full"
                                                value={concesionariaForm.razonSocial} maxLength={200}
                                                placeholder="Ej: Autos del Valle S.A."
                                                onChange={e => setConcesionariaForm(f => ({ ...f, razonSocial: e.target.value }))} />
                                            <Select dense label="Condición frente al IVA" value={concesionariaForm.condicionIva}
                                                placeholder="— Sin definir —"
                                                onChange={e => setConcesionariaForm(f => ({ ...f, condicionIva: e.target.value }))}>
                                                {(Object.keys(CONDICION_IVA_EMISOR_LABEL) as Array<keyof typeof CONDICION_IVA_EMISOR_LABEL>).map((k) => (
                                                    <option key={k} value={k}>{CONDICION_IVA_EMISOR_LABEL[k]}</option>
                                                ))}
                                            </Select>
                                            <Input dense label="Punto de venta" type="number" min={1} max={99999} value={concesionariaForm.puntoVenta}
                                                placeholder="Ej: 1"
                                                onChange={e => setConcesionariaForm(f => ({ ...f, puntoVenta: e.target.value }))} />
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
                                            <Input dense label="Sitio web" type="text" containerClassName="col-span-full"
                                                value={concesionariaForm.sitioWeb} placeholder="www.miconcesionaria.com" maxLength={200}
                                                onChange={e => setConcesionariaForm(f => ({ ...f, sitioWeb: e.target.value }))} />
                                            <Textarea dense label="Pie de página de los documentos" containerClassName="col-span-full"
                                                rows={2} maxLength={500} value={concesionariaForm.pdfPie}
                                                placeholder="Datos de contacto, condiciones o leyenda legal al pie del PDF"
                                                onChange={e => setConcesionariaForm(f => ({ ...f, pdfPie: e.target.value }))} />
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
                        <Input dense label="Nombre *" type="text" value={perfilForm.nombre}
                            onChange={e => setPerfilForm(f => ({ ...f, nombre: e.target.value }))} />
                        <Input dense label="Email *" type="email" value={perfilForm.email}
                            onChange={e => setPerfilForm(f => ({ ...f, email: e.target.value }))} />
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
                        <Input dense label="Contraseña actual *" type="password" containerClassName="col-span-full"
                            value={passForm.current} autoComplete="current-password"
                            onChange={e => setPassForm(f => ({ ...f, current: e.target.value }))}
                            placeholder="Tu contraseña actual" />
                        <Input dense label="Nueva contraseña *" type="password" value={passForm.password} autoComplete="new-password"
                            onChange={e => setPassForm(f => ({ ...f, password: e.target.value }))}
                            placeholder="Mínimo 6 caracteres" />
                        <Input dense label="Confirmar nueva contraseña *" type="password" value={passForm.confirm} autoComplete="new-password"
                            onChange={e => setPassForm(f => ({ ...f, confirm: e.target.value }))} />
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

            {/* Integraciones de consultas: sólo administración (crea/edita credenciales). */}
            {isAdmin && <IntegracionesConsultas />}
        </div>
    );
};

export default ConfiguracionPage;
