import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import Button from './ui/Button';

interface Props {
    children: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        error: null,
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('Uncaught error:', error, errorInfo);
    }

    private handleReset = () => {
        this.setState({ hasError: false, error: null });
        window.location.href = '/';
    };

    public render() {
        if (this.state.hasError) {
            return (
                <div className="flex items-center justify-center min-h-screen bg-slate-950 p-6">
                    <div className="card glass p-8 max-w-md w-full text-center space-y-6">
                        <div className="mx-auto w-16 h-16 bg-red-500/10 rounded-2xl flex items-center justify-center text-red-500 ring-1 ring-red-500/20 shadow-glow shadow-red-500/5">
                            <AlertCircle size={32} />
                        </div>

                        <div className="space-y-2">
                            <h1 className="text-2xl font-black text-white italic tracking-tight uppercase">
                                ¡Ups! Algo salió mal
                            </h1>
                            <p className="text-slate-400 text-sm">
                                La aplicación encontró un error crítico y no puede continuar.
                            </p>
                        </div>

                        <div className="bg-slate-900/50 border border-white/5 rounded-xl p-4 text-left overflow-hidden">
                            <p className="text-[10px] font-black uppercase text-slate-500 tracking-widest mb-1">Detalle Técnico</p>
                            <p className="text-xs font-mono text-red-400 break-words">
                                {this.state.error?.message || 'Error desconocido'}
                            </p>
                        </div>

                        <Button
                            variant="primary"
                            className="w-full flex justify-center gap-2"
                            onClick={this.handleReset}
                        >
                            <RefreshCw size={18} /> Volver al Inicio
                        </Button>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
