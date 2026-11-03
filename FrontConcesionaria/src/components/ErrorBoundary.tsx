import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertCircle, RefreshCw, Sparkles } from 'lucide-react';
import Button from './ui/Button';
import { esErrorDeCarga, recargarPorVersionNueva } from './errorDeCarga';

interface Props {
    children: ReactNode;
    /**
     * 'pantalla' (por defecto) ocupa toda la ventana: es la barrera de afuera, la
     * que ve el usuario si se cae todo. 'seccion' va dentro del layout (alrededor
     * de la página) y deja el menú andando.
     */
    variante?: 'pantalla' | 'seccion';
}

interface State {
    error: Error | null;
}

/**
 * Barrera de errores de render. Sin ella, un error en cualquier componente
 * dejaba la pantalla en blanco. Si el error es la carga de un chunk después de
 * un deploy, recarga una vez sola (ver errorDeCarga.ts) y, si no puede, avisa
 * que hay una versión nueva.
 */
class ErrorBoundary extends Component<Props, State> {
    public state: State = { error: null };

    public static getDerivedStateFromError(error: Error): State {
        return { error };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('Error de render:', error, errorInfo);
        if (esErrorDeCarga(error)) recargarPorVersionNueva();
    }

    private recargar = () => {
        window.location.reload();
    };

    private irAlInicio = () => {
        window.location.assign('/');
    };

    public render() {
        const { error } = this.state;
        if (!error) return this.props.children;

        const versionNueva = esErrorDeCarga(error);
        const pantalla = (this.props.variante ?? 'pantalla') === 'pantalla';

        return (
            <div
                className="flex items-center justify-center"
                style={{ minHeight: pantalla ? '100vh' : '60vh', padding: 'var(--space-6)' }}
            >
                <div
                    className="card flex flex-col w-full text-center"
                    style={{ maxWidth: '30rem', padding: 'var(--space-8)', gap: 'var(--space-6)' }}
                    role="alert"
                >
                    <div className={`dt-empty-badge ${versionNueva ? '' : 'is-error'}`} style={{ margin: '0 auto' }} aria-hidden="true">
                        {versionNueva ? <Sparkles size={32} /> : <AlertCircle size={32} />}
                    </div>

                    <div className="flex flex-col gap-2">
                        <h1 className="text-2xl tracking-tight">
                            {versionNueva ? 'Hay una versión nueva' : 'Algo salió mal'}
                        </h1>
                        <p className="text-sm text-secondary">
                            {versionNueva
                                ? 'Actualizamos AUTENZA mientras la tenías abierta. Recargá la página para seguir: lo que ya guardaste no se pierde.'
                                : 'Hubo un error al mostrar esta pantalla. Recargá la página para seguir; lo que ya guardaste no se pierde.'}
                        </p>
                    </div>

                    {!versionNueva && error.message && (
                        <details className="text-left" style={{ fontSize: 'var(--text-xs)' }}>
                            <summary className="text-muted" style={{ cursor: 'pointer' }}>Detalle técnico (para soporte)</summary>
                            <p
                                className="font-mono text-danger"
                                style={{
                                    marginTop: 'var(--space-2)',
                                    padding: 'var(--space-3)',
                                    background: 'var(--bg-secondary)',
                                    border: '1px solid var(--border)',
                                    borderRadius: 'var(--radius-md)',
                                    overflowWrap: 'anywhere',
                                }}
                            >
                                {error.message}
                            </p>
                        </details>
                    )}

                    <div className="flex flex-wrap justify-center gap-3">
                        <Button variant="primary" onClick={this.recargar}>
                            <RefreshCw size={18} aria-hidden="true" /> Recargar
                        </Button>
                        {!versionNueva && (
                            <Button variant="secondary" onClick={this.irAlInicio}>
                                Ir al inicio
                            </Button>
                        )}
                    </div>
                </div>
            </div>
        );
    }
}

export default ErrorBoundary;
