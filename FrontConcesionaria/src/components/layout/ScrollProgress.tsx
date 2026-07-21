import { useEffect, useState } from 'react';

const ScrollProgress = () => {
    const [progress, setProgress] = useState(0);

    useEffect(() => {
        const main = document.querySelector('main');
        if (!main) return;

        const handler = () => {
            const max = main.scrollHeight - main.clientHeight;
            const pct = max <= 0 ? 0 : Math.min(100, (main.scrollTop / max) * 100);
            setProgress(pct);
        };

        handler();
        main.addEventListener('scroll', handler, { passive: true });
        window.addEventListener('resize', handler);
        return () => {
            main.removeEventListener('scroll', handler);
            window.removeEventListener('resize', handler);
        };
    }, []);

    return (
        <div className="scroll-progress" aria-hidden="true">
            <div className="scroll-progress-bar" style={{ width: `${progress}%` }} />
            <style>{`
                .scroll-progress {
                    position: sticky;
                    top: 0;
                    height: 2px;
                    width: 100%;
                    background: transparent;
                    z-index: 110;
                    pointer-events: none;
                }
                .scroll-progress-bar {
                    height: 100%;
                    background: var(--neon-gradient);
                    box-shadow: 0 0 8px rgba(var(--accent-rgb), 0.55);
                    transition: width 80ms linear;
                }
            `}</style>
        </div>
    );
};

export default ScrollProgress;
