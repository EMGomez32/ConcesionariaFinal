import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';

/** Pantalla a la que queda confinada una sesión que debe activar el 2FA. */
export const RUTA_ACTIVAR_2FA = '/activar-2fa';

const ProtectedRoute = () => {
    const isAuth = useAuthStore((state) => state.isAuthenticated);
    const mfaPendiente = useAuthStore((state) => state.user?.mfaPendiente === true);
    const { pathname } = useLocation();

    if (!isAuth) {
        return <Navigate to="/login" replace />;
    }

    // Un rol que exige 2FA y todavía no lo activó no ve nada más hasta activarlo (el backend también lo
    // impide: sólo deja usar /api/auth/*).
    if (mfaPendiente && pathname !== RUTA_ACTIVAR_2FA) {
        return <Navigate to={RUTA_ACTIVAR_2FA} replace />;
    }

    return <Outlet />;
};

export default ProtectedRoute;
