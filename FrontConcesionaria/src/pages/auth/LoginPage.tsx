import React, { useState } from 'react';
import { useAuthStore } from '../../store/authStore';
import { useNavigate, Link } from 'react-router-dom';
import client from '../../api/client';
import { queryClient } from '../../api/queryClient';
import { getApiErrorMessage } from '../../utils/error';
import { Key, Mail, AlertCircle, Eye, EyeOff } from 'lucide-react';
import Isotipo from '../../components/brand/Isotipo';

const LoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const setAuth = useAuthStore((state) => state.setAuth);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      interface LoginResponse {
        user: {
          id: number;
          nombre: string;
          email: string;
          roles: string[];
          concesionariaId: number | null;
          sucursalId: number | null;
        };
        tokens: { access: string; refresh: string };
      }
      const result = await client.post<LoginResponse>('/auth/login', {
        email,
        password,
      });

      const { user, tokens } = result;
      // Frontera de sesión: si quedó caché de una sesión anterior (p.ej. alguien
      // abrió /login estando autenticado y entra con otra cuenta, camino que no
      // pasa por performLogout), acá se descarta. En /login no hay queries de
      // datos montadas, así que el clear() no dispara ningún refetch.
      queryClient.clear();
      setAuth(user, tokens.access, tokens.refresh);
      // El super_admin vive en su panel de plataforma, no en el shell del tenant.
      navigate(user.roles.includes('super_admin') ? '/plataforma' : '/');
    } catch (err) {
      console.error('Login error:', err);
      setError(getApiErrorMessage(err, 'Error al iniciar sesión'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-stage">
      <div className="login-stage-grid" aria-hidden="true" />
      <div className="login-stage-orb login-stage-orb--violet" aria-hidden="true" />
      <div className="login-stage-orb login-stage-orb--cyan" aria-hidden="true" />
      <div className="login-stage-orb login-stage-orb--emerald" aria-hidden="true" />

      <main className="login-card animate-scale-in" role="main">
        <header className="login-header">
          <div className="login-logo">
            <Isotipo size={26} color="#ffffff" />
          </div>
          <h1 className="login-brand">AUTENZA</h1>
          <p className="login-tag">Dealer Operating System</p>
        </header>

        <form onSubmit={handleLogin} className="login-form" aria-labelledby="login-title">
          <div className="login-welcome">
            <h2 id="login-title">Bienvenido de vuelta</h2>
            <p>Iniciá sesión para acceder a tu panel.</p>
          </div>

          {error && (
            <div className="login-error animate-fade-in" role="alert">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          <div className="input-group">
            <label htmlFor="login-email" className="input-label">Correo electrónico</label>
            <div className="input-container has-icon">
              <span className="input-icon" aria-hidden="true"><Mail size={16} /></span>
              <input
                id="login-email"
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

          <div className="input-group">
            <label htmlFor="login-password" className="input-label">Contraseña</label>
            <div className="input-container has-icon">
              <span className="input-icon" aria-hidden="true"><Key size={16} /></span>
              <input
                id="login-password"
                type={showPass ? 'text' : 'password'}
                className="input-control"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                className="input-reveal"
                onClick={() => setShowPass(p => !p)}
                aria-label={showPass ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                tabIndex={-1}
              >
                {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <button type="submit" className="btn btn-primary btn-lg login-submit" disabled={loading}>
            {loading ? (
              <>
                <span className="loader" aria-hidden="true"></span>
                Verificando…
              </>
            ) : 'Iniciar sesión'}
          </button>

          <div style={{ textAlign: 'center', marginTop: '0.25rem' }}>
            <Link to="/forgot-password" style={{ color: 'rgba(255,255,255,0.55)', fontSize: 'var(--text-sm)' }}>
              ¿Olvidaste tu contraseña?
            </Link>
          </div>

          <footer className="login-footer">
            <span>&copy; {new Date().getFullYear()} AUTENZA · Concesionaria</span>
          </footer>
        </form>
      </main>

      <style>{`
        .login-stage {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          padding: 1.5rem;
          background: #04060d; /* impeccable-disable-line design-system-color: escenario navy fijo, no cambia con el tema */
          overflow: hidden;
          isolation: isolate;
        }

        .login-stage-grid {
          position: absolute;
          inset: 0;
          background-image:
            linear-gradient(rgba(255, 255, 255, 0.04) 1px, transparent 1px), /* impeccable-disable-line design-system-color: capa sobre navy fijo, relativa al contexto */
            linear-gradient(90deg, rgba(255, 255, 255, 0.04) 1px, transparent 1px); /* impeccable-disable-line design-system-color: capa sobre navy fijo, relativa al contexto */
          background-size: 56px 56px;
          mask-image: radial-gradient(ellipse at center, black 30%, transparent 75%);
          -webkit-mask-image: radial-gradient(ellipse at center, black 30%, transparent 75%);
          z-index: 0;
        }

        .login-stage-orb {
          position: absolute;
          border-radius: 50%;
          filter: blur(80px);
          z-index: 0;
          animation: orb-drift 14s ease-in-out infinite;
        }

        .login-stage-orb--violet {
          width: 480px;
          height: 480px;
          background: rgba(var(--accent-2-rgb), 0.45);
          top: -120px;
          left: -80px;
        }

        .login-stage-orb--cyan {
          width: 420px;
          height: 420px;
          background: rgba(var(--accent-3-rgb), 0.35);
          bottom: -120px;
          right: -80px;
          animation-delay: -4s;
        }

        .login-stage-orb--emerald {
          width: 360px;
          height: 360px;
          background: rgba(var(--accent-rgb), 0.30);
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          animation-delay: -7s;
        }

        @keyframes orb-drift {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(40px, -30px) scale(1.05); }
          66% { transform: translate(-20px, 40px) scale(0.95); }
        }

        .login-stage-orb--emerald {
          animation-name: orb-drift-center;
        }

        @keyframes orb-drift-center {
          0%, 100% { transform: translate(-50%, -50%) scale(1); }
          50% { transform: translate(-50%, -50%) scale(1.15); }
        }

        .login-card {
          position: relative;
          z-index: 1;
          width: 100%;
          max-width: 440px;
          padding: 2.5rem;
          border-radius: var(--radius-xl);
          background: rgba(13, 18, 33, 0.72); /* impeccable-disable-line design-system-color: vidrio navy sobre escenario fijo, relativo al contexto */
          backdrop-filter: blur(24px) saturate(160%);
          -webkit-backdrop-filter: blur(24px) saturate(160%);
          border: 1px solid rgba(255, 255, 255, 0.08); /* impeccable-disable-line design-system-color: capa sobre navy fijo, relativa al contexto */
          box-shadow:
            0 30px 60px -16px rgba(0, 0, 0, 0.6), /* impeccable-disable-line design-system-color: sombra sobre navy fijo; --shadow-xl claro quedaría invisible */
            0 0 0 1px rgba(255, 255, 255, 0.04) inset; /* impeccable-disable-line design-system-color: capa sobre navy fijo, relativa al contexto */
          color: #f5f7fb; /* impeccable-disable-line design-system-color: texto sobre navy fijo, no sigue el tema */
        }

        .login-card::before {
          content: '';
          position: absolute;
          inset: -1px;
          border-radius: inherit;
          padding: 1px;
          background: linear-gradient(135deg,
              rgba(var(--accent-2-rgb), 0.5) 0%,
              rgba(var(--accent-rgb), 0.0) 40%,
              rgba(var(--accent-3-rgb), 0.5) 100%);
          -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0); /* impeccable-disable-line design-system-color: canal de máscara, no es un color de UI */
          -webkit-mask-composite: xor;
          mask-composite: exclude;
          pointer-events: none;
        }

        .login-header {
          text-align: center;
          margin-bottom: 2rem;
        }

        .login-logo {
          width: 56px;
          height: 56px;
          margin: 0 auto 1rem;
          border-radius: var(--radius-lg);
          background: var(--neon-gradient);
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow:
            0 0 0 1px rgba(255, 255, 255, 0.15) inset, /* impeccable-disable-line design-system-color: brillo sobre el gradiente neón, relativo al contexto */
            0 12px 32px -6px rgba(var(--accent-2-rgb), 0.55);
          position: relative;
          overflow: hidden;
        }

        .login-logo::after {
          content: '';
          position: absolute;
          inset: 0;
          background: radial-gradient(circle at 30% 30%, rgba(255, 255, 255, 0.4), transparent 60%); /* impeccable-disable-line design-system-color: brillo sobre el gradiente neón, relativo al contexto */
          mix-blend-mode: overlay;
        }

        .login-brand {
          font-family: var(--font-display);
          font-size: 1.6rem;
          font-weight: 700;
          letter-spacing: 0.18em;
          margin: 0 0 0.25rem;
          background: var(--neon-gradient);
          -webkit-background-clip: text;
          background-clip: text;
          -webkit-text-fill-color: transparent;
        }

        .login-tag {
          font-family: var(--font-sans);
          font-size: var(--text-2xs);
          color: rgba(255, 255, 255, 0.45); /* impeccable-disable-line design-system-color: texto sobre navy fijo, relativo al contexto */
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.18em;
        }

        .login-welcome {
          margin-bottom: 1.5rem;
        }

        .login-welcome h2 {
          font-family: var(--font-display);
          font-size: var(--text-lg);
          font-weight: 600;
          margin: 0 0 0.25rem;
          color: var(--text-white);
        }

        .login-welcome p {
          color: rgba(255, 255, 255, 0.55); /* impeccable-disable-line design-system-color: texto sobre navy fijo, relativo al contexto */
          font-size: var(--text-sm);
        }

        .login-form {
          display: flex;
          flex-direction: column;
          gap: 1.1rem;
        }

        /* Override input styles dentro del login (sobre fondo dark) */
        .login-form .input-label { color: rgba(255, 255, 255, 0.7); } /* impeccable-disable-line design-system-color: texto sobre navy fijo, relativo al contexto */
        .login-form .input-control {
          background: rgba(255, 255, 255, 0.04); /* impeccable-disable-line design-system-color: capa sobre navy fijo, relativa al contexto */
          border-color: rgba(255, 255, 255, 0.10); /* impeccable-disable-line design-system-color: capa sobre navy fijo, relativa al contexto */
          color: var(--text-white);
        }
        .login-form .input-control:hover:not(:focus) {
          border-color: rgba(255, 255, 255, 0.18); /* impeccable-disable-line design-system-color: capa sobre navy fijo, relativa al contexto */
        }
        .login-form .input-control:focus {
          background: rgba(255, 255, 255, 0.06); /* impeccable-disable-line design-system-color: capa sobre navy fijo, relativa al contexto */
          border-color: var(--accent);
          box-shadow: 0 0 0 3px rgba(var(--accent-rgb), 0.25);
        }
        .login-form .input-control::placeholder { color: rgba(255, 255, 255, 0.3); } /* impeccable-disable-line design-system-color: texto sobre navy fijo, relativo al contexto */
        .login-form .input-icon { color: rgba(255, 255, 255, 0.4); } /* impeccable-disable-line design-system-color: ícono sobre navy fijo, relativo al contexto */
        .login-form .input-container:focus-within .input-icon { color: var(--accent); }
        .login-form .input-reveal { color: rgba(255, 255, 255, 0.5); } /* impeccable-disable-line design-system-color: ícono sobre navy fijo, relativo al contexto */
        .login-form .input-reveal:hover {
          color: var(--text-white);
          background: rgba(255, 255, 255, 0.06); /* impeccable-disable-line design-system-color: capa sobre navy fijo, relativa al contexto */
        }

        .login-error {
          display: flex;
          align-items: center;
          gap: 0.625rem;
          padding: 0.75rem 1rem;
          background: rgba(var(--danger-rgb), 0.10);
          color: #fecaca; /* impeccable-disable-line design-system-color: tinte danger legible sobre navy fijo; --danger pleno no contrasta */
          border-radius: var(--radius-md);
          border: 1px solid rgba(var(--danger-rgb), 0.25);
          font-size: var(--text-sm);
        }

        .login-submit {
          margin-top: 0.5rem;
          width: 100%;
          justify-content: center;
        }

        .login-submit .loader {
          width: 16px;
          height: 16px;
          border: 2px solid rgba(255, 255, 255, 0.3); /* impeccable-disable-line design-system-color: pista del spinner sobre el botón emerald, relativa al contexto */
          border-top-color: var(--text-white);
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
          margin-right: 0.5rem;
        }

        .login-footer {
          margin-top: 1rem;
          text-align: center;
          padding-top: 1.25rem;
          border-top: 1px solid rgba(255, 255, 255, 0.06); /* impeccable-disable-line design-system-color: capa sobre navy fijo, relativa al contexto */
          font-size: var(--text-2xs);
          color: rgba(255, 255, 255, 0.35); /* impeccable-disable-line design-system-color: texto sobre navy fijo, relativo al contexto */
        }
      `}</style>
    </div>
  );
};

export default LoginPage;
