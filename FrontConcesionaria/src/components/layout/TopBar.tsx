import { useAuthStore } from '../../store/authStore';
import { LogOut, Sun, Moon, User, Bell, Menu, Search } from 'lucide-react';
import { useState } from 'react';
import Breadcrumbs from './Breadcrumbs';
import { useCommandPaletteStore } from '../../store/commandPaletteStore';

const TopBar = ({ onMenuClick }: { onMenuClick?: () => void }) => {
  const { user, logout } = useAuthStore();
  const openPalette = useCommandPaletteStore((s) => s.open);

  // Inicialización lazy desde localStorage + sync inicial al body (una sola vez al montar).
  const [isDark, setIsDark] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const theme = localStorage.getItem('theme');
    const initial = theme === 'dark';
    if (initial) document.body.setAttribute('data-theme', 'dark');
    return initial;
  });

  const toggleTheme = () => {
    const newTheme = !isDark ? 'dark' : 'light';
    setIsDark(!isDark);
    document.body.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
  };

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

        <div className="action-buttons-group">
          <button className="icon-button" onClick={toggleTheme} title="Cambiar tema" aria-label="Cambiar tema">
            {isDark ? <Sun size={18} /> : <Moon size={18} />}
          </button>

          <button className="icon-button" title="Notificaciones" aria-label="Notificaciones">
            <Bell size={18} />
            <span className="notification-dot"></span>
          </button>
        </div>

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
          <button className="logout-button" onClick={logout} title="Cerrar Sesión">
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

        .notification-dot {
          position: absolute;
          top: 9px;
          right: 9px;
          width: 7px;
          height: 7px;
          background: var(--accent-2);
          border-radius: 50%;
          border: 2px solid var(--bg-card);
          box-shadow: 0 0 8px rgba(var(--accent-2-rgb), 0.65);
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
