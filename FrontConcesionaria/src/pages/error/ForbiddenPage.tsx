import { useNavigate } from 'react-router-dom';
import Button from '../../components/ui/Button';
import { ShieldAlert } from 'lucide-react';

const ForbiddenPage = () => {
    const navigate = useNavigate();

    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-950 p-6">
            <div className="card glass max-w-md w-full p-12 text-center animate-fade-in border-red-500/20">
                <div className="w-24 h-24 bg-red-900/20 text-red-500 rounded-full flex items-center justify-center mx-auto mb-8 border border-red-500/30">
                    <ShieldAlert size={48} />
                </div>
                <h1 className="text-4xl font-black mb-4">Acceso Denegado</h1>
                <p className="text-slate-400 mb-8 leading-relaxed">
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
