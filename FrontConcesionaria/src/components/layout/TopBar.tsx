import { useAuthStore } from '../../store/authStore';
import { LogOut, User, Menu, Search } from 'lucide-react';
import Breadcrumbs from './Breadcrumbs';
import NotificationBell from './NotificationBell';
import { useCommandPaletteStore } from '../../store/commandPaletteStore';
import { performLogout } from '../../api/auth.api';

// La app es dark-first: el tema oscuro se fija en index.html (<html data-theme="dark">)
// desde el primer paint. No hay toggle de tema porque las pantallas usan colores
// fijos para fondo oscuro; habilitar el tema claro requiere tokenizar esas páginas
// (reemplazar text-white/bg-slate-* por var(--text-*)/var(--bg-*)) — follow-up.
const TopBar = ({ onMenuClick, showNotifications = true }: { onMenuClick?: () => void; showNotifications?: boolean }) => {
  const { user } = useAuthStore();
  const openPalette = useCommandPaletteStore((s) => s.open);

  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

  return (
    <header className="top-bar">
      <div className="top-bar-left">
        <button className="mobile-menu-btn" onClick={onMenuClick} aria-label="Abrir menú">
          <Menu size={22} />
        </button>
        <Breadcrumbs />
      </div>

      <div className="top-bar-actions">
        <button
          type="button"
          className="cmdk-trigger"
          onClick={openPalette}
          aria-label="Abrir buscador rápido"
        >
          <Search size={14} />
          <span className="cmdk-trigger-text">Buscar</span>
          <kbd className="cmdk-trigger-kbd">{isMac ? '⌘' : 'Ctrl'} K</kbd>
        </button>

        {showNotifications && (
          <div className="action-buttons-group">
            <NotificationBell />
          </div>
        )}

        <div className="user-profile">
          <div className="user-info">
            <span className="user-name">{user?.nombre || 'Usuario'}</span>
            <span className="user-role">{user?.roles?.[0]?.replace('_', ' ') || 'Vendedor'}</span>
          </div>
          <div className="avatar-wrapper">
            <div className="avatar">
              <User size={18} />
            </div>
            <div className="status-indicator"></div>
          </div>
          <button className="logout-button" onClick={() => { void performLogout(); }} title="Cerrar Sesión">
            <LogOut size={18} />
          </button>
        </div>
      </div>

      <style>{`
        .top-bar {
          height: 68px;
          background: color-mix(in srgb, var(--bg-card) 78%, transparent);
          backdrop-filter: blur(16px) saturate(140%);
          -webkit-backdrop-filter: blur(16px) saturate(140%);
          border-bottom: 1px solid var(--border);
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 var(--space-8);
          position: sticky;
          top: 0;
          z-index: 100;
        }

        .top-bar-left {
            display: flex;
            align-items: center;
            gap: var(--space-3);
            min-width: 0;
            flex: 1;
        }

        .cmdk-trigger {
            display: inline-flex;
            align-items: center;
            gap: 0.5rem;
            padding: 0.4rem 0.6rem 0.4rem 0.65rem;
            border-radius: var(--radius-md);
            background: var(--bg-secondary);
            border: 1px solid var(--border);
            color: var(--text-secondary);
            font-family: var(--font-sans);
            font-size: var(--text-sm);
            font-weight: 500;
            cursor: pointer;
            transition: border-color var(--duration-base) var(--easing-soft),
                        color var(--duration-base) var(--easing-soft),
                        background var(--duration-base) var(--easing-soft);
        }

        .cmdk-trigger:hover {
            border-color: var(--border-strong);
            color: var(--text-primary);
            background: var(--bg-card);
        }

        .cmdk-trigger-text {
            display: inline-block;
        }

        .cmdk-trigger-kbd {
            font-family: var(--font-mono);
            font-size: 0.7rem;
            font-weight: 600;
            color: var(--text-muted);
            padding: 1px 6px;
            border-radius: var(--radius-xs);
            background: var(--bg-card);
            border: 1px solid var(--border);
        }

        .top-bar-actions {
          display: flex;
          align-items: center;
          gap: var(--space-5);
        }

        .action-buttons-group {
            display: flex;
            align-items: center;
            gap: var(--space-2);
            padding-right: var(--space-5);
            border-right: 1px solid var(--border);
        }

        .icon-button {
          position: relative;
          color: var(--text-secondary);
          width: 38px;
          height: 38px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: var(--radius-md);
          background: transparent;
          border: 1px solid transparent;
          transition: background var(--duration-base) var(--easing-soft),
                      color var(--duration-base) var(--easing-soft),
                      border-color var(--duration-base) var(--easing-soft);
        }

        .icon-button:hover {
          background: var(--bg-secondary);
          border-color: var(--border);
          color: var(--accent);
        }

        .user-profile {
          display: flex;
          align-items: center;
          gap: var(--space-3);
        }

        .user-info {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          line-height: 1.2;
        }

        .user-name {
          font-family: var(--font-display);
          font-weight: 600;
          font-size: var(--text-sm);
          color: var(--text-primary);
        }

        .user-role {
          font-size: 0.7rem;
          color: var(--text-muted);
          text-transform: uppercase;
          font-weight: 600;
          letter-spacing: 0.08em;
        }

        .avatar-wrapper {
            position: relative;
        }

        .avatar {
          width: 40px;
          height: 40px;
          background: var(--accent-gradient);
          border: 1px solid rgba(var(--accent-rgb), 0.4);
          border-radius: var(--radius-md);
          display: flex;
          align-items: center;
          justify-content: center;
          color: #ffffff;
          box-shadow: var(--glow-accent);
        }

        .status-indicator {
            position: absolute;
            bottom: -2px;
            right: -2px;
            width: 10px;
            height: 10px;
            background: var(--success);
            border: 2px solid var(--bg-card);
            border-radius: 50%;
            box-shadow: 0 0 6px rgba(var(--accent-rgb), 0.7);
        }

        .logout-button {
          color: var(--text-muted);
          width: 38px;
          height: 38px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: var(--radius-md);
          background: transparent;
          border: 1px solid transparent;
          margin-left: var(--space-1);
          transition: background var(--duration-base) var(--easing-soft),
                      color var(--duration-base) var(--easing-soft),
                      border-color var(--duration-base) var(--easing-soft);
        }

        .logout-button:hover {
          background: rgba(239, 68, 68, 0.10);
          border-color: rgba(239, 68, 68, 0.25);
          color: var(--danger);
        }

        .mobile-menu-btn {
            display: none;
            color: var(--text-primary);
            margin-right: var(--space-4);
            background: transparent;
            border: none;
            padding: 4px;
        }

        @media (max-width: 1024px) {
            .mobile-menu-btn {
                display: block;
            }
            .top-bar {
                padding: 0 var(--space-4);
            }
            .user-info {
                display: none;
            }
            .cmdk-trigger-text {
                display: none;
            }
        }

        @media (max-width: 640px) {
            .cmdk-trigger-kbd {
                display: none;
            }
        }
      `}</style>
    </header>
  );
};

export default TopBar;
