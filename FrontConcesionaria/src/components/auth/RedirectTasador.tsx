import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';

/**
 * El tasador PURO (sólo valúa usados) vive dentro de /tasaciones. Este guard lo
 * manda ahí y le bloquea cualquier otra ruta del tenant por URL directa —el
 * backend ya le corta las escrituras, esto cierra la navegación—. Un usuario que
 * además sea admin o vendedor NO cae acá: su potestad no viene del rol tasador.
 *
 * Análogo a RedirectSuperAdmin, pero según la ruta (el super_admin va a su panel
 * aparte; el tasador se queda en la única sección que puede usar).
 */
const RedirectTasador = () => {
    const user = useAuthStore((s) => s.user);
    const { pathname } = useLocation();

    const esTasadorPuro =
        !!user?.roles.includes('tasador') &&
        !user?.roles.includes('admin') &&
        !user?.roles.includes('super_admin') &&
        !user?.roles.includes('vendedor');

    if (esTasadorPuro && !pathname.startsWith('/tasaciones')) {
        return <Navigate to="/tasaciones" replace />;
    }
    return <Outlet />;
};

export default RedirectTasador;
