import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import client from '../../api/client';
import { getApiErrorMessage } from '../../utils/error';
import AuthShell from '../../components/auth/AuthShell';

const ForgotPasswordPage = () => {
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [enviado, setEnviado] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        try {
            await client.post('/auth/forgot-password', { email });
            setEnviado(true);
        } catch (err) {
            setError(getApiErrorMessage(err, 'No se pudo procesar la solicitud'));
        } finally {
            setLoading(false);
        }
    };

    return (
        <AuthShell
            title="Recuperar contraseña"
            subtitle={enviado ? undefined : 'Ingresá tu email y te enviaremos un enlace para restablecerla.'}
        >
            {enviado ? (
                <>
                    <div className="auth-msg ok">
                        Si el email está registrado, te enviamos las instrucciones. Revisá tu casilla (y el spam).
                    </div>
                    <p className="auth-link"><Link to="/login">Volver al inicio de sesión</Link></p>
                </>
            ) : (
                <form onSubmit={handleSubmit} className="auth-form">
                    {error && <div className="auth-msg err">{error}</div>}
                    <div className="input-group">
                        <label htmlFor="fp-email" className="input-label">Correo electrónico</label>
                        <div className="input-container has-icon">
                            <input
                                id="fp-email"
                                type="email"
                                className="input-control"
                                placeholder="tu@email.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                autoComplete="email"
                                required
                            />
                        </div>
                    </div>
                    <button type="submit" className="btn btn-primary btn-lg" disabled={loading} style={{ justifyContent: 'center' }}>
                        {loading ? 'Enviando…' : 'Enviar enlace'}
                    </button>
                    <p className="auth-link"><Link to="/login">Volver al inicio de sesión</Link></p>
                </form>
            )}
        </AuthShell>
    );
};

export default ForgotPasswordPage;
