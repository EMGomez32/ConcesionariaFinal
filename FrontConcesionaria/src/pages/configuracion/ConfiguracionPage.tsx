import { useCallback, useEffect, useState } from 'react';
import { Building2, User as UserIcon, Lock, Save, RefreshCw, Palette, Trash2, Image as ImageIcon, Sparkles, PlayCircle, Receipt, Plug, Plus, Edit, Copy, Link2, ChevronRight, ChevronDown, MessageCircle, QrCode, Unplug, LogOut, Smartphone, ShoppingBag, AlertTriangle, ExternalLink } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { useUIStore } from '../../store/uiStore';
import { useTour } from '../../onboarding/useTour';
import { useTourStore } from '../../store/tourStore';
import { concesionariasApi } from '../../api/concesionarias.api';
import { usuariosApi } from '../../api/usuarios.api';
import { integracionesApi } from '../../api/integraciones.api';
import type { Integracion, IntegracionConfig, IntegracionTipo } from '../../api/integraciones.api';
import { whatsappApi } from '../../api/whatsapp.api';
import type { EstadoSesionWhatsapp, EstadoWhatsappCuenta, SaludNumeroWhatsapp, WhatsappCuenta } from '../../api/whatsapp.api';
import { mercadolibreApi } from '../../api/mercadolibre.api';
import type { CuentaMlResumen, EstadoCuentaMl } from '../../api/mercadolibre.api';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Textarea from '../../components/ui/Textarea';
import Modal from '../../components/ui/Modal';
import Badge from '../../components/ui/Badge';
import type { BadgeVariant } from '../../components/ui/Badge';
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

// ─── WhatsApp (vinculación del número por QR) ───────────────────────────────

const ESTADO_WA_LABEL: Record<EstadoWhatsappCuenta, string> = {
    desconectado: 'Desconectado',
    conectando: 'Conectando…',
    esperando_qr: 'Esperando QR',
    conectado: 'Conectado',
    reconectando: 'Reconectando…',
    error: 'Error',
};

const ESTADO_WA_BADGE: Record<EstadoWhatsappCuenta, BadgeVariant> = {
    conectado: 'success',
    esperando_qr: 'warning',
    error: 'danger',
    desconectado: 'default',
    conectando: 'default',
    reconectando: 'default',
};

// Salud del número frente al anti-ban: la calcula el backend (espaciado de envíos).
const SALUD_WA_LABEL: Record<SaludNumeroWhatsapp, string> = {
    normal: 'Normal',
    ralentizado: 'Ralentizado',
    pausado: 'Pausado',
};

// Estados en los que el vínculo todavía se está negociando: el modal del QR
// sigue polleando hasta que caiga en 'conectado' o 'error'.
const ESTADOS_WA_EN_VUELO: EstadoWhatsappCuenta[] = ['conectando', 'esperando_qr', 'reconectando'];

// Mismo criterio defensivo que en las integraciones: el listado puede venir
// pelado o envuelto según el módulo del backend.
const normalizarListaCuentas = (res: unknown): WhatsappCuenta[] => {
    if (Array.isArray(res)) return res as WhatsappCuenta[];
    const o = (res ?? {}) as { results?: WhatsappCuenta[]; data?: WhatsappCuenta[] | { results?: WhatsappCuenta[] } };
    if (Array.isArray(o.results)) return o.results;
    if (Array.isArray(o.data)) return o.data;
    const dr = (o.data as { results?: WhatsappCuenta[] } | undefined)?.results;
    return Array.isArray(dr) ? dr : [];
};

function CuentasWhatsapp() {
    const { addToast } = useUIStore();
    const [cuentas, setCuentas] = useState<WhatsappCuenta[]>([]);
    const [loading, setLoading] = useState(true);
    const [alias, setAlias] = useState('');
    const [creando, setCreando] = useState(false);
    // Cuenta con una acción (conectar/desconectar) en curso: bloquea sus botones.
    const [accionId, setAccionId] = useState<number | null>(null);
    // Cuenta cuyo QR se está mostrando + último estado polleado del backend.
    const [qrCuenta, setQrCuenta] = useState<WhatsappCuenta | null>(null);
    const [sesion, setSesion] = useState<EstadoSesionWhatsapp | null>(null);
    const [cerrandoSesion, setCerrandoSesion] = useState<WhatsappCuenta | null>(null);
    const [cerrandoBusy, setCerrandoBusy] = useState(false);

    const cargar = useCallback(() => {
        whatsappApi.getCuentas()
            .then((res: unknown) => setCuentas(normalizarListaCuentas(res)))
            .catch(() => addToast('Error al cargar las cuentas de WhatsApp', 'error'))
            .finally(() => setLoading(false));
    }, [addToast]);

    useEffect(() => { cargar(); }, [cargar]);

    const cerrarQr = useCallback(() => {
        setQrCuenta(null);
        setSesion(null);
    }, []);

    // El vínculo se completa en el celular, no acá: mientras el modal del QR está
    // abierto se pregunta el estado cada 2s (y una vez ya mismo, para que "Ver
    // código QR" no espere el primer tick). Al conectar, cierra y avisa.
    const qrCuentaId = qrCuenta?.id ?? null;
    useEffect(() => {
        if (qrCuentaId == null) return;
        let cancelado = false;
        const consultar = async () => {
            try {
                const res = await whatsappApi.getEstado(qrCuentaId);
                if (cancelado) return;
                setSesion(res);
                if (res.estado === 'conectado') {
                    cerrarQr();
                    addToast('WhatsApp vinculado con éxito', 'success');
                    cargar();
                }
            } catch (err) {
                // Un tick fallido no cierra el modal: el siguiente puede recuperarse.
                if (cancelado) return;
                setSesion({
                    estado: 'error', qr: null, numero: null,
                    error: getApiErrorMessage(err, 'No se pudo consultar el estado de la vinculación'),
                });
            }
        };
        void consultar();
        const timer = window.setInterval(consultar, 2000);
        return () => { cancelado = true; window.clearInterval(timer); };
    }, [qrCuentaId, addToast, cargar, cerrarQr]);

    const crear = async () => {
        if (!alias.trim()) {
            addToast('Poné un alias para identificar el número', 'error');
            return;
        }
        setCreando(true);
        try {
            await whatsappApi.createCuenta({ alias: alias.trim() });
            addToast('Cuenta creada. Ahora vinculá el número escaneando el QR.', 'success');
            setAlias('');
            cargar();
        } catch (err) {
            addToast(getApiErrorMessage(err, 'No se pudo crear la cuenta'), 'error');
        } finally {
            setCreando(false);
        }
    };

    const vincular = async (cuenta: WhatsappCuenta) => {
        setAccionId(cuenta.id);
        try {
            const res = await whatsappApi.conectar(cuenta.id);
            if (res?.estado === 'conectado') {
                // Tenía la sesión guardada: reconectó sin pedir QR. (También cubre
                // el "Reintentar" del modal, que en ese caso ya no tiene sentido.)
                if (qrCuenta?.id === cuenta.id) cerrarQr();
                addToast('WhatsApp reconectado', 'success');
            } else {
                setSesion(res ?? null);
                setQrCuenta(cuenta);
            }
            cargar();
        } catch (err) {
            addToast(getApiErrorMessage(err, 'No se pudo iniciar la vinculación'), 'error');
        } finally {
            setAccionId(null);
        }
    };

    const verQr = (cuenta: WhatsappCuenta) => {
        setSesion(null);
        setQrCuenta(cuenta);
    };

    const desconectar = async (cuenta: WhatsappCuenta) => {
        setAccionId(cuenta.id);
        try {
            await whatsappApi.desconectar(cuenta.id);
            addToast('WhatsApp desconectado', 'success');
            if (qrCuenta?.id === cuenta.id) cerrarQr();
            cargar();
        } catch (err) {
            addToast(getApiErrorMessage(err, 'No se pudo desconectar'), 'error');
        } finally {
            setAccionId(null);
        }
    };

    const confirmarCerrarSesion = async () => {
        if (!cerrandoSesion) return;
        setCerrandoBusy(true);
        try {
            await whatsappApi.cerrarSesion(cerrandoSesion.id);
            addToast('Sesión cerrada. Para volver a usarlo hay que vincularlo de nuevo.', 'success');
            if (qrCuenta?.id === cerrandoSesion.id) cerrarQr();
            setCerrandoSesion(null);
            cargar();
        } catch (err) {
            addToast(getApiErrorMessage(err, 'No se pudo cerrar la sesión'), 'error');
        } finally {
            setCerrandoBusy(false);
        }
    };

    const estadoModal = sesion?.estado ?? qrCuenta?.estado ?? 'conectando';
    const errorModal = sesion?.error ?? null;

    return (
        <div className="card" style={{ marginTop: 'var(--space-6)' }}>
            <div style={{ marginBottom: 'var(--space-4)' }}>
                <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                    <MessageCircle size={18} /> WhatsApp
                </h2>
                <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', marginTop: 'var(--space-1)', lineHeight: 1.5, maxWidth: 560 }}>
                    Vinculá el WhatsApp de la concesionaria para atender las consultas desde el sistema.
                    El número <strong>sigue funcionando igual en el celular</strong>: esto es un dispositivo
                    vinculado, como WhatsApp Web.
                </p>
            </div>

            {loading ? (
                <div style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'var(--text-muted)' }}>
                    <RefreshCw size={20} className="animate-spin" style={{ display: 'inline-block', marginRight: 'var(--space-2)' }} /> Cargando...
                </div>
            ) : cuentas.length === 0 ? (
                <div>
                    <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)', lineHeight: 1.5, marginBottom: 'var(--space-4)', maxWidth: 560 }}>
                        Todavía no hay ningún número. Creá la cuenta con un alias para reconocerla
                        (el número se toma solo al escanear el QR).
                    </p>
                    <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'flex-end', flexWrap: 'wrap', maxWidth: 460 }}>
                        <div style={{ flex: 1, minWidth: 220 }}>
                            <Input
                                dense
                                label="Alias"
                                type="text"
                                value={alias}
                                placeholder="Ej: Ventas"
                                maxLength={60}
                                onChange={e => setAlias(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); crear(); } }}
                            />
                        </div>
                        <Button variant="primary" onClick={crear} loading={creando}>
                            <Plus size={16} /> Crear
                        </Button>
                    </div>
                </div>
            ) : (
                <div className="table-container">
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Alias</th>
                                <th>Número</th>
                                <th>Estado</th>
                                <th>Envíos</th>
                                <th>Último error</th>
                                <th style={{ textAlign: 'right' }}>Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {cuentas.map((c) => {
                                const ocupada = accionId === c.id;
                                const enVuelo = ESTADOS_WA_EN_VUELO.includes(c.estado);
                                return (
                                    <tr key={c.id}>
                                        <td style={{ fontWeight: 600 }}>{c.alias}</td>
                                        <td>{c.numero || '—'}</td>
                                        <td>
                                            <Badge variant={ESTADO_WA_BADGE[c.estado]}>{ESTADO_WA_LABEL[c.estado]}</Badge>
                                        </td>
                                        <td>
                                            {c.saludEstado === 'normal'
                                                ? <span style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>Normal</span>
                                                : <Badge variant={c.saludEstado === 'pausado' ? 'danger' : 'warning'}>{SALUD_WA_LABEL[c.saludEstado]}</Badge>}
                                        </td>
                                        <td>
                                            {c.ultimoError ? (
                                                <span
                                                    className="text-danger"
                                                    title={c.ultimoError}
                                                    style={{ display: 'inline-block', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', verticalAlign: 'bottom', fontSize: 'var(--text-sm)' }}
                                                >
                                                    {c.ultimoError}
                                                </span>
                                            ) : '—'}
                                        </td>
                                        <td style={{ textAlign: 'right' }}>
                                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                                                {c.estado === 'conectado' ? (
                                                    <Button variant="secondary" size="sm" onClick={() => desconectar(c)} loading={ocupada}>
                                                        <Unplug size={14} /> Desconectar
                                                    </Button>
                                                ) : enVuelo ? (
                                                    <>
                                                        <Button variant="primary" size="sm" onClick={() => verQr(c)} disabled={ocupada}>
                                                            <QrCode size={14} /> Ver código QR
                                                        </Button>
                                                        <Button variant="secondary" size="sm" onClick={() => desconectar(c)} loading={ocupada}>
                                                            <Unplug size={14} /> Cancelar
                                                        </Button>
                                                    </>
                                                ) : (
                                                    <Button variant="primary" size="sm" onClick={() => vincular(c)} loading={ocupada}>
                                                        <QrCode size={14} /> {c.tieneSesion ? 'Reconectar' : 'Vincular'}
                                                    </Button>
                                                )}
                                                {c.tieneSesion && (
                                                    <Button variant="ghost" size="sm" onClick={() => setCerrandoSesion(c)} disabled={ocupada}>
                                                        <LogOut size={14} /> Cerrar sesión
                                                    </Button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            <Modal
                isOpen={!!qrCuenta}
                onClose={cerrarQr}
                title={qrCuenta ? `Vincular "${qrCuenta.alias}"` : 'Vincular WhatsApp'}
                subtitle="Escaneá el código con el celular del número que querés usar."
                maxWidth="520px"
                footer={(
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-3)', width: '100%' }}>
                        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                            Estado: {ESTADO_WA_LABEL[estadoModal]}
                        </span>
                        <Button variant="secondary" onClick={cerrarQr}>Cerrar</Button>
                    </div>
                )}
            >
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-4)' }}>
                    {/* El QR va SIEMPRE sobre blanco (incluso en tema oscuro): un código
                        invertido no lo lee la cámara. */}
                    <div style={{
                        width: 248, height: 248, borderRadius: 'var(--radius-md)', border: '1px solid var(--border)',
                        background: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        padding: 'var(--space-2)', flexShrink: 0,
                    }}>
                        {sesion?.qr ? (
                            <img src={sesion.qr} alt="Código QR para vincular WhatsApp" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                        ) : (
                            <span style={{ color: '#8a93a6', fontSize: 'var(--text-sm)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                                <RefreshCw size={16} className="animate-spin" /> Generando el código...
                            </span>
                        )}
                    </div>

                    {errorModal && (
                        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-2)' }}>
                            <p className="text-danger" style={{ margin: 0, fontSize: 'var(--text-sm)', textAlign: 'center', lineHeight: 1.5 }}>
                                {errorModal}
                            </p>
                            {qrCuenta && (
                                <Button variant="secondary" size="sm" onClick={() => vincular(qrCuenta)} loading={accionId === qrCuenta.id}>
                                    <RefreshCw size={14} /> Reintentar
                                </Button>
                            )}
                        </div>
                    )}

                    <ol style={{ margin: 0, paddingLeft: 'var(--space-5)', fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', lineHeight: 1.7, alignSelf: 'stretch' }}>
                        <li>Abrí <strong>WhatsApp</strong> en el celular.</li>
                        <li>Entrá a <strong>Dispositivos vinculados</strong>.</li>
                        <li>Tocá <strong>Vincular un dispositivo</strong>.</li>
                        <li>Escaneá este código con la cámara.</li>
                    </ol>

                    <div style={{
                        alignSelf: 'stretch', display: 'flex', gap: 'var(--space-3)', alignItems: 'flex-start',
                        padding: 'var(--space-3)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)',
                        background: 'var(--bg-secondary)',
                    }}>
                        <Smartphone size={16} style={{ color: 'var(--text-muted)', flexShrink: 0, marginTop: 2 }} />
                        <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                            El número <strong>sigue funcionando en el celular</strong> como siempre: WhatsApp queda
                            vinculado a este sistema igual que WhatsApp Web. Si alguna vez cerrás la sesión desde el
                            teléfono (Dispositivos vinculados → cerrar sesión), hay que volver a vincularlo acá.
                        </p>
                    </div>
                </div>
            </Modal>

            <ConfirmDialog
                isOpen={!!cerrandoSesion}
                title="Cerrar sesión de WhatsApp"
                message={cerrandoSesion
                    ? `¿Cerrar la sesión de "${cerrandoSesion.alias}"? Se borra la vinculación y, para volver a usarlo, vas a tener que escanear el QR de nuevo desde el celular.`
                    : ''}
                confirmLabel="Cerrar sesión"
                cancelLabel="Cancelar"
                type="warning"
                onConfirm={confirmarCerrarSesion}
                onCancel={() => setCerrandoSesion(null)}
                loading={cerrandoBusy}
            />
        </div>
    );
}

// ─── Mercado Libre (vinculación de la cuenta por OAuth) ─────────────────────

// La Redirect URI que hay que declarar en la app de Mercado Libre. Apunta a la
// ruta PÚBLICA del backend que canjea el `code`, no a una pantalla del front.
const redirectUriMl = () => `${window.location.origin}/api/webhooks/mercadolibre/callback`;

function CuentasMercadoLibre() {
    const { addToast } = useUIStore();
    const [searchParams, setSearchParams] = useSearchParams();
    const [estado, setEstado] = useState<EstadoCuentaMl | null>(null);
    const [loading, setLoading] = useState(true);
    const [conectando, setConectando] = useState(false);
    const [desvinculando, setDesvinculando] = useState<CuentaMlResumen | null>(null);
    const [desvinculandoBusy, setDesvinculandoBusy] = useState(false);
    const [pasosVisibles, setPasosVisibles] = useState(false);

    const cargar = useCallback(() => {
        mercadolibreApi.getCuenta()
            .then((res) => setEstado(res))
            .catch(() => addToast('Error al cargar el estado de Mercado Libre', 'error'))
            .finally(() => setLoading(false));
    }, [addToast]);

    useEffect(() => { cargar(); }, [cargar]);

    // Vuelta del OAuth: el backend redirige acá con ?ml=ok o ?ml=error&detalle=...
    // El query se limpia enseguida para que un refresh no repita el toast.
    useEffect(() => {
        const resultado = searchParams.get('ml');
        if (!resultado) return;
        if (resultado === 'ok') {
            addToast('Cuenta de Mercado Libre vinculada con éxito', 'success');
        } else {
            addToast(searchParams.get('detalle') || 'No se pudo vincular la cuenta de Mercado Libre', 'error');
        }
        const limpios = new URLSearchParams(searchParams);
        limpios.delete('ml');
        limpios.delete('detalle');
        setSearchParams(limpios, { replace: true });
        cargar();
    }, [searchParams, setSearchParams, addToast, cargar]);

    const conectar = async () => {
        setConectando(true);
        try {
            const res = await mercadolibreApi.vincular();
            // Redirect de PÁGINA COMPLETA: Mercado Libre bloquea el framing, así que
            // la pantalla de autorización no se puede abrir en un iframe.
            window.location.assign(res.url);
            // No se libera el botón: la navegación ya está en curso.
        } catch (err) {
            addToast(getApiErrorMessage(err, 'No se pudo iniciar la vinculación'), 'error');
            setConectando(false);
        }
    };

    const confirmarDesvincular = async () => {
        if (!desvinculando) return;
        setDesvinculandoBusy(true);
        try {
            await mercadolibreApi.desvincular(desvinculando.id);
            addToast('Cuenta de Mercado Libre desvinculada', 'success');
            setDesvinculando(null);
            cargar();
        } catch (err) {
            addToast(getApiErrorMessage(err, 'No se pudo desvincular la cuenta'), 'error');
        } finally {
            setDesvinculandoBusy(false);
        }
    };

    const copiarRedirect = () => {
        navigator.clipboard.writeText(redirectUriMl())
            .then(() => addToast('Redirect URI copiada', 'success'))
            .catch(() => addToast('No se pudo copiar la Redirect URI', 'error'));
    };

    // Dos cosas distintas: `configurada` es del servidor (las credenciales de la
    // app de ML) y `conectada` es de esta concesionaria (la autorización OAuth).
    const configurada = estado?.configurada ?? false;
    const cuenta = estado?.conectada ? (estado.cuenta ?? null) : null;

    return (
        <div className="card" style={{ marginTop: 'var(--space-6)' }}>
            <div style={{ marginBottom: 'var(--space-4)' }}>
                <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                    <ShoppingBag size={18} /> Mercado Libre
                </h2>
                <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', marginTop: 'var(--space-1)', lineHeight: 1.5, maxWidth: 560 }}>
                    Vinculá la cuenta de Mercado Libre para publicar los vehículos desde el sistema y
                    contestar las preguntas acá adentro. Se publica <strong>de a una y a mano</strong>, pero
                    después el precio y la baja se sincronizan solos: si cambiás el precio se actualiza la
                    publicación, y si el vehículo pasa a reservado o vendido se pausa o se cierra.
                </p>
            </div>

            {loading ? (
                <div style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'var(--text-muted)' }}>
                    <RefreshCw size={20} className="animate-spin" style={{ display: 'inline-block', marginRight: 'var(--space-2)' }} /> Cargando...
                </div>
            ) : (
                <>
                    {/* Sin credenciales de servidor no hay OAuth posible: se avisa qué falta
                        y el botón queda deshabilitado (el secret NO se carga desde la UI). */}
                    {!configurada && (
                        <div style={{
                            display: 'flex', gap: 'var(--space-3)', alignItems: 'flex-start',
                            padding: 'var(--space-3)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)',
                            background: 'var(--bg-secondary)', marginBottom: 'var(--space-4)', maxWidth: 620,
                        }}>
                            <AlertTriangle size={16} style={{ color: 'var(--warning)', flexShrink: 0, marginTop: 2 }} />
                            <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                                <strong>Falta configurar Mercado Libre en el servidor.</strong> Hacen falta
                                ML_CLIENT_ID y ML_CLIENT_SECRET (las credenciales de la app de Mercado Libre) y
                                también INTEGRACIONES_SECRET_KEY, la clave con la que se cifran los tokens del
                                vendedor: sin ella la vinculación se rechaza, porque esos tokens permiten publicar,
                                cerrar avisos y contestar en tu nombre y no se guardan en texto plano. Son variables
                                de entorno del backend, no se cargan desde esta pantalla: creá la app con los datos
                                de más abajo, poné las variables y reiniciá el servidor.
                            </p>
                        </div>
                    )}

                    {cuenta ? (
                        <div className="table-container">
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th>Cuenta</th>
                                        <th>User ID</th>
                                        <th>Sitio</th>
                                        <th>Estado</th>
                                        <th>Último error</th>
                                        <th style={{ textAlign: 'right' }}>Acciones</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr>
                                        <td style={{ fontWeight: 600 }}>{cuenta.nickname || '—'}</td>
                                        <td className="font-mono" style={{ fontSize: 'var(--text-sm)' }}>{cuenta.mlUserId}</td>
                                        <td>{cuenta.siteId}</td>
                                        <td>
                                            {cuenta.activa
                                                ? (cuenta.ultimoError
                                                    ? <Badge variant="warning">Con problemas</Badge>
                                                    : <Badge variant="success">Conectada</Badge>)
                                                : <Badge variant="danger">Inactiva</Badge>}
                                        </td>
                                        <td>
                                            {cuenta.ultimoError ? (
                                                <span
                                                    className="text-danger"
                                                    title={cuenta.ultimoError}
                                                    style={{ display: 'inline-block', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', verticalAlign: 'bottom', fontSize: 'var(--text-sm)' }}
                                                >
                                                    {cuenta.ultimoError}
                                                </span>
                                            ) : '—'}
                                        </td>
                                        <td style={{ textAlign: 'right' }}>
                                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                                                <Button variant="secondary" size="sm" onClick={conectar} loading={conectando} disabled={!configurada}>
                                                    <RefreshCw size={14} /> Volver a autorizar
                                                </Button>
                                                <Button variant="ghost" size="sm" onClick={() => setDesvinculando(cuenta)} disabled={conectando}>
                                                    <Unplug size={14} /> Desvincular
                                                </Button>
                                            </div>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div>
                            <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)', lineHeight: 1.5, marginBottom: 'var(--space-4)', maxWidth: 560 }}>
                                Todavía no hay ninguna cuenta vinculada. Al conectar te vamos a llevar a Mercado Libre
                                para que autorices con el usuario de la concesionaria; después volvés solo a esta pantalla.
                            </p>
                            <Button variant="primary" onClick={conectar} loading={conectando} disabled={!configurada}>
                                <Plug size={16} /> Conectar con Mercado Libre
                            </Button>
                        </div>
                    )}

                    {/* El último error es lo que avisa que ML dejó de aceptar el permiso:
                        se muestra completo porque en la tabla va recortado. */}
                    {cuenta?.ultimoError && (
                        <div style={{
                            display: 'flex', gap: 'var(--space-3)', alignItems: 'flex-start',
                            padding: 'var(--space-3)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)',
                            background: 'var(--bg-secondary)', marginTop: 'var(--space-4)',
                        }}>
                            <AlertTriangle size={16} style={{ color: 'var(--danger)', flexShrink: 0, marginTop: 2 }} />
                            <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                                Mercado Libre rechazó el último pedido: <span className="text-danger">{cuenta.ultimoError}</span>.
                                Si el permiso venció o lo revocaron desde Mercado Libre, tocá <strong>Volver a autorizar</strong>.
                            </p>
                        </div>
                    )}

                    {/* Datos de la app de ML: la Redirect URI se calcula con el origen real
                        del sitio, así no hay que adivinarla al configurar el portal. */}
                    <div style={{ marginTop: 'var(--space-4)', padding: '0.85rem', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', background: 'var(--bg-secondary)' }}>
                        <div style={{ fontSize: '0.8rem', fontWeight: 700, marginBottom: '0.45rem', display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--text-primary)' }}>
                            <Link2 size={14} /> Redirect URI (pegala en la app de Mercado Libre)
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                            <code style={{ flex: 1, fontSize: '0.75rem', padding: '0.45rem 0.55rem', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'var(--bg-card)', overflowX: 'auto', whiteSpace: 'nowrap' }}>
                                {redirectUriMl()}
                            </code>
                            <Button type="button" variant="secondary" size="sm" onClick={copiarRedirect}>
                                <Copy size={14} /> Copiar
                            </Button>
                        </div>
                        <button
                            type="button"
                            onClick={() => setPasosVisibles(v => !v)}
                            style={{ marginTop: '0.6rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem', background: 'transparent', border: 'none', padding: 0, color: 'var(--accent)', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600 }}
                        >
                            {pasosVisibles ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                            ¿Cómo creo la app en Mercado Libre? (4 pasos)
                        </button>
                        {pasosVisibles && (
                            <ol style={{ margin: '0.5rem 0 0', paddingLeft: '1.2rem', fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.65 }}>
                                <li>
                                    Entrá a{' '}
                                    <a
                                        href="https://developers.mercadolibre.com.ar"
                                        target="_blank"
                                        rel="noreferrer"
                                        style={{ color: 'var(--accent-2)', display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}
                                    >
                                        developers.mercadolibre.com.ar <ExternalLink size={11} />
                                    </a>{' '}
                                    con el usuario de la concesionaria y creá una aplicación.
                                </li>
                                <li>Pegá la Redirect URI de arriba en el campo <strong>URI de redirect</strong> de la app.</li>
                                <li>En notificaciones, suscribí los topics <strong>questions</strong> e <strong>items</strong>.</li>
                                <li>Copiá el <strong>App ID</strong> y el <strong>Secret Key</strong> y cargalos en el servidor como ML_CLIENT_ID y ML_CLIENT_SECRET.</li>
                            </ol>
                        )}
                    </div>
                </>
            )}

            <ConfirmDialog
                isOpen={!!desvinculando}
                title="Desvincular Mercado Libre"
                message={desvinculando
                    ? `¿Desvincular la cuenta "${desvinculando.nickname || desvinculando.mlUserId}"? Las publicaciones siguen vivas en Mercado Libre, pero el sistema deja de sincronizar precios y de traer preguntas. Para volver a usarla vas a tener que autorizarla de nuevo.`
                    : ''}
                confirmLabel="Desvincular"
                cancelLabel="Cancelar"
                type="danger"
                onConfirm={confirmarDesvincular}
                onCancel={() => setDesvinculando(null)}
                loading={desvinculandoBusy}
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

            {/* WhatsApp: sólo administración (vincula el número de la concesionaria). */}
            {isAdmin && <CuentasWhatsapp />}

            {/* Mercado Libre: sólo administración (autoriza la cuenta por OAuth). */}
            {isAdmin && <CuentasMercadoLibre />}
        </div>
    );
};

export default ConfiguracionPage;
