import { useNavigate } from 'react-router-dom';
import { LogOut, ShieldCheck } from 'lucide-react';
import DosFactores from '../../components/seguridad/DosFactores';
import Button from '../../components/ui/Button';
import { useAuthStore } from '../../store/authStore';
import { performLogout } from '../../api/auth.api';

/**
 * Pantalla OBLIGATORIA para quien tiene un rol que exige 2FA y todavía no lo activó. Mientras la sesión
 * esté en ese estado, ProtectedRoute manda acá y la API sólo deja usar /api/auth/* (ver authenticate).
 */
export default function Activar2faPage() {
    const navigate = useNavigate();
    const user = useAuthStore((s) => s.user);

    const alTerminar = () => {
        // La sesión ya se renovó sin la marca de "pendiente".
        navigate(user?.roles.includes('super_admin') ? '/plataforma' : '/', { replace: true });
    };

    const salir = async () => {
        await performLogout();
        navigate('/login', { replace: true });
    };

    return (
        <div className="page-container" style={{ maxWidth: 640, margin: '3rem auto', padding: '0 1rem' }}>
            <div className="card">
                <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.3rem', fontWeight: 700, marginBottom: '0.5rem' }}>
                    <ShieldCheck size={22} /> Activá la verificación en dos pasos
                </h1>
                <p style={{ color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
                    Tu rol administra datos de muchas concesionarias, así que la plataforma exige un segundo factor.
                    Te lleva un minuto y vas a necesitar tu teléfono.
                </p>
                <DosFactores onActivado={alTerminar} />
                <div style={{ marginTop: '1.5rem', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
                    <Button variant="ghost" onClick={salir}><LogOut size={16} /> Cerrar sesión</Button>
                </div>
            </div>
        </div>
    );
}
