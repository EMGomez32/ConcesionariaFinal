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
                <div
                    className="flex items-center justify-center"
                    style={{ minHeight: '100vh', padding: 'var(--space-6)' }}
                >
                    <div
                        className="card glass flex flex-col w-full text-center"
                        style={{ maxWidth: '28rem', padding: 'var(--space-8)', gap: 'var(--space-6)' }}
                    >
                        <div className="dt-empty-badge is-error" style={{ margin: '0 auto' }}>
                            <AlertCircle size={32} />
                        </div>

                        <div className="flex flex-col gap-2">
                            <h1 className="text-2xl tracking-tight">
                                ¡Ups! Algo salió mal
                            </h1>
                            <p className="text-sm text-secondary">
                                La aplicación encontró un error crítico y no puede continuar.
                            </p>
                        </div>

                        <div
                            className="p-4 text-left"
                            style={{
                                background: 'var(--bg-secondary)',
                                border: '1px solid var(--border)',
                                borderRadius: 'var(--radius-md)',
                            }}
                        >
                            <p
                                className="text-3xs font-black uppercase text-muted tracking-widest"
                                style={{ marginBottom: 'var(--space-1)' }}
                            >
                                Detalle Técnico
                            </p>
                            <p className="text-xs font-mono text-danger" style={{ overflowWrap: 'break-word' }}>
                                {this.state.error?.message || 'Error desconocido'}
                            </p>
                        </div>

                        <Button
                            variant="primary"
                            className="w-full"
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
