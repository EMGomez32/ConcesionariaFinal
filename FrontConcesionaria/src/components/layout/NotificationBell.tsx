import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Bell, AlertTriangle, Clock, Bookmark, Wrench, Car, CalendarClock, ShieldCheck, Inbox, UserRoundCheck, X } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { reportesApi } from '../../api/reportes.api';
import { dashboardKeys } from '../../hooks/useDashboard';

/**
 * Campanita del TopBar: centro de notificaciones. Muestra, desde cualquier
 * pantalla, las señales accionables (mora, cuotas/reservas por vencer, turnos de
 * taller, stock estancado) que hoy sólo estaban en el Dashboard.
 *
 * Admin Y VENDEDOR. Antes era sólo admin porque el resumen incluía señales de
 * capital (stock estancado, mora) que el backend reserva a admin. Ahora el
 * endpoint es role-aware: al vendedor puro le devuelve SÓLO lo suyo —las
 * atenciones que el sistema le cerró sin cerrar, sus seguimientos, sus consultas—
 * y omite todo lo demás. Por eso el componente puede renderizar para los dos sin
 * mostrarle a nadie algo que su API no le daría.
 *
 * La alerta "dejaste N atenciones sin cerrar" vive acá y no en un canal nuevo:
 * es donde el vendedor ya mira, y se apaga sola al pasar el corte del día
 * siguiente (el backend la deriva de `cerradaAutomaticamente`, no la persiste).
 */
const NotificationBell = () => {
    const { user } = useAuthStore();
    const isAdmin = !!(user?.roles?.includes('admin') || user?.roles?.includes('super_admin'));
    const esVendedor = !!user?.roles?.includes('vendedor');
    const puedeVer = isAdmin || esVendedor;
    const [open, setOpen] = useState(false);
    const [pos, setPos] = useState<{ top: number; right: number }>({ top: 60, right: 16 });
    const btnRef = useRef<HTMLButtonElement>(null);

    // Un solo request de conteos (endpoint liviano); se refresca cada 5 min para
    // que la campanita esté al día sin que el usuario recargue.
    const { data } = useQuery({
        queryKey: dashboardKeys.alertasResumen(),
        queryFn: () => reportesApi.alertasResumen(),
        enabled: puedeVer,
        staleTime: 1000 * 60 * 2,
        refetchInterval: 1000 * 60 * 5,
    });

    // Escape cierra el panel.
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open]);

    if (!puedeVer) return null;

    // Mismos tokens que las cards de "Acciones del día" del Dashboard: la misma
    // señal debe verse del mismo color en ambas superficies (y virar en dark,
    // cosa que los hex hardcodeados no hacían).
    // Las señales del tenant sólo se arman cuando el backend las mandó
    // (`alcance: 'tenant'`). Con `alcance: 'vendedor'` esos campos vienen
    // `undefined` y las filas ni se construyen: nada de renderizar un "0" que
    // sugiera que el dato existe y está en cero.
    const soloLoMio = data?.alcance === 'vendedor';
    const items = data ? [
        // La alerta del cierre de fin de día va PRIMERA: es trabajo que el
        // vendedor dejó a medias ayer y lo primero que tiene que resolver hoy.
        // La etiqueta sigue al `alcance`: con 'tenant' el conteo es de TODO el
        // salón (vista del admin), y rotularlo "sin cerrar por vos" le atribuía a
        // quien mira el trabajo a medias de doce vendedores.
        { key: 'atenciones', label: soloLoMio ? 'Atenciones que cerró el sistema (sin cerrar por vos)' : 'Atenciones que cerró el sistema (del equipo)', count: data.atencionesSinCerrar ?? 0, icon: UserRoundCheck, color: 'var(--danger)', to: '/atenciones' },
        { key: 'consultas', label: 'Consultas sin atender', count: data.consultas ?? 0, icon: Inbox, color: 'var(--danger)', to: '/consultas' },
        { key: 'seguimientos', label: `Seguimientos CRM (${data.dias} días)`, count: data.seguimientos ?? 0, icon: CalendarClock, color: 'var(--info)', to: '/seguimientos' },
        ...(soloLoMio ? [] : [
            { key: 'mora', label: 'Cuotas en mora', count: data.mora ?? 0, icon: AlertTriangle, color: 'var(--danger)', to: '/reportes?tab=mora' },
            { key: 'proximos', label: `Cuotas vencen en ${data.dias} días`, count: data.proximos ?? 0, icon: Clock, color: 'var(--warning)', to: '/reportes?tab=proximos' },
            { key: 'reservas', label: `Reservas vencen en ${data.dias} días`, count: data.reservas ?? 0, icon: Bookmark, color: 'var(--warning)', to: '/reservas' },
            { key: 'turnos', label: `Turnos de taller (${data.dias} días)`, count: data.turnos ?? 0, icon: Wrench, color: 'var(--info)', to: '/postventa?tab=agenda' },
            { key: 'documentacion', label: 'Documentación por vencer (VTV/seguro)', count: data.documentacion ?? 0, icon: ShieldCheck, color: 'var(--warning)', to: '/reportes?tab=documentacion' },
            { key: 'estancados', label: `Unidades estancadas (+${data.umbral ?? 60} días)`, count: data.estancados ?? 0, icon: Car, color: 'var(--warning)', to: '/vehiculos' },
        ]),
    ].filter(i => i.count > 0) : [];
    const total = data?.total ?? 0;

    const toggle = () => {
        if (!open && btnRef.current) {
            const r = btnRef.current.getBoundingClientRect();
            setPos({ top: r.bottom + 8, right: Math.max(8, window.innerWidth - r.right) });
        }
        setOpen(o => !o);
    };

    return (
        <>
            <button ref={btnRef} className="icon-button" onClick={toggle} title="Notificaciones" aria-label="Notificaciones">
                <Bell size={18} />
                {total > 0 && <span className="notif-badge">{total > 9 ? '9+' : total}</span>}
            </button>

            {open && createPortal(
                <>
                    <div style={{ position: 'fixed', inset: 0, zIndex: 1999 }} onClick={() => setOpen(false)} />
                    <div className="notif-panel" style={{ position: 'fixed', top: pos.top, right: pos.right, zIndex: 2000 }}>
                        <div className="notif-panel-head">
                            <span>Notificaciones</span>
                            <button className="notif-close" onClick={() => setOpen(false)} aria-label="Cerrar"><X size={16} /></button>
                        </div>
                        {items.length === 0 ? (
                            <div className="notif-empty">Todo al día. No hay alertas pendientes. ✓</div>
                        ) : (
                            <div className="notif-list">
                                {items.map(i => (
                                    <Link key={i.key} to={i.to} className="notif-item" onClick={() => setOpen(false)}>
                                        {/* color-mix (no `${color}1a`): funciona con var() y con hex; el
                                            truco del alfa-hex sólo era válido para el color literal. */}
                                        <span className="notif-item-icon" style={{ background: `color-mix(in srgb, ${i.color} 14%, transparent)`, color: i.color }}><i.icon size={16} /></span>
                                        <span className="notif-item-label">{i.label}</span>
                                        <span className="notif-item-count" style={{ color: i.color }}>{i.count}</span>
                                    </Link>
                                ))}
                            </div>
                        )}
                        <Link to="/" className="notif-foot" onClick={() => setOpen(false)}>Ver el panel completo →</Link>
                    </div>
                </>,
                document.body,
            )}

            <style>{`
                .notif-badge {
                    position: absolute; top: 3px; right: 2px;
                    min-width: 16px; height: 16px; padding: 0 3px;
                    background: var(--accent-2); color: var(--text-white);
                    font-size: var(--text-3xs); font-weight: 800; line-height: 16px;
                    text-align: center; border-radius: var(--radius-pill);
                    border: 2px solid var(--bg-card);
                }
                .notif-panel {
                    width: 330px; max-width: calc(100vw - 24px);
                    background: var(--bg-card); border: 1px solid var(--border);
                    border-radius: var(--radius-lg);
                    box-shadow: var(--shadow-xl);
                    overflow: hidden;
                }
                .notif-panel-head {
                    display: flex; align-items: center; justify-content: space-between;
                    padding: 0.7rem 1rem; border-bottom: 1px solid var(--border);
                    font-weight: 700; font-size: var(--text-base); color: var(--text-primary);
                }
                .notif-close { color: var(--text-muted); display: flex; background: transparent; border: none; cursor: pointer; }
                .notif-close:hover { color: var(--text-primary); }
                .notif-empty { padding: 1.5rem 1rem; text-align: center; color: var(--text-secondary); font-size: var(--text-sm); }
                .notif-list { display: flex; flex-direction: column; max-height: 60vh; overflow-y: auto; }
                .notif-item {
                    display: flex; align-items: center; gap: 0.75rem;
                    padding: 0.6rem 1rem; text-decoration: none; color: var(--text-primary);
                    border-bottom: 1px solid var(--border); transition: background var(--duration-fast);
                }
                .notif-item:hover { background: var(--bg-secondary); }
                .notif-item-icon { width: 30px; height: 30px; border-radius: var(--radius-sm); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
                .notif-item-label { flex: 1; font-size: var(--text-sm); }
                .notif-item-count { font-weight: 800; font-size: var(--text-base); }
                .notif-foot { display: block; text-align: center; padding: 0.6rem; font-size: var(--text-sm); color: var(--accent); text-decoration: none; }
                .notif-foot:hover { background: var(--bg-secondary); }
            `}</style>
        </>
    );
};

export default NotificationBell;
