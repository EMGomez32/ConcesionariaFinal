import { useCallback, useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Copy, Download, ShieldCheck, ShieldAlert, KeyRound } from 'lucide-react';
import Button from '../ui/Button';
import Input from '../ui/Input';
import { useAuthStore } from '../../store/authStore';
import { useUIStore } from '../../store/uiStore';
import { getApiErrorMessage } from '../../utils/error';
import { mfaApi, type MfaStatus } from '../../api/mfa.api';

type Paso = 'inicio' | 'password' | 'escanear' | 'codigos' | 'desactivar' | 'regenerar';

interface Props {
    /** Se llama cuando el 2FA quedó activo y el usuario ya guardó sus códigos (la sesión ya se renovó). */
    onActivado?: () => void;
}

/**
 * Gestión del 2FA (TOTP): activar con QR, ver el estado, regenerar códigos de recuperación y desactivar.
 * Lo usan la pestaña "Seguridad" de Configuración y la pantalla obligatoria /activar-2fa.
 */
export default function DosFactores({ onActivado }: Props) {
    const { addToast } = useUIStore();
    const setAuth = useAuthStore((s) => s.setAuth);

    const [estado, setEstado] = useState<MfaStatus | null>(null);
    const [cargando, setCargando] = useState(true);
    const [paso, setPaso] = useState<Paso>('inicio');
    const [trabajando, setTrabajando] = useState(false);

    const [password, setPassword] = useState('');
    const [codigo, setCodigo] = useState('');
    const [secreto, setSecreto] = useState('');
    const [otpauth, setOtpauth] = useState('');
    const [codigosRecuperacion, setCodigosRecuperacion] = useState<string[]>([]);
    const [guardeLosCodigos, setGuardeLosCodigos] = useState(false);
    const [usarRecuperacion, setUsarRecuperacion] = useState(false);

    const cargar = useCallback(async () => {
        setCargando(true);
        try {
            setEstado(await mfaApi.status());
        } catch (err) {
            addToast(getApiErrorMessage(err, 'No se pudo cargar el estado del 2FA'), 'error');
        } finally {
            setCargando(false);
        }
    }, [addToast]);

    useEffect(() => { void cargar(); }, [cargar]);

    const volver = () => {
        setPaso('inicio');
        setPassword('');
        setCodigo('');
        setUsarRecuperacion(false);
    };

    const iniciar = async () => {
        if (!password) { addToast('Ingresá tu contraseña actual', 'error'); return; }
        setTrabajando(true);
        try {
            const s = await mfaApi.setup(password);
            setSecreto(s.secreto);
            setOtpauth(s.otpauthUrl);
            setPassword('');
            setCodigo('');
            setPaso('escanear');
        } catch (err) {
            addToast(getApiErrorMessage(err, 'No se pudo iniciar la configuración'), 'error');
        } finally {
            setTrabajando(false);
        }
    };

    const activar = async () => {
        if (!codigo.trim()) { addToast('Ingresá el código de 6 dígitos de tu app', 'error'); return; }
        setTrabajando(true);
        try {
            const r = await mfaApi.enable(codigo);
            // Las sesiones anteriores se cerraron en el servidor: se adopta la nueva ya mismo.
            setAuth(r.user, r.tokens.access, r.tokens.refresh);
            setCodigosRecuperacion(r.codigosRecuperacion);
            setSecreto('');
            setOtpauth('');
            setCodigo('');
            setGuardeLosCodigos(false);
            setPaso('codigos');
            await cargar();
        } catch (err) {
            addToast(getApiErrorMessage(err, 'El código es incorrecto o venció'), 'error');
        } finally {
            setTrabajando(false);
        }
    };

    const regenerar = async () => {
        if (!password || !codigo.trim()) { addToast('Ingresá tu contraseña y el código de tu app', 'error'); return; }
        setTrabajando(true);
        try {
            const r = await mfaApi.regenerarCodigos(password, codigo);
            setCodigosRecuperacion(r.codigosRecuperacion);
            setGuardeLosCodigos(false);
            setPassword('');
            setCodigo('');
            setPaso('codigos');
            await cargar();
        } catch (err) {
            addToast(getApiErrorMessage(err, 'No se pudieron regenerar los códigos'), 'error');
        } finally {
            setTrabajando(false);
        }
    };

    const desactivar = async () => {
        if (!password || !codigo.trim()) { addToast('Ingresá tu contraseña y un código', 'error'); return; }
        setTrabajando(true);
        try {
            await mfaApi.disable(password, usarRecuperacion ? { recoveryCode: codigo } : { code: codigo });
            addToast('Verificación en dos pasos desactivada', 'success');
            volver();
            await cargar();
        } catch (err) {
            addToast(getApiErrorMessage(err, 'No se pudo desactivar'), 'error');
        } finally {
            setTrabajando(false);
        }
    };

    const copiarCodigos = () => {
        void navigator.clipboard.writeText(codigosRecuperacion.join('\n'))
            .then(() => addToast('Códigos copiados', 'success'))
            .catch(() => addToast('No se pudo copiar: seleccionalos y copialos a mano', 'error'));
    };

    const descargarCodigos = () => {
        const blob = new Blob(
            [`AUTENZA — códigos de recuperación del 2FA\nCada código sirve UNA sola vez.\n\n${codigosRecuperacion.join('\n')}\n`],
            { type: 'text/plain' },
        );
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'autenza-codigos-recuperacion.txt';
        a.click();
        URL.revokeObjectURL(url);
    };

    const terminarCodigos = () => {
        setCodigosRecuperacion([]);
        setPaso('inicio');
        onActivado?.();
    };

    if (cargando && !estado) {
        return <p style={{ color: 'var(--text-muted)' }}>Cargando…</p>;
    }

    // ── Códigos de recuperación (se muestran UNA vez) ─────────────────────────
    if (paso === 'codigos') {
        return (
            <div>
                <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1rem', fontWeight: 700 }}>
                    <KeyRound size={18} /> Guardá tus códigos de recuperación
                </h3>
                <p style={{ color: 'var(--text-secondary)', margin: '0.5rem 0 1rem' }}>
                    Si perdés tu teléfono, estos códigos son la <strong>única</strong> forma de entrar sin tu app.
                    Cada uno sirve <strong>una sola vez</strong>. No se vuelven a mostrar: guardalos en un lugar seguro
                    (un gestor de contraseñas, o impresos).
                </p>
                <div
                    style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0.5rem', fontFamily: 'monospace', fontSize: '1.05rem', padding: '1rem', border: '1px dashed var(--border)', borderRadius: 8 }}
                    aria-label="Códigos de recuperación"
                >
                    {codigosRecuperacion.map((c) => <span key={c}>{c}</span>)}
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', margin: '1rem 0', flexWrap: 'wrap' }}>
                    <Button variant="outline" onClick={copiarCodigos}><Copy size={16} /> Copiar</Button>
                    <Button variant="outline" onClick={descargarCodigos}><Download size={16} /> Descargar</Button>
                </div>
                <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '1rem' }}>
                    <input type="checkbox" checked={guardeLosCodigos} onChange={(e) => setGuardeLosCodigos(e.target.checked)} />
                    Ya guardé mis códigos de recuperación
                </label>
                <Button variant="primary" disabled={!guardeLosCodigos} onClick={terminarCodigos}>Listo</Button>
            </div>
        );
    }

    // ── Activar: escanear el QR y confirmar ───────────────────────────────────
    if (paso === 'escanear') {
        return (
            <div>
                <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>1. Escaneá el código QR</h3>
                <p style={{ color: 'var(--text-secondary)', margin: '0.5rem 0' }}>
                    Abrí tu app de autenticación (Google Authenticator, Microsoft Authenticator, Authy, 1Password…) y escaneá este código.
                </p>
                <div style={{ background: '#fff', padding: 12, display: 'inline-block', borderRadius: 8 }}>
                    <QRCodeSVG value={otpauth} size={176} />
                </div>
                <p style={{ color: 'var(--text-muted)', margin: '0.75rem 0 0.25rem', fontSize: '0.85rem' }}>
                    ¿No podés escanear? Ingresá esta clave a mano en la app:
                </p>
                <code style={{ display: 'block', wordBreak: 'break-all', userSelect: 'all', marginBottom: '1rem' }}>{secreto}</code>

                <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>2. Ingresá el código de 6 dígitos</h3>
                <div style={{ maxWidth: 260, margin: '0.5rem 0 1rem' }}>
                    <Input
                        dense label="Código de la app" type="text" inputMode="numeric" autoComplete="one-time-code"
                        maxLength={7} value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="123456"
                    />
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <Button variant="primary" loading={trabajando} onClick={activar}>Activar</Button>
                    <Button variant="ghost" onClick={volver}>Cancelar</Button>
                </div>
            </div>
        );
    }

    // ── Formularios que piden contraseña (+ código) ───────────────────────────
    if (paso === 'password' || paso === 'regenerar' || paso === 'desactivar') {
        const titulo = paso === 'password' ? 'Activar la verificación en dos pasos'
            : paso === 'regenerar' ? 'Generar códigos de recuperación nuevos' : 'Desactivar la verificación en dos pasos';
        const accion = paso === 'password' ? iniciar : paso === 'regenerar' ? regenerar : desactivar;
        const pideCodigo = paso !== 'password';
        return (
            <div style={{ maxWidth: 420 }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.5rem' }}>{titulo}</h3>
                <p style={{ color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
                    {paso === 'regenerar' && 'Los códigos anteriores dejan de valer. '}
                    Por seguridad, confirmá tu contraseña actual{pideCodigo ? ' y un código' : ''}.
                </p>
                <Input dense label="Contraseña actual" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
                {pideCodigo && (
                    <>
                        <Input
                            dense label={usarRecuperacion ? 'Código de recuperación' : 'Código de la app'} type="text"
                            autoComplete="one-time-code" value={codigo} onChange={(e) => setCodigo(e.target.value)}
                            placeholder={usarRecuperacion ? 'ABCDE-FGHJK' : '123456'}
                        />
                        {paso === 'desactivar' && (
                            <button type="button" className="btn btn-ghost" style={{ padding: 0 }} onClick={() => { setUsarRecuperacion((u) => !u); setCodigo(''); }}>
                                {usarRecuperacion ? 'Usar el código de mi app' : 'Usar un código de recuperación'}
                            </button>
                        )}
                    </>
                )}
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                    <Button variant={paso === 'desactivar' ? 'danger' : 'primary'} loading={trabajando} onClick={accion}>
                        {paso === 'password' ? 'Continuar' : paso === 'regenerar' ? 'Generar códigos' : 'Desactivar'}
                    </Button>
                    <Button variant="ghost" onClick={volver}>Cancelar</Button>
                </div>
            </div>
        );
    }

    // ── Inicio: estado actual ─────────────────────────────────────────────────
    const activo = !!estado?.activo;
    return (
        <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
                {activo ? <ShieldCheck size={22} color="var(--success, #16a34a)" /> : <ShieldAlert size={22} color="var(--warning, #f59e0b)" />}
                <div>
                    <strong>Verificación en dos pasos: {activo ? 'activada' : 'desactivada'}</strong>
                    {estado?.obligatorio && !activo && (
                        <div style={{ color: 'var(--danger, #dc2626)', fontSize: '0.9rem' }}>Tu rol la exige: tenés que activarla para continuar.</div>
                    )}
                </div>
            </div>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                {activo
                    ? `Al iniciar sesión, además de tu contraseña se pide un código de tu app. Te quedan ${estado?.codigosRestantes ?? 0} códigos de recuperación.`
                    : 'Protegé tu cuenta con un segundo factor: aunque alguien conozca tu contraseña, no puede entrar sin tu teléfono.'}
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {!activo && <Button variant="primary" onClick={() => setPaso('password')}>Activar</Button>}
                {activo && <Button variant="outline" onClick={() => setPaso('regenerar')}>Generar códigos de recuperación nuevos</Button>}
                {activo && !estado?.obligatorio && <Button variant="danger" onClick={() => setPaso('desactivar')}>Desactivar</Button>}
            </div>
            {activo && (estado?.codigosRestantes ?? 0) <= 2 && (
                <p style={{ color: 'var(--warning, #f59e0b)', marginTop: '1rem' }}>
                    Te quedan pocos códigos de recuperación. Generá nuevos antes de quedarte sin ninguno.
                </p>
            )}
        </div>
    );
}
