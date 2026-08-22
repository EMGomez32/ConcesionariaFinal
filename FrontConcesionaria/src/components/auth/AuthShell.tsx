import React from 'react';
import Isotipo from '../brand/Isotipo';

/** Contenedor centrado con estética dark para pantallas de auth secundarias. */
const AuthShell = ({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) => (
    <div className="auth-shell">
        <main className="auth-card animate-scale-in" role="main">
            <header className="auth-head">
                <div className="auth-logo"><Isotipo size={24} color="#fff" /></div>
                <h1 className="auth-brand">AUTENZA</h1>
            </header>
            <div className="auth-body">
                <h2>{title}</h2>
                {subtitle && <p className="auth-sub">{subtitle}</p>}
                {children}
            </div>
        </main>

        <style>{`
      .auth-shell {
        display:flex; align-items:center; justify-content:center; min-height:100vh; padding:1.5rem;
        background:#04060d; /* impeccable-disable-line design-system-color: escenario navy fijo, no cambia con el tema */
      }
      .auth-card {
        width:100%; max-width:420px; padding:2.5rem; border-radius:var(--radius-xl);
        background:rgba(13,18,33,0.82); /* impeccable-disable-line design-system-color: vidrio navy sobre escenario fijo, relativo al contexto */
        border:1px solid rgba(255,255,255,0.08); /* impeccable-disable-line design-system-color: capa sobre navy fijo, relativa al contexto */
        color:#f5f7fb; /* impeccable-disable-line design-system-color: texto sobre navy fijo, no sigue el tema */
        box-shadow:0 30px 60px -16px rgba(0,0,0,0.6); /* impeccable-disable-line design-system-color: sombra sobre navy fijo; --shadow-xl claro quedaría invisible */
      }
      .auth-head { text-align:center; margin-bottom:1.75rem; }
      .auth-logo {
        width:52px; height:52px; margin:0 auto 0.75rem; border-radius:var(--radius-lg);
        background:var(--neon-gradient); display:flex; align-items:center; justify-content:center;
      }
      .auth-brand {
        font-size:var(--text-xl); font-weight:700; letter-spacing:0.18em; margin:0;
        background:var(--neon-gradient); -webkit-background-clip:text; background-clip:text; -webkit-text-fill-color:transparent;
      }
      .auth-body h2 { font-size:var(--text-lg); font-weight:600; margin:0 0 0.35rem; color:var(--text-white); }
      .auth-sub {
        color:rgba(255,255,255,0.55); /* impeccable-disable-line design-system-color: texto sobre navy fijo, relativo al contexto */
        font-size:var(--text-sm); margin:0 0 1.25rem;
      }
      .auth-body { display:flex; flex-direction:column; }
      .auth-form { display:flex; flex-direction:column; gap:1rem; margin-top:0.5rem; }
      .auth-form .input-label { color:rgba(255,255,255,0.7); } /* impeccable-disable-line design-system-color: texto sobre navy fijo, relativo al contexto */
      .auth-form .input-control {
        background:rgba(255,255,255,0.04); /* impeccable-disable-line design-system-color: capa sobre navy fijo, relativa al contexto */
        border-color:rgba(255,255,255,0.10); /* impeccable-disable-line design-system-color: capa sobre navy fijo, relativa al contexto */
        color:var(--text-white);
      }
      .auth-form .input-control::placeholder { color:rgba(255,255,255,0.3); } /* impeccable-disable-line design-system-color: texto sobre navy fijo, relativo al contexto */
      .auth-msg { padding:0.75rem 1rem; border-radius:var(--radius-md); font-size:var(--text-sm); margin-bottom:0.5rem; }
      .auth-msg.ok {
        background:rgba(var(--accent-rgb),0.12);
        color:#a7f3d0; /* impeccable-disable-line design-system-color: tinte success legible sobre navy fijo; --accent pleno no contrasta */
        border:1px solid rgba(var(--accent-rgb),0.25);
      }
      .auth-msg.err {
        background:rgba(var(--danger-rgb),0.10);
        color:#fecaca; /* impeccable-disable-line design-system-color: tinte danger legible sobre navy fijo; --danger pleno no contrasta */
        border:1px solid rgba(var(--danger-rgb),0.25);
      }
      .auth-link {
        color:rgba(255,255,255,0.6); /* impeccable-disable-line design-system-color: texto sobre navy fijo, relativo al contexto */
        font-size:var(--text-sm); text-align:center; margin-top:1.25rem;
      }
      .auth-link a { color:var(--accent); font-weight:600; }
    `}</style>
    </div>
);

export default AuthShell;
