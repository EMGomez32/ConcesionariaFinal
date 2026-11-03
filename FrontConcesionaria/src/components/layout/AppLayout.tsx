import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import ModuleTourController from './ModuleTourController';
import CommandPalette from './CommandPalette';
import ScrollProgress from './ScrollProgress';
import SkipLink from './SkipLink';
import Toast from '../ui/Toast';
import ConfirmDialog from '../ui/ConfirmDialog';
import ErrorBoundary from '../ErrorBoundary';
import { useConfirmStore } from '../../store/confirmStore';
import { useCommandPaletteStore } from '../../store/commandPaletteStore';
import type { NavSection } from '../../config/nav';

interface AppLayoutProps {
    /** Nav a renderizar en el sidebar. Por defecto el del tenant. */
    sections?: NavSection[];
    /** Bajada del logo del sidebar. */
    brandTag?: string;
    /** Mostrar la campanita de notificaciones del tenant. El panel de plataforma la oculta. */
    showNotifications?: boolean;
}

const AppLayout = ({ sections, brandTag, showNotifications = true }: AppLayoutProps) => {
    const confirm = useConfirmStore();
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const togglePalette = useCommandPaletteStore((s) => s.toggle);
    const { pathname } = useLocation();

    // El menú móvil se cierra al navegar. Es estado derivado de la ruta: se ajusta
    // durante el render (patrón de React para "resetear al cambiar una prop") en
    // vez de con un efecto que haga setState.
    const [rutaVista, setRutaVista] = useState(pathname);
    if (rutaVista !== pathname) {
        setRutaVista(pathname);
        setIsSidebarOpen(false);
    }

    // ...y con Escape. Si un modal o un combobox ya usó la tecla (preventDefault),
    // no se toca el menú.
    useEffect(() => {
        if (!isSidebarOpen) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && !e.defaultPrevented) setIsSidebarOpen(false);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [isSidebarOpen]);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
                e.preventDefault();
                togglePalette();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [togglePalette]);

    return (
        <div style={{ display: 'flex', minHeight: '100vh', width: '100%' }}>
            <SkipLink />
            <Toast />
            {/* Sólo en el shell del tenant: auto-inicia el mini-tour del módulo al entrar. */}
            {showNotifications && <ModuleTourController />}
            {/* El panel de plataforma (super_admin) pasa su propio nav y apaga la
                búsqueda de datos del tenant: showNotifications=false marca ese shell. */}
            <CommandPalette sections={sections} enableGlobalSearch={showNotifications} />

            <ConfirmDialog
                isOpen={confirm.isOpen}
                title={confirm.title}
                message={confirm.message}
                confirmLabel={confirm.confirmLabel}
                cancelLabel={confirm.cancelLabel}
                type={confirm.type}
                onConfirm={confirm.onConfirm || (() => { })}
                onCancel={confirm.hideConfirm}
                loading={confirm.loading}
            />
            {isSidebarOpen && (
                <div
                    className="sidebar-backdrop"
                    onClick={() => setIsSidebarOpen(false)}
                    aria-hidden="true"
                />
            )}
            <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} sections={sections} brandTag={brandTag} />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                <ScrollProgress />
                <TopBar onMenuClick={() => setIsSidebarOpen(true)} menuAbierto={isSidebarOpen} showNotifications={showNotifications} />
                <main
                    id="main-content"
                    className="app-main"
                    tabIndex={-1}
                    style={{ flex: 1, overflowY: 'auto' }}
                >
                    <div key={pathname} className="page-transition">
                        {/* Un error en una pantalla no tumba el shell: el menú sigue
                            andando y, como este div lleva key={pathname}, al navegar
                            a otra ruta la barrera se resetea sola. */}
                        <ErrorBoundary variante="seccion">
                            <Outlet />
                        </ErrorBoundary>
                    </div>
                </main>
            </div>
            <style>{`
                .sidebar-backdrop {
                    position: fixed;
                    inset: 0;
                    background: rgba(0, 0, 0, 0.5);
                    z-index: 1040;
                    display: none;
                }
                @media (max-width: 1024px) {
                    .sidebar-backdrop {
                        display: block;
                    }
                }
            `}</style>
        </div>
    );
};

export default AppLayout;
