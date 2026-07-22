import { NavLink } from 'react-router-dom';
import { X, ChevronsLeft, ChevronsRight } from 'lucide-react';
import Isotipo from '../brand/Isotipo';
import { useAuthStore } from '../../store/authStore';
import { useSidebarStore } from '../../store/sidebarStore';
import { NAV_SECTIONS } from '../../config/nav';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose }) => {
  const { user } = useAuthStore();
  const collapsed = useSidebarStore((s) => s.collapsed);
  const toggle = useSidebarStore((s) => s.toggle);
  const isSuperAdmin = user?.roles.includes('super_admin');
  const isAdmin = isSuperAdmin || user?.roles.includes('admin');

  return (
    <aside className={`sidebar ${isOpen ? 'open' : ''} ${collapsed ? 'is-collapsed' : ''}`}>
      <div className="sidebar-header">
        <div className="logo-container" aria-hidden="true">
          <Isotipo size={collapsed ? 22 : 28} color="#fff" />
        </div>
        {!collapsed && (
          <div className="logo-text-wrapper">
            <span className="logo-text">AUTENZA</span>
            <span className="logo-tag">Concesionaria</span>
          </div>
        )}
        <button className="sidebar-close-btn" onClick={onClose} aria-label="Cerrar menú">
          <X size={20} />
        </button>
      </div>

      <nav className="sidebar-nav" aria-label="Navegación principal">
        {NAV_SECTIONS.map((section) => {
          const visibleItems = section.items.filter((it) => (!it.superAdminOnly || isSuperAdmin) && (!it.adminOnly || isAdmin));
          if (visibleItems.length === 0) return null;
          return (
            <div key={section.title} className="nav-section">
              {!collapsed && <h3 className="section-title">{section.title}</h3>}
              {collapsed && <div className="nav-section-divider" aria-hidden="true" />}
              <div className="section-items">
                {visibleItems.map((item) => (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    end={item.path === '/'}
                    className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                    title={collapsed ? item.label : undefined}
                    aria-label={collapsed ? item.label : undefined}
                  >
                    <item.icon size={18} />
                    {!collapsed && <span>{item.label}</span>}
                  </NavLink>
                ))}
              </div>
            </div>
          );
        })}
      </nav>

      <div className="sidebar-footer">
        <button
          className="sidebar-collapse-btn"
          onClick={toggle}
          aria-label={collapsed ? 'Expandir menú' : 'Colapsar menú'}
          title={collapsed ? 'Expandir menú' : 'Colapsar menú'}
          type="button"
        >
          {collapsed ? <ChevronsRight size={16} /> : <ChevronsLeft size={16} />}
          {!collapsed && <span>Colapsar</span>}
        </button>
      </div>

      <style>{`
        .sidebar {
          width: 280px;
          flex-shrink: 0;
          background: var(--bg-sidebar);
          background-image:
            radial-gradient(circle at 0% 0%, rgba(139, 92, 246, 0.10), transparent 50%),
            radial-gradient(circle at 100% 100%, rgba(6, 182, 212, 0.08), transparent 50%);
          color: #f5f7fb;
          padding: 1.5rem 0.875rem 0.875rem;
          display: flex;
          flex-direction: column;
          height: 100vh;
          position: sticky;
          top: 0;
          overflow-y: auto;
          border-right: 1px solid rgba(255, 255, 255, 0.04);
          transition: width var(--duration-slow) var(--easing-soft),
                      padding var(--duration-slow) var(--easing-soft);
        }

        .sidebar.is-collapsed {
          width: 76px;
          padding: 1.5rem 0.5rem 0.875rem;
        }

        .sidebar::-webkit-scrollbar { width: 4px; }
        .sidebar::-webkit-scrollbar-track { background: transparent; }
        .sidebar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: var(--radius-pill); }

        .sidebar-header {
          display: flex;
          align-items: center;
          gap: 0.875rem;
          margin-bottom: 2rem;
          padding: 0.25rem 0.75rem;
        }

        .sidebar.is-collapsed .sidebar-header {
          justify-content: center;
          padding: 0.25rem 0;
        }

        .logo-container {
            width: 42px;
            height: 42px;
            background: var(--neon-gradient);
            border-radius: var(--radius-md);
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 4px 16px rgba(var(--accent-2-rgb), 0.35),
                        0 0 0 1px rgba(255, 255, 255, 0.08) inset;
            position: relative;
            overflow: hidden;
            flex-shrink: 0;
            transition: width var(--duration-base), height var(--duration-base);
        }

        .sidebar.is-collapsed .logo-container {
            width: 38px;
            height: 38px;
        }

        .logo-container::after {
            content: '';
            position: absolute;
            inset: 0;
            background: radial-gradient(circle at 30% 30%, rgba(255, 255, 255, 0.35), transparent 60%);
            mix-blend-mode: overlay;
        }

        .logo-text-wrapper {
            display: flex;
            flex-direction: column;
            white-space: nowrap;
            overflow: hidden;
        }

        .logo-text {
          font-family: var(--font-display);
          font-size: 1.25rem;
          font-weight: 700;
          letter-spacing: 0.02em;
          line-height: 1;
          background: var(--neon-gradient);
          -webkit-background-clip: text;
          background-clip: text;
          -webkit-text-fill-color: transparent;
        }

        .logo-tag {
            font-size: 0.65rem;
            color: rgba(255, 255, 255, 0.45);
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.18em;
            margin-top: 0.2rem;
        }

        .sidebar-nav {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
          flex: 1;
        }

        .nav-section {
            display: flex;
            flex-direction: column;
            gap: 0.4rem;
        }

        .nav-section-divider {
            height: 1px;
            background: rgba(255, 255, 255, 0.06);
            margin: 0 0.5rem;
        }

        .section-title {
            font-family: var(--font-sans);
            font-size: 0.65rem;
            font-weight: 700;
            color: rgba(255, 255, 255, 0.32);
            text-transform: uppercase;
            letter-spacing: 0.16em;
            padding-left: 1rem;
        }

        .section-items {
            display: flex;
            flex-direction: column;
            gap: 0.2rem;
        }

        .nav-item {
          position: relative;
          display: flex;
          align-items: center;
          gap: 0.875rem;
          padding: 0.6rem 1rem;
          border-radius: var(--radius-md);
          color: rgba(255, 255, 255, 0.62);
          font-size: var(--text-sm);
          font-weight: 500;
          text-decoration: none;
          transition: background var(--duration-base) var(--easing-soft),
                      color var(--duration-base) var(--easing-soft),
                      box-shadow var(--duration-base) var(--easing-soft);
        }

        .nav-item svg {
            transition: transform var(--duration-base) var(--easing-spring);
        }

        .nav-item:hover svg,
        .nav-item.active svg {
            transform: scale(1.12);
        }

        .sidebar.is-collapsed .nav-item {
            justify-content: center;
            padding: 0.65rem 0;
        }

        .nav-item::before {
          content: '';
          position: absolute;
          left: -0.875rem;
          top: 50%;
          transform: translateY(-50%) scaleY(0);
          width: 3px;
          height: 60%;
          border-radius: 0 3px 3px 0;
          background: var(--accent);
          box-shadow: 0 0 8px rgba(var(--accent-rgb), 0.6);
          transition: transform var(--duration-base) var(--easing-spring);
        }

        .sidebar.is-collapsed .nav-item::before {
            left: -0.5rem;
        }

        .nav-item:hover {
          background: rgba(255, 255, 255, 0.04);
          color: #ffffff;
        }

        .nav-item.active {
          background: linear-gradient(90deg,
              rgba(var(--accent-rgb), 0.18) 0%,
              rgba(var(--accent-2-rgb), 0.08) 100%);
          color: #ffffff;
          box-shadow: inset 0 0 0 1px rgba(var(--accent-rgb), 0.18);
        }

        .nav-item.active::before {
          transform: translateY(-50%) scaleY(1);
        }

        .nav-item.active svg {
            color: var(--accent);
        }

        .sidebar-footer {
            padding-top: var(--space-3);
            border-top: 1px solid rgba(255, 255, 255, 0.05);
            margin-top: var(--space-3);
        }

        .sidebar-collapse-btn {
            width: 100%;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 0.5rem;
            padding: 0.55rem 0.75rem;
            border-radius: var(--radius-md);
            background: rgba(255, 255, 255, 0.04);
            color: rgba(255, 255, 255, 0.6);
            border: 1px solid rgba(255, 255, 255, 0.06);
            font-family: var(--font-sans);
            font-size: var(--text-xs);
            font-weight: 600;
            cursor: pointer;
            transition: background var(--duration-base) var(--easing-soft),
                        color var(--duration-base) var(--easing-soft),
                        border-color var(--duration-base) var(--easing-soft);
        }

        .sidebar-collapse-btn:hover {
            background: rgba(255, 255, 255, 0.08);
            color: #ffffff;
            border-color: rgba(var(--accent-rgb), 0.3);
        }

        .sidebar-close-btn {
            display: none;
            background: none;
            border: none;
            color: rgba(255, 255, 255, 0.6);
            cursor: pointer;
            padding: 0.5rem;
            margin-left: auto;
        }

        @media (max-width: 1024px) {
            .sidebar {
                position: fixed;
                left: -280px;
                z-index: 1050;
                width: 280px !important;
                padding: 1.5rem 0.875rem 0.875rem !important;
                transition: left var(--duration-slow) var(--easing-soft);
            }
            .sidebar.open {
                left: 0;
            }
            .sidebar-close-btn {
                display: block;
            }
            .sidebar-footer { display: none; }
        }
      `}</style>
    </aside>
  );
};

export default Sidebar;
