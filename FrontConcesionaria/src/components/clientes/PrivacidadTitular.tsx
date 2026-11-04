import { useState } from 'react';
import { Download, ShieldCheck, ShieldOff, ShieldAlert, UserX, BellOff } from 'lucide-react';
import Button from '../ui/Button';
import Modal from '../ui/Modal';
import Textarea from '../ui/Textarea';
import Input from '../ui/Input';
import Badge from '../ui/Badge';
import { privacidadApi, CONSENTIMIENTO_CONTACTO, type ResultadoSupresion } from '../../api/privacidad.api';
import type { Cliente } from '../../types/cliente.types';
import { usePermisos } from '../../hooks/usePermisos';
import { useUIStore } from '../../store/uiStore';
import { getErrorMessage } from '../../utils/getErrorMessage';

/**
 * Sección "Privacidad" de la ficha del cliente (Ley 25.326, arts. 5, 14 y 16).
 *
 * Muestra en qué estado está el consentimiento de contacto (con el texto que se le
 * informó), si los datos están bloqueados o suprimidos, y las acciones que la ley le da
 * al titular: llevarse una copia de sus datos, revocar el consentimiento, bloquear y
 * suprimir. El servidor decide quién puede cada cosa (privacidad.routes.ts); acá sólo se
 * muestran los botones que el rol va a poder usar.
 */

/** dd/mm/aaaa en hora LOCAL: estos campos son instantes, no columnas de día. */
const fechaInstante = (v?: string | null) => (v ? new Date(v).toLocaleDateString('es-AR') : '-');

type Accion = 'revocar' | 'bloquear' | 'desbloquear' | 'suprimir' | null;

const MIN_MOTIVO = 5;

interface Props {
    cliente: Cliente;
    /** La ficha cambió (revocación, bloqueo, supresión parcial): recargarla. */
    onActualizado: () => void;
    /** Supresión total: la ficha ya no existe en los listados. */
    onSuprimidoTotal: () => void;
}

const PrivacidadTitular = ({ cliente, onActualizado, onSuprimidoTotal }: Props) => {
    const permisos = usePermisos();
    const { addToast } = useUIStore();
    const [accion, setAccion] = useState<Accion>(null);
    const [motivo, setMotivo] = useState('');
    const [confirmacion, setConfirmacion] = useState('');
    const [enCurso, setEnCurso] = useState(false);
    const [descargando, setDescargando] = useState(false);
    const [resultado, setResultado] = useState<ResultadoSupresion | null>(null);

    const suprimido = !!cliente.suprimidoEn;
    const bloqueado = !!cliente.bloqueadoEn;
    const revocado = !!cliente.consentimientoRevocadoEn;
    const textoInformado = cliente.consentimientoVersion === CONSENTIMIENTO_CONTACTO.version
        ? CONSENTIMIENTO_CONTACTO.texto
        : null;

    const abrir = (a: Accion) => { setMotivo(''); setConfirmacion(''); setAccion(a); };
    const cerrar = () => { if (!enCurso) setAccion(null); };

    const descargarInforme = async () => {
        setDescargando(true);
        try {
            const res = await privacidadApi.informe(cliente.id);
            const nombre = /filename="([^"]+)"/.exec(String(res.headers?.['content-disposition'] ?? ''))?.[1]
                ?? `datos-titular-${cliente.id}.json`;
            const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/json' }));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', nombre);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
            addToast('Informe descargado. Quedó registrado en la auditoría.', 'success');
        } catch (e) {
            addToast(getErrorMessage(e, 'No se pudo generar el informe del titular'), 'error');
        } finally {
            setDescargando(false);
        }
    };

    const ejecutar = async () => {
        const m = motivo.trim();
        setEnCurso(true);
        try {
            if (accion === 'revocar') {
                await privacidadApi.revocarConsentimiento(cliente.id, m || undefined);
                addToast('Revocación registrada: el cliente sale de la agenda de seguimientos.', 'success');
                setAccion(null);
                onActualizado();
            } else if (accion === 'bloquear') {
                await privacidadApi.bloquear(cliente.id, m);
                addToast('Datos bloqueados: no se lo va a contactar.', 'success');
                setAccion(null);
                onActualizado();
            } else if (accion === 'desbloquear') {
                await privacidadApi.desbloquear(cliente.id, m);
                addToast('Bloqueo levantado.', 'success');
                setAccion(null);
                onActualizado();
            } else if (accion === 'suprimir') {
                const r = await privacidadApi.suprimir(cliente.id, m);
                setAccion(null);
                setResultado(r);
            }
        } catch (e) {
            addToast(getErrorMessage(e, 'No se pudo completar la operación'), 'error');
        } finally {
            setEnCurso(false);
        }
    };

    const cerrarResultado = () => {
        const total = resultado?.modo === 'total';
        setResultado(null);
        if (total) onSuprimidoTotal(); else onActualizado();
    };

    const motivoValido = motivo.trim().length >= MIN_MOTIVO;
    const puedeConfirmar =
        accion === 'revocar' ? true
            : accion === 'suprimir' ? motivoValido && confirmacion === 'SUPRIMIR'
                : motivoValido;

    const TITULOS: Record<Exclude<Accion, null>, string> = {
        revocar: 'Registrar la revocación del consentimiento',
        bloquear: 'Bloquear los datos del titular',
        desbloquear: 'Levantar el bloqueo',
        suprimir: 'Suprimir los datos del titular',
    };

    return (
        <div className="info-section full-width">
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <ShieldCheck size={18} aria-hidden="true" /> Privacidad (Ley 25.326)
            </h3>

            {suprimido && (
                <div className="uploader-alert uploader-alert-error" role="status">
                    <span>
                        <strong>Datos suprimidos el {fechaInstante(cliente.suprimidoEn)}.</strong>{' '}
                        Lo que queda en la ficha se conserva sólo porque la ley obliga a guardarlo (operaciones con plata) y
                        está bloqueado: no se usa para contactarlo ni para nada más.
                    </span>
                </div>
            )}
            {!suprimido && bloqueado && (
                <div className="uploader-alert uploader-alert-error" role="status">
                    <span>
                        <strong>Datos bloqueados desde el {fechaInstante(cliente.bloqueadoEn)}.</strong>{' '}
                        No se lo contacta ni se le cargan datos nuevos. {cliente.bloqueoMotivo ? `Motivo: ${cliente.bloqueoMotivo}` : ''}
                    </span>
                </div>
            )}

            <div className="info-rows">
                <div className="info-row">
                    <BellOff size={16} aria-hidden="true" />
                    <span className="info-label">Consentimiento de contacto</span>
                    <span className="info-value">
                        {revocado ? (
                            <><Badge variant="danger">Revocado</Badge> el {fechaInstante(cliente.consentimientoRevocadoEn)}: no se lo contacta</>
                        ) : cliente.consentimientoContacto ? (
                            <><Badge variant="success">Otorgado</Badge> el {fechaInstante(cliente.consentimientoEn)}</>
                        ) : (
                            <span className="text-muted">No lo dio todavía (se pide en la atención, antes de cualquier interés real)</span>
                        )}
                    </span>
                </div>
                {cliente.consentimientoContacto && (
                    <div className="info-row">
                        <ShieldCheck size={16} aria-hidden="true" />
                        <span className="info-label">Texto informado</span>
                        <span className="info-value" style={{ whiteSpace: 'normal' }}>
                            {textoInformado
                                ? <>«{textoInformado}» <span className="text-muted">({cliente.consentimientoVersion})</span></>
                                : <span className="text-muted">Sin versión registrada (consentimiento anterior a que se guardara el texto)</span>}
                        </span>
                    </div>
                )}
            </div>

            {(permisos.privacidadGestionar || permisos.privacidadRevocarConsentimiento) && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '1rem' }}>
                    {permisos.privacidadGestionar && (
                        <Button variant="secondary" size="sm" onClick={descargarInforme} loading={descargando}
                            title="Copia de todo lo que la concesionaria guarda de esta persona, para entregarle (art. 14)">
                            <Download size={14} aria-hidden="true" /> Descargar sus datos
                        </Button>
                    )}
                    {permisos.privacidadRevocarConsentimiento && !suprimido && !revocado && (
                        <Button variant="secondary" size="sm" onClick={() => abrir('revocar')}>
                            <BellOff size={14} aria-hidden="true" /> Registrar que no quiere ser contactado
                        </Button>
                    )}
                    {permisos.privacidadGestionar && !suprimido && !bloqueado && (
                        <Button variant="secondary" size="sm" onClick={() => abrir('bloquear')}>
                            <ShieldAlert size={14} aria-hidden="true" /> Bloquear datos
                        </Button>
                    )}
                    {permisos.privacidadGestionar && !suprimido && bloqueado && (
                        <Button variant="secondary" size="sm" onClick={() => abrir('desbloquear')}>
                            <ShieldOff size={14} aria-hidden="true" /> Levantar bloqueo
                        </Button>
                    )}
                    {permisos.privacidadGestionar && !suprimido && (
                        <Button variant="danger" size="sm" onClick={() => abrir('suprimir')}>
                            <UserX size={14} aria-hidden="true" /> Suprimir datos
                        </Button>
                    )}
                </div>
            )}

            <Modal
                isOpen={accion !== null}
                onClose={cerrar}
                title={accion ? TITULOS[accion] : ''}
                subtitle={cliente.nombre}
                maxWidth="560px"
                footer={(
                    <>
                        <Button variant="secondary" onClick={cerrar} disabled={enCurso}>Cancelar</Button>
                        <Button variant={accion === 'suprimir' ? 'danger' : 'primary'} onClick={ejecutar} loading={enCurso} disabled={!puedeConfirmar}>
                            {accion === 'suprimir' ? 'Suprimir definitivamente' : 'Confirmar'}
                        </Button>
                    </>
                )}
            >
                <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
                    {accion === 'revocar' && (
                        <p style={{ margin: 0 }}>
                            El titular puede retirar su conformidad en cualquier momento (art. 5). Desde ahora sale de la agenda de
                            seguimientos y, si vuelve a interesarse por una unidad, la atención le va a pedir el consentimiento otra vez.
                        </p>
                    )}
                    {accion === 'bloquear' && (
                        <p style={{ margin: 0 }}>
                            Mientras dure el bloqueo no se lo contacta, no figura en la agenda y en la atención no se le pueden cargar
                            datos ni registrar interés. Se usa mientras se atiende un pedido de rectificación o supresión, o cuando el
                            titular se opone a que se usen sus datos. Lo puede levantar un administrador.
                        </p>
                    )}
                    {accion === 'desbloquear' && (
                        <p style={{ margin: 0 }}>
                            Levantalo sólo si el titular lo pidió o si terminó el trámite que lo justificaba. Queda registrado con el motivo.
                        </p>
                    )}
                    {accion === 'suprimir' && (
                        <>
                            <div className="uploader-alert uploader-alert-error" role="alert" style={{ margin: 0 }}>
                                <span>
                                    <strong>No se puede deshacer.</strong> Se borran sus datos de contacto, observaciones, notas de
                                    seguimiento, mensajes de la bandeja y los adjuntos de sus solicitudes de financiación (DNI, recibos).
                                </span>
                            </div>
                            <p style={{ margin: 0 }}>
                                Si tiene ventas, reservas, financiaciones, comprobantes o le vendió un auto a la concesionaria, la ley
                                obliga a conservar esos registros: en ese caso se conservan sólo los datos de identificación que exigen
                                y quedan bloqueados. La respuesta explica qué se conservó y por qué, para contestarle al titular.
                            </p>
                        </>
                    )}
                    <Textarea
                        dense
                        label={accion === 'revocar' ? 'Motivo o canal (opcional)' : 'Motivo (obligatorio)'}
                        placeholder={accion === 'revocar' ? 'Ej.: lo pidió por WhatsApp' : 'Ej.: pedido del titular por mail del 03/11'}
                        rows={3}
                        value={motivo}
                        onChange={(e) => setMotivo(e.target.value)}
                        maxLength={1000}
                        hint={accion !== 'revocar' && !motivoValido ? `Al menos ${MIN_MOTIVO} caracteres: queda en la auditoría.` : undefined}
                    />
                    {accion === 'suprimir' && (
                        <Input
                            dense
                            label="Para confirmar, escribí SUPRIMIR"
                            value={confirmacion}
                            onChange={(e) => setConfirmacion(e.target.value)}
                            autoComplete="off"
                            spellCheck={false}
                        />
                    )}
                </div>
            </Modal>

            <Modal
                isOpen={resultado !== null}
                onClose={cerrarResultado}
                title={resultado?.modo === 'total' ? 'Datos suprimidos' : 'Supresión parcial'}
                maxWidth="560px"
                footer={<Button onClick={cerrarResultado}>Entendido</Button>}
            >
                {resultado && (
                    <>
                        <p style={{ marginTop: 0 }}>{resultado.explicacion}</p>
                        {resultado.adjuntosBorrados > 0 && (
                            <p className="text-muted">Se borraron {resultado.adjuntosBorrados} adjunto(s) de solicitudes de financiación.</p>
                        )}
                        <p className="text-muted" style={{ marginBottom: 0 }}>
                            Si el pedido llegó por escrito, registralo (o cerralo) en Pedidos de titulares con esta respuesta.
                        </p>
                    </>
                )}
            </Modal>
        </div>
    );
};

export default PrivacidadTitular;
