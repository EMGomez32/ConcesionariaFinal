import { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { WifiOff } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { restaurarSesion } from '../../api/client';
import { haySalidaVoluntaria } from '../../api/auth.api';
import { MENSAJES_ERROR } from '../../utils/getErrorMessage';
import PageLoader from '../ui/PageLoader';
import Button from '../ui/Button';

/** Pantalla a la que queda confinada una sesión que debe activar el 2FA. */
export const RUTA_ACTIVAR_2FA = '/activar-2fa';

/**
 * Puerta de las pantallas autenticadas.
 *
 * El access token vive sólo en memoria: al recargar la página queda el usuario
 * persistido pero sin token. En ese caso, antes de mostrar nada, se restaura la
 * sesión con /auth/refresh (la cookie httpOnly) y mientras tanto se ve el loader.
 * Si el backend rechaza la cookie, se va al login con el aviso de sesión vencida;
 * si no se pudo preguntar (sin conexión), se ofrece reintentar sin cerrar nada.
 */
const ProtectedRoute = () => {
    const user = useAuthStore((state) => state.user);
    const isAuth = useAuthStore((state) => state.isAuthenticated);
    const mfaPendiente = useAuthStore((state) => state.user?.mfaPendiente === true);
    const { pathname, search } = useLocation();
    const [sinConexion, setSinConexion] = useState(false);
    const [intento, setIntento] = useState(0);

    const restaurando = !!user && !isAuth;

    useEffect(() => {
        if (!restaurando) return;
        let vigente = true;
        restaurarSesion().then((r) => {
            if (vigente && r === 'sin-conexion') setSinConexion(true);
            // 'ok' → el store pasa a isAuthenticated y esto re-renderiza solo.
            // 'vencida' → el store queda sin usuario y cae en el <Navigate> de abajo.
        });
        return () => { vigente = false; };
    }, [restaurando, intento]);

    if (!user) {
        // Se recuerda adónde iba (salvo que haya cerrado la sesión a propósito) para
        // volver ahí después de entrar.
        const from = haySalidaVoluntaria() ? undefined : pathname + search;
        return <Navigate to="/login" replace state={from ? { from } : undefined} />;
    }

    if (restaurando) {
        if (sinConexion) {
            return (
                <div className="flex items-center justify-center" style={{ minHeight: '100vh', padding: 'var(--space-6)' }}>
                    <div className="card text-center flex flex-col items-center" style={{ maxWidth: '26rem', gap: 'var(--space-4)' }} role="alert">
                        <div className="dt-empty-badge is-error" aria-hidden="true"><WifiOff size={32} /></div>
                        <h1 className="text-xl">No pudimos recuperar tu sesión</h1>
                        <p className="text-secondary">{MENSAJES_ERROR.red}</p>
                        <Button
                            onClick={() => { setSinConexion(false); setIntento((i) => i + 1); }}
                        >
                            Reintentar
                        </Button>
                    </div>
                </div>
            );
        }
        return <PageLoader mensaje="Recuperando tu sesión…" />;
    }

    // Un rol que exige 2FA y todavía no lo activó no ve nada más hasta activarlo (el backend también lo
    // impide: sólo deja usar /api/auth/*).
    if (mfaPendiente && pathname !== RUTA_ACTIVAR_2FA) {
        return <Navigate to={RUTA_ACTIVAR_2FA} replace />;
    }

    return <Outlet />;
};

export default ProtectedRoute;
