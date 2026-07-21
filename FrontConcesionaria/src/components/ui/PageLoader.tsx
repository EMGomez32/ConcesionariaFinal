import { Car } from 'lucide-react';

const PageLoader = () => {
    return (
        <div className="page-loader">
            <div className="page-loader-logo">
                <div className="page-loader-orb"></div>
                <div className="page-loader-icon">
                    <Car size={28} color="#ffffff" />
                </div>
            </div>

            <div className="page-loader-text">
                <span className="page-loader-brand">AUTENZA</span>
                <div className="page-loader-dots" aria-hidden="true">
                    <span></span>
                    <span></span>
                    <span></span>
                </div>
                <p className="page-loader-msg">Inicializando módulos…</p>
            </div>

            <style>{`
                .page-loader {
                    position: fixed;
                    inset: 0;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    gap: var(--space-6);
                    background: var(--bg-primary);
                    background-image: var(--aurora-gradient);
                    z-index: 9999;
                }

                .page-loader-logo {
                    position: relative;
                    width: 64px;
                    height: 64px;
                }

                .page-loader-orb {
                    position: absolute;
                    inset: -10px;
                    border-radius: 50%;
                    background: var(--neon-gradient);
                    filter: blur(18px);
                    opacity: 0.55;
                    animation: pl-pulse 1.6s ease-in-out infinite;
                }

                .page-loader-icon {
                    position: relative;
                    width: 64px;
                    height: 64px;
                    border-radius: var(--radius-lg);
                    background: var(--neon-gradient);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.08) inset,
                                0 12px 32px -8px rgba(var(--accent-2-rgb), 0.5);
                }

                .page-loader-text {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: var(--space-2);
                }

                .page-loader-brand {
                    font-family: var(--font-display);
                    font-size: 1.5rem;
                    font-weight: 700;
                    letter-spacing: 0.18em;
                    background: var(--neon-gradient);
                    -webkit-background-clip: text;
                    background-clip: text;
                    -webkit-text-fill-color: transparent;
                }

                .page-loader-dots {
                    display: flex;
                    gap: 6px;
                }

                .page-loader-dots span {
                    width: 6px;
                    height: 6px;
                    border-radius: 50%;
                    background: var(--accent);
                    animation: pl-bounce 1.2s ease-in-out infinite;
                }

                .page-loader-dots span:nth-child(2) { animation-delay: 0.15s; }
                .page-loader-dots span:nth-child(3) { animation-delay: 0.3s; }

                .page-loader-msg {
                    font-family: var(--font-sans);
                    font-size: 0.7rem;
                    font-weight: 600;
                    color: var(--text-muted);
                    text-transform: uppercase;
                    letter-spacing: 0.22em;
                }

                @keyframes pl-pulse {
                    0%, 100% { transform: scale(0.95); opacity: 0.45; }
                    50% { transform: scale(1.08); opacity: 0.7; }
                }

                @keyframes pl-bounce {
                    0%, 100% { transform: translateY(0); opacity: 0.4; }
                    40% { transform: translateY(-6px); opacity: 1; }
                }
            `}</style>
        </div>
    );
};

export default PageLoader;
