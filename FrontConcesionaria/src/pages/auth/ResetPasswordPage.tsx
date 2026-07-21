import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import client from '../../api/client';
import { getApiErrorMessage } from '../../utils/error';
import AuthShell from '../../components/auth/AuthShell';

const ResetPasswordPage = () => {
    const [params] = useSearchParams();
    const token = params.get('token') || '';
    const navigate = useNavigate();

    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [ok, setOk] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        if (password.length < 10) { setError('La contraseña debe tener al menos 10 caracteres.'); return; }
        if (password !== confirm) { setError('Las contraseñas no coinciden.'); return; }
        setLoading(true);
        try {
            await client.post('/auth/reset-password', { token, password });
            setOk(true);
            setTimeout(() => navigate('/login'), 2500);
        } catch (err) {
            setError(getApiErrorMessage(err, 'No se pudo restablecer la contraseña'));
        } finally {
            setLoading(false);
        }
    };

    if (!token) {
        return (
            <AuthShell title="Enlace inválido">
                <div className="auth-msg err">Falta el token de recuperación. Solicitá un nuevo enlace.</div>
                <p className="auth-link"><Link to="/forgot-password">Solicitar enlace</Link></p>
            </AuthShell>
        );
    }

    return (
        <AuthShell title="Nueva contraseña" subtitle={ok ? undefined : 'Elegí una contraseña de al menos 10 caracteres.'}>
            {ok ? (
                <>
                    <div className="auth-msg ok">Contraseña actualizada. Redirigiéndote al inicio de sesión…</div>
                    <p className="auth-link"><Link to="/login">Ir ahora</Link></p>
                </>
            ) : (
                <form onSubmit={handleSubmit} className="auth-form">
                    {error && <div className="auth-msg err">{error}</div>}
                    <div className="input-group">
                        <label htmlFor="rp-pass" className="input-label">Nueva contraseña</label>
                        <div className="input-container has-icon">
                            <input id="rp-pass" type="password" className="input-control" placeholder="••••••••"
                                value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required />
                        </div>
                    </div>
                    <div className="input-group">
                        <label htmlFor="rp-confirm" className="input-label">Repetir contraseña</label>
                        <div className="input-container has-icon">
                            <input id="rp-confirm" type="password" className="input-control" placeholder="••••••••"
                                value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required />
                        </div>
                    </div>
                    <button type="submit" className="btn btn-primary btn-lg" disabled={loading} style={{ justifyContent: 'center' }}>
                        {loading ? 'Guardando…' : 'Restablecer contraseña'}
                    </button>
                    <p className="auth-link"><Link to="/login">Volver al inicio de sesión</Link></p>
                </form>
            )}
        </AuthShell>
    );
};

export default ResetPasswordPage;
