import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, Phone, MessageCircle, Mail, MapPin, User, ChevronRight, RefreshCw, Check } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { reportesApi, type ProximoSeguimientoItem } from '../../api/reportes.api';
import { seguimientosApi } from '../../api/seguimientos.api';
import { dashboardKeys } from '../../hooks/useDashboard';
import { useUIStore } from '../../store/uiStore';
import { getErrorMessage } from '../../utils/getErrorMessage';
import { formatFecha } from '../../utils/fecha';
import { waLink } from '../../utils/whatsapp';
import PageTitle from '../../components/ui/PageTitle';

// Etiqueta + ícono por tipo de contacto (mismo criterio que la bitácora del cliente).
const TIPO: Record<string, { label: string; icon: LucideIcon }> = {
    llamada: { label: 'Llamada', icon: Phone },
    whatsapp: { label: 'WhatsApp', icon: MessageCircle },
    email: { label: 'Email', icon: Mail },
    visita: { label: 'Visita', icon: MapPin },
    otro: { label: 'Otro', icon: User },
};

// "Hoy" en fecha LOCAL (no toISOString, que de noche en UTC-3 ya es "mañana"): así el
// badge refleja el día del usuario y coincide con los conteos del backend, que arma
// inicioHoy con getFullYear/getMonth/getDate (la TZ del server, Argentina). `vencido`
// viene autoritativo del backend; esto sólo separa "Hoy" de "Próximo".
const hoyLocal = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const OPCIONES_DIAS = [7, 15, 30];

const SeguimientosPage = () => {
    const [dias, setDias] = useState(7);
    // Ids con un "marcar hecho" en vuelo: el disabled es POR FILA (un solo useMutation
    // comparte marcar.variables con la última llamada, así que no sirve para eso).
    const [marcando, setMarcando] = useState<Set<number>>(new Set());
    const qc = useQueryClient();
    const { addToast } = useUIStore();

    const { data, isLoading, isError, refetch, isFetching } = useQuery({
        queryKey: ['seguimientos', 'proximos', dias],
        queryFn: () => reportesApi.proximosSeguimientos({ dias }),
        staleTime: 1000 * 60 * 2,
    });

    // Marcar el próximo contacto como realizado: sale de la agenda y baja los
    // conteos del Dashboard y la campanita (por eso también se invalidan).
    const marcar = useMutation({
        mutationFn: (id: number) => seguimientosApi.marcarProximo(id, true),
        onMutate: (id) => setMarcando((s) => new Set(s).add(id)),
        onSuccess: () => {
            addToast('Contacto marcado como realizado', 'success');
            qc.invalidateQueries({ queryKey: ['seguimientos', 'proximos'] });
            qc.invalidateQueries({ queryKey: dashboardKeys.alertas() });
            qc.invalidateQueries({ queryKey: dashboardKeys.alertasResumen() });
        },
        onError: (e) => addToast(getErrorMessage(e, 'No se pudo marcar el contacto'), 'error'),
        onSettled: (_d, _e, id) => setMarcando((s) => { const n = new Set(s); n.delete(id); return n; }),
    });

    const items = data?.items ?? [];
    const resumen = data?.resumen;
    const hoyStr = hoyLocal();

    const estadoDe = (s: ProximoSeguimientoItem): { label: string; color: string } => {
        if (s.vencido) return { label: 'Vencido', color: 'var(--danger, #dc2626)' };
        if (s.proximoContacto === hoyStr) return { label: 'Hoy', color: 'var(--warning, #f59e0b)' };
        return { label: 'Próximo', color: '#0ea5e9' };
    };

    const mensajeWa = (s: ProximoSeguimientoItem) =>
        `Hola ${s.cliente}, ¿cómo estás? Te escribo para retomar el contacto que teníamos pendiente.`;

    return (
        <div className="seg-page">
            <PageTitle title="Agenda de seguimientos" />

            <div className="seg-head">
                <div className="flex items-center gap-3">
                    <div className="seg-head-icon"><CalendarClock size={22} /></div>
                    <div>
                        <h1 className="seg-title">Agenda de seguimientos</h1>
                        <p className="seg-sub">
                            Contactos del CRM por atender: vencidos recientes, de hoy y próximos.
                        </p>
                    </div>
                </div>
                <div className="seg-dias" role="group" aria-label="Ventana en días">
                    {OPCIONES_DIAS.map((d) => (
                        <button
                            key={d}
                            type="button"
                            className={`seg-dia-btn ${dias === d ? 'is-active' : ''}`}
                            onClick={() => setDias(d)}
                        >
                            ±{d} días
                        </button>
                    ))}
                </div>
            </div>

            {/* Resumen */}
            {resumen && (
                <div className="seg-chips">
                    <span className="seg-chip" style={{ color: 'var(--danger, #dc2626)' }}>
                        <strong>{resumen.vencidos}</strong> vencidos
                    </span>
                    <span className="seg-chip" style={{ color: 'var(--warning, #f59e0b)' }}>
                        <strong>{resumen.hoy}</strong> hoy
                    </span>
                    <span className="seg-chip" style={{ color: 'var(--text-secondary)' }}>
                        <strong>{resumen.cantidad}</strong> en la ventana
                    </span>
                    {data?.ventana && (
                        <span className="seg-chip seg-chip-range">
                            {formatFecha(data.ventana.desde)} — {formatFecha(data.ventana.hasta)}
                        </span>
                    )}
                    <button className="seg-refresh" type="button" onClick={() => refetch()} disabled={isFetching} title="Actualizar">
                        <RefreshCw size={15} className={isFetching ? 'seg-spin' : ''} />
                    </button>
                </div>
            )}

            {/* Contenido */}
            {isLoading ? (
                <div className="seg-list">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="card seg-item">
                            <span className="skeleton skeleton-text" style={{ width: '40%' }} />
                            <span className="skeleton skeleton-text" style={{ width: '70%', marginTop: '0.5rem' }} />
                        </div>
                    ))}
                </div>
            ) : isError ? (
                <div className="card glass seg-empty">
                    No se pudo cargar la agenda.{' '}
                    <button className="btn btn-secondary btn-sm" type="button" onClick={() => refetch()}>Reintentar</button>
                </div>
            ) : items.length === 0 ? (
                <div className="card glass seg-empty">
                    <CalendarClock size={30} style={{ opacity: 0.4, marginBottom: '0.5rem' }} />
                    <div>No hay seguimientos agendados en esta ventana. ✓</div>
                    <p className="seg-empty-hint">
                        Agendá un próximo contacto desde la pestaña <strong>Seguimiento</strong> de un cliente.
                    </p>
                </div>
            ) : (
                <>
                    {resumen && resumen.cantidad > resumen.mostrados && (
                        <p className="seg-trunc">
                            Mostrando los primeros {resumen.mostrados} de {resumen.cantidad}. Acotá la ventana para ver menos.
                        </p>
                    )}
                    <div className="seg-list">
                        {items.map((s) => {
                            const estado = estadoDe(s);
                            const t = TIPO[s.tipo] ?? TIPO.otro;
                            const TipoIcon = t.icon;
                            const wa = waLink(s.telefono, mensajeWa(s));
                            return (
                                <div key={s.seguimientoId} className="card seg-item" style={{ borderLeft: `3px solid ${estado.color}` }}>
                                    <div className="seg-item-main">
                                        <div className="seg-item-top">
                                            <span className="seg-estado" style={{ background: `color-mix(in srgb, ${estado.color} 14%, transparent)`, color: estado.color }}>
                                                {estado.label}
                                            </span>
                                            <span className="seg-fecha">{formatFecha(s.proximoContacto)}</span>
                                            <span className="seg-tipo"><TipoIcon size={13} /> {t.label}</span>
                                        </div>
                                        <Link to={`/clientes/${s.clienteId}`} className="seg-cliente">
                                            {s.cliente || 'Cliente'} <ChevronRight size={15} />
                                        </Link>
                                        {s.nota && <p className="seg-nota">{s.nota}</p>}
                                        {s.vendedor && <span className="seg-vendedor">Agendado por {s.vendedor}</span>}
                                    </div>
                                    <div className="seg-item-actions">
                                        <button
                                            className="btn btn-primary btn-sm"
                                            type="button"
                                            onClick={() => marcar.mutate(s.seguimientoId)}
                                            disabled={marcando.has(s.seguimientoId)}
                                            title="Marcar el próximo contacto como realizado"
                                        >
                                            <Check size={15} /> Hecho
                                        </button>
                                        {wa ? (
                                            <a className="btn btn-secondary btn-sm" href={wa} target="_blank" rel="noopener noreferrer">
                                                <MessageCircle size={15} /> WhatsApp
                                            </a>
                                        ) : (
                                            <button className="btn btn-secondary btn-sm" type="button" disabled title="El cliente no tiene un teléfono válido cargado">
                                                <MessageCircle size={15} /> WhatsApp
                                            </button>
                                        )}
                                        <Link to={`/clientes/${s.clienteId}`} className="btn btn-ghost btn-sm">Ver cliente</Link>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </>
            )}

            <style>{`
                .seg-page { max-width: 960px; }
                .seg-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; flex-wrap: wrap; margin-bottom: 1.25rem; }
                .seg-head-icon { width: 44px; height: 44px; border-radius: var(--radius-md, 0.6rem); display: flex; align-items: center; justify-content: center; background: color-mix(in srgb, #0ea5e9 16%, transparent); color: #0ea5e9; flex-shrink: 0; }
                .seg-title { margin: 0; font-size: 1.4rem; }
                .seg-sub { margin: 0.15rem 0 0; color: var(--text-secondary); font-size: 0.86rem; }
                .seg-dias { display: inline-flex; gap: 0.25rem; background: var(--bg-secondary); border: 1px solid var(--border); border-radius: var(--radius-pill, 999px); padding: 0.2rem; }
                .seg-dia-btn { border: none; background: transparent; color: var(--text-secondary); font-size: 0.78rem; font-weight: 700; padding: 0.35rem 0.7rem; border-radius: 999px; cursor: pointer; transition: background .15s, color .15s; }
                .seg-dia-btn.is-active { background: var(--accent); color: #fff; }
                .seg-chips { display: flex; align-items: center; gap: 0.9rem; flex-wrap: wrap; margin-bottom: 1rem; font-size: 0.85rem; }
                .seg-chip strong { font-size: 1.05rem; }
                .seg-chip-range { color: var(--text-muted); font-size: 0.8rem; }
                .seg-refresh { margin-left: auto; background: transparent; border: 1px solid var(--border); color: var(--text-secondary); border-radius: 8px; padding: 0.3rem 0.4rem; cursor: pointer; display: inline-flex; }
                .seg-refresh:hover:not(:disabled) { color: var(--text-primary); }
                .seg-refresh:disabled { opacity: 0.5; cursor: default; }
                .seg-spin { animation: seg-rot 0.8s linear infinite; }
                @keyframes seg-rot { to { transform: rotate(360deg); } }
                .seg-trunc { color: var(--text-muted); font-size: 0.8rem; margin: 0 0 0.6rem; }
                .seg-list { display: flex; flex-direction: column; gap: 0.7rem; }
                .seg-item { display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: 0.9rem 1.1rem; flex-wrap: wrap; }
                .seg-item-main { flex: 1; min-width: 220px; }
                .seg-item-top { display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; margin-bottom: 0.35rem; }
                .seg-estado { font-size: 0.68rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.04em; padding: 0.12rem 0.5rem; border-radius: 999px; }
                .seg-fecha { font-weight: 700; font-size: 0.9rem; color: var(--text-primary); }
                .seg-tipo { display: inline-flex; align-items: center; gap: 0.25rem; font-size: 0.78rem; color: var(--text-secondary); }
                .seg-cliente { display: inline-flex; align-items: center; gap: 0.15rem; font-weight: 700; color: var(--accent); text-decoration: none; font-size: 0.98rem; }
                .seg-cliente:hover { text-decoration: underline; }
                .seg-nota { margin: 0.3rem 0 0; color: var(--text-secondary); font-size: 0.85rem; white-space: pre-wrap; }
                .seg-vendedor { display: inline-block; margin-top: 0.3rem; font-size: 0.74rem; color: var(--text-muted); }
                .seg-item-actions { display: flex; align-items: center; gap: 0.5rem; flex-shrink: 0; }
                .seg-empty { text-align: center; padding: 2.5rem 1.5rem; color: var(--text-secondary); }
                .seg-empty-hint { margin: 0.5rem 0 0; font-size: 0.82rem; color: var(--text-muted); }
            `}</style>
        </div>
    );
};

export default SeguimientosPage;
