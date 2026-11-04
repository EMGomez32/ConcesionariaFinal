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
                    <ShieldAlert size={48} aria-hidden="true" />
                </div>
                <h1 className="text-3xl tracking-tight mb-4">No tenés acceso a esta pantalla</h1>
                <p
                    className="text-secondary leading-relaxed"
                    style={{ marginBottom: 'var(--space-8)' }}
                >
                    Tu usuario no tiene permiso para entrar acá. Si te parece que es un
                    error, pedile al administrador de tu concesionaria que revise tu rol.
                </p>
                <div className="flex gap-4">
                    <Button variant="secondary" onClick={() => navigate(-1)} style={{ flex: 1 }}>
                        Volver
                    </Button>
                    <Button variant="primary" onClick={() => navigate('/')} style={{ flex: 1 }}>
                        Ir al inicio
                    </Button>
                </div>
            </div>
        </div>
    );
};

export default ForbiddenPage;
