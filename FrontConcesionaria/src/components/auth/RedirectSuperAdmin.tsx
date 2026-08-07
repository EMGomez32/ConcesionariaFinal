import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';

/**
 * Guard del shell OPERATIVO del tenant: si el usuario es super_admin, lo manda a
 * su panel de plataforma en vez de dejarlo entrar a las pantallas de la
 * concesionaria. El super_admin vive exclusivamente en /plataforma; esta es la
 * contraparte de RequireRole(['super_admin']) que protege el panel.
 */
const RedirectSuperAdmin = () => {
    const user = useAuthStore((s) => s.user);
    if (user?.roles.includes('super_admin')) {
        return <Navigate to="/plataforma" replace />;
    }
    return <Outlet />;
};

export default RedirectSuperAdmin;
