import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Bell, AlertTriangle, Clock, Bookmark, Wrench, Car, CalendarClock, ShieldCheck, X } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { reportesApi } from '../../api/reportes.api';
import { dashboardKeys } from '../../hooks/useDashboard';

/**
 * Campanita del TopBar: centro de notificaciones. Muestra, desde cualquier
 * pantalla, las señales accionables (mora, cuotas/reservas por vencer, turnos de
 * taller, stock estancado) que hoy sólo estaban en el Dashboard.
 *
 * Sólo admin: el resumen incluye stock-antiguedad (capital), admin-only en el
 * backend; para el resto el componente no renderiza nada (ni dispara la query).
 */
const NotificationBell = () => {
    const { user } = useAuthStore();
    const isAdmin = !!(user?.roles?.includes('admin') || user?.roles?.includes('super_admin'));
    const [open, setOpen] = useState(false);
    const [pos, setPos] = useState<{ top: number; right: number }>({ top: 60, right: 16 });
    const btnRef = useRef<HTMLButtonElement>(null);

    // Un solo request de conteos (endpoint liviano); se refresca cada 5 min para
    // que la campanita esté al día sin que el usuario recargue.
    const { data } = useQuery({
        queryKey: dashboardKeys.alertasResumen(),
        queryFn: () => reportesApi.alertasResumen(),
        enabled: isAdmin,
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

    if (!isAdmin) return null;

    const items = data ? [
        { key: 'mora', label: 'Cuotas en mora', count: data.mora, icon: AlertTriangle, color: 'var(--danger, #dc2626)', to: '/reportes?tab=mora' },
        { key: 'proximos', label: `Cuotas vencen en ${data.dias} días`, count: data.proximos, icon: Clock, color: 'var(--accent)', to: '/reportes?tab=proximos' },
        { key: 'reservas', label: `Reservas vencen en ${data.dias} días`, count: data.reservas, icon: Bookmark, color: '#8b5cf6', to: '/reservas' },
        { key: 'turnos', label: `Turnos de taller (${data.dias} días)`, count: data.turnos, icon: Wrench, color: 'var(--info)', to: '/postventa?tab=agenda' },
        { key: 'seguimientos', label: `Seguimientos CRM (${data.dias} días)`, count: data.seguimientos, icon: CalendarClock, color: '#0ea5e9', to: '/seguimientos' },
        { key: 'documentacion', label: 'Documentación por vencer (VTV/seguro)', count: data.documentacion, icon: ShieldCheck, color: '#ea580c', to: '/reportes?tab=documentacion' },
        { key: 'estancados', label: `Unidades estancadas (+${data.umbral} días)`, count: data.estancados, icon: Car, color: 'var(--warning)', to: '/vehiculos' },
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
                    background: var(--accent-2); color: #fff;
                    font-size: 0.62rem; font-weight: 800; line-height: 16px;
                    text-align: center; border-radius: 999px;
                    border: 2px solid var(--bg-card);
                }
                .notif-panel {
                    width: 330px; max-width: calc(100vw - 24px);
                    background: var(--bg-card); border: 1px solid var(--border);
                    border-radius: var(--radius-lg, 0.75rem);
                    box-shadow: 0 12px 44px rgba(0, 0, 0, 0.38);
                    overflow: hidden;
                }
                .notif-panel-head {
                    display: flex; align-items: center; justify-content: space-between;
                    padding: 0.7rem 1rem; border-bottom: 1px solid var(--border);
                    font-weight: 700; font-size: 0.9rem; color: var(--text-primary);
                }
                .notif-close { color: var(--text-muted); display: flex; background: transparent; border: none; cursor: pointer; }
                .notif-close:hover { color: var(--text-primary); }
                .notif-empty { padding: 1.5rem 1rem; text-align: center; color: var(--text-secondary); font-size: 0.85rem; }
                .notif-list { display: flex; flex-direction: column; max-height: 60vh; overflow-y: auto; }
                .notif-item {
                    display: flex; align-items: center; gap: 0.75rem;
                    padding: 0.6rem 1rem; text-decoration: none; color: var(--text-primary);
                    border-bottom: 1px solid var(--border); transition: background 0.15s;
                }
                .notif-item:hover { background: var(--bg-secondary); }
                .notif-item-icon { width: 30px; height: 30px; border-radius: 8px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
                .notif-item-label { flex: 1; font-size: 0.82rem; }
                .notif-item-count { font-weight: 800; font-size: 0.95rem; }
                .notif-foot { display: block; text-align: center; padding: 0.6rem; font-size: 0.78rem; color: var(--accent); text-decoration: none; }
                .notif-foot:hover { background: var(--bg-secondary); }
            `}</style>
        </>
    );
};

export default NotificationBell;
