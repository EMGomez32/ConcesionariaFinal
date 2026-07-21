import { Link, useLocation } from 'react-router-dom';
import { ChevronRight, Home } from 'lucide-react';
import { resolveSegmentLabel } from '../../config/nav';

const Breadcrumbs = () => {
    const { pathname } = useLocation();
    const segments = pathname.split('/').filter(Boolean);

    if (segments.length === 0) {
        return (
            <nav className="crumbs" aria-label="Ruta">
                <span className="crumb crumb-current">
                    <Home size={14} />
                    <span>Dashboard</span>
                </span>
            </nav>
        );
    }

    const trail = segments.reduce<{ label: string; href: string; isLast: boolean }[]>(
        (acc, seg, idx) => {
            const parent = acc[idx - 1]?.href ?? '';
            const href = `${parent}/${seg}`;
            acc.push({
                label: resolveSegmentLabel(seg, parent),
                href,
                isLast: idx === segments.length - 1,
            });
            return acc;
        },
        []
    );

    return (
        <nav className="crumbs" aria-label="Ruta">
            <Link to="/" className="crumb crumb-link" aria-label="Ir a Dashboard">
                <Home size={14} />
            </Link>
            {trail.map((c) => (
                <span key={c.href} className="crumb-row">
                    <ChevronRight size={12} className="crumb-sep" aria-hidden="true" />
                    {c.isLast
                        ? <span className="crumb crumb-current" aria-current="page">{c.label}</span>
                        : <Link to={c.href} className="crumb crumb-link">{c.label}</Link>}
                </span>
            ))}

            <style>{`
                .crumbs {
                    display: flex;
                    align-items: center;
                    gap: 0.25rem;
                    font-family: var(--font-sans);
                    font-size: var(--text-sm);
                    min-width: 0;
                }
                .crumb-row {
                    display: inline-flex;
                    align-items: center;
                    gap: 0.25rem;
                    min-width: 0;
                }
                .crumb {
                    display: inline-flex;
                    align-items: center;
                    gap: 0.4rem;
                    padding: 0.2rem 0.5rem;
                    border-radius: var(--radius-sm);
                    font-weight: 500;
                    line-height: 1;
                    white-space: nowrap;
                    text-overflow: ellipsis;
                    overflow: hidden;
                    max-width: 220px;
                }
                .crumb-link {
                    color: var(--text-secondary);
                    text-decoration: none;
                    transition: color var(--duration-base) var(--easing-soft),
                                background var(--duration-base) var(--easing-soft);
                }
                .crumb-link:hover {
                    color: var(--accent);
                    background: var(--accent-light);
                }
                .crumb-current {
                    color: var(--text-primary);
                    font-weight: 600;
                }
                .crumb-sep { color: var(--text-muted); flex-shrink: 0; }

                @media (max-width: 640px) {
                    .crumb { max-width: 120px; }
                }
            `}</style>
        </nav>
    );
};

export default Breadcrumbs;
