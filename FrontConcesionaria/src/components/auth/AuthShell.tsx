import React from 'react';
import { Car } from 'lucide-react';

/** Contenedor centrado con estética dark para pantallas de auth secundarias. */
const AuthShell = ({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) => (
    <div className="auth-shell">
        <main className="auth-card animate-scale-in" role="main">
            <header className="auth-head">
                <div className="auth-logo"><Car size={24} color="#fff" /></div>
                <h1 className="auth-brand">AUTENZA</h1>
            </header>
            <div className="auth-body">
                <h2>{title}</h2>
                {subtitle && <p className="auth-sub">{subtitle}</p>}
                {children}
            </div>
        </main>

        <style>{`
      .auth-shell { display:flex; align-items:center; justify-content:center; min-height:100vh; padding:1.5rem; background:#04060d; }
      .auth-card { width:100%; max-width:420px; padding:2.5rem; border-radius:var(--radius-xl, 1.25rem);
        background:rgba(13,18,33,0.82); border:1px solid rgba(255,255,255,0.08); color:#f5f7fb;
        box-shadow:0 30px 60px -16px rgba(0,0,0,0.6); }
      .auth-head { text-align:center; margin-bottom:1.75rem; }
      .auth-logo { width:52px; height:52px; margin:0 auto 0.75rem; border-radius:14px;
        background:var(--neon-gradient, linear-gradient(135deg,#8b5cf6,#06b6d4)); display:flex; align-items:center; justify-content:center; }
      .auth-brand { font-size:1.4rem; font-weight:700; letter-spacing:0.18em; margin:0;
        background:var(--neon-gradient, linear-gradient(135deg,#8b5cf6,#06b6d4)); -webkit-background-clip:text; background-clip:text; -webkit-text-fill-color:transparent; }
      .auth-body h2 { font-size:1.2rem; font-weight:600; margin:0 0 0.35rem; color:#fff; }
      .auth-sub { color:rgba(255,255,255,0.55); font-size:0.875rem; margin:0 0 1.25rem; }
      .auth-body { display:flex; flex-direction:column; }
      .auth-form { display:flex; flex-direction:column; gap:1rem; margin-top:0.5rem; }
      .auth-form .input-label { color:rgba(255,255,255,0.7); }
      .auth-form .input-control { background:rgba(255,255,255,0.04); border-color:rgba(255,255,255,0.10); color:#fff; }
      .auth-form .input-control::placeholder { color:rgba(255,255,255,0.3); }
      .auth-msg { padding:0.75rem 1rem; border-radius:10px; font-size:0.85rem; margin-bottom:0.5rem; }
      .auth-msg.ok { background:rgba(16,185,129,0.12); color:#a7f3d0; border:1px solid rgba(16,185,129,0.25); }
      .auth-msg.err { background:rgba(239,68,68,0.10); color:#fecaca; border:1px solid rgba(239,68,68,0.25); }
      .auth-link { color:rgba(255,255,255,0.6); font-size:0.8rem; text-align:center; margin-top:1.25rem; }
      .auth-link a { color:var(--accent, #8b5cf6); font-weight:600; }
    `}</style>
    </div>
);

export default AuthShell;
