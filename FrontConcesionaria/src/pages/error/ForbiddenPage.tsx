import { useNavigate } from 'react-router-dom';
import Button from '../../components/ui/Button';
import { ShieldAlert } from 'lucide-react';

const ForbiddenPage = () => {
    const navigate = useNavigate();

    return (
        <div
            className="flex items-center justify-center"
            style={{ minHeight: '100vh', padding: 'var(--space-6)' }}
        >
            <div
                className="card glass w-full text-center animate-fade-in"
                style={{ maxWidth: '28rem', padding: 'var(--space-10)' }}
            >
                <div
                    className="dt-empty-badge is-error"
                    style={{ margin: '0 auto var(--space-8)' }}
                >
                    <ShieldAlert size={48} />
                </div>
                <h1 className="text-3xl tracking-tight mb-4">Acceso Denegado</h1>
                <p
                    className="text-secondary leading-relaxed"
                    style={{ marginBottom: 'var(--space-8)' }}
                >
                    No posee los privilegios necesarios para acceder a este módulo.
                    Si cree que esto es un error, contacte al administrador del sistema.
                </p>
                <div className="flex gap-4">
                    <Button variant="secondary" onClick={() => navigate(-1)} style={{ flex: 1 }}>
                        Volver
                    </Button>
                    <Button variant="primary" onClick={() => navigate('/')} style={{ flex: 1 }}>
                        Ir al Inicio
                    </Button>
                </div>
            </div>
        </div>
    );
};

export default ForbiddenPage;
