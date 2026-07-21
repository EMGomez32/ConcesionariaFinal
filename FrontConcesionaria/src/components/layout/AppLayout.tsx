import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import CommandPalette from './CommandPalette';
import ScrollProgress from './ScrollProgress';
import SkipLink from './SkipLink';
import Toast from '../ui/Toast';
import ConfirmDialog from '../ui/ConfirmDialog';
import { useConfirmStore } from '../../store/confirmStore';
import { useCommandPaletteStore } from '../../store/commandPaletteStore';

const AppLayout = () => {
    const confirm = useConfirmStore();
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const togglePalette = useCommandPaletteStore((s) => s.toggle);
    const { pathname } = useLocation();

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
            <CommandPalette />
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
                />
            )}
            <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                <ScrollProgress />
                <TopBar onMenuClick={() => setIsSidebarOpen(true)} />
                <main
                    id="main-content"
                    className="app-main"
                    tabIndex={-1}
                    style={{ flex: 1, overflowY: 'auto' }}
                >
                    <div key={pathname} className="page-transition">
                        <Outlet />
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
