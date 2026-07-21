import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Search, ArrowUpDown, CornerDownLeft, X } from 'lucide-react';
import { NAV_SECTIONS, type NavItem } from '../../config/nav';
import { useAuthStore } from '../../store/authStore';
import { useCommandPaletteStore } from '../../store/commandPaletteStore';

const norm = (s: string) =>
    s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

interface ScoredItem {
    item: NavItem;
    section: string;
    score: number;
}

function scoreItem(item: NavItem, section: string, query: string): ScoredItem | null {
    if (!query) return { item, section, score: 0 };
    const q = norm(query);
    const label = norm(item.label);
    const path = norm(item.path);
    const kws = (item.keywords || []).map(norm);

    let score = -1;
    if (label.startsWith(q)) score = 100;
    else if (label.includes(q)) score = 70;
    else if (kws.some((k) => k.startsWith(q))) score = 60;
    else if (kws.some((k) => k.includes(q))) score = 40;
    else if (path.includes(q)) score = 20;
    else if (norm(section).includes(q)) score = 10;

    return score < 0 ? null : { item, section, score };
}

const CommandPalette = () => {
    const { isOpen, close } = useCommandPaletteStore();
    const navigate = useNavigate();
    const { user } = useAuthStore();
    const isSuper = user?.roles?.includes('super_admin');
    const isAdmin = isSuper || user?.roles?.includes('admin');

    const [query, setQuery] = useState('');
    const [activeIdx, setActiveIdx] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLDivElement>(null);

    const candidates = useMemo<ScoredItem[]>(() => {
        const flat: ScoredItem[] = [];
        for (const sec of NAV_SECTIONS) {
            for (const item of sec.items) {
                if (item.superAdminOnly && !isSuper) continue;
                if (item.adminOnly && !isAdmin) continue;
                const s = scoreItem(item, sec.title, query);
                if (s) flat.push(s);
            }
        }
        return flat.sort((a, b) => b.score - a.score);
    }, [query, isSuper, isAdmin]);

    useEffect(() => {
        if (!isOpen) return;
        setQuery('');
        setActiveIdx(0);
        const t = setTimeout(() => inputRef.current?.focus(), 50);
        return () => clearTimeout(t);
    }, [isOpen]);

    useEffect(() => {
        setActiveIdx(0);
    }, [query]);

    useEffect(() => {
        if (!isOpen) return;

        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                close();
                return;
            }
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActiveIdx((i) => Math.min(i + 1, candidates.length - 1));
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActiveIdx((i) => Math.max(i - 1, 0));
            } else if (e.key === 'Enter') {
                e.preventDefault();
                const target = candidates[activeIdx];
                if (target) {
                    navigate(target.item.path);
                    close();
                }
            }
        };

        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [isOpen, candidates, activeIdx, navigate, close]);

    useEffect(() => {
        if (!isOpen) return;
        const node = listRef.current?.querySelector<HTMLElement>(`[data-idx="${activeIdx}"]`);
        node?.scrollIntoView({ block: 'nearest' });
    }, [activeIdx, isOpen]);

    if (!isOpen) return null;

    // Mapea cada candidato a su índice "lineal" (después del agrupamiento)
    // para que ↑↓ navegue en el orden visible y onClick navegue al item correcto.
    const flatIndex = new Map<string, number>();
    candidates.forEach((c, i) => flatIndex.set(c.item.path, i));

    const grouped = candidates.reduce<Record<string, ScoredItem[]>>((acc, c) => {
        (acc[c.section] ||= []).push(c);
        return acc;
    }, {});

    const content = (
        <div
            className="cmdk-overlay"
            onClick={close}
            role="presentation"
        >
            <div
                className="cmdk-panel"
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-label="Buscar comandos"
            >
                <div className="cmdk-search">
                    <Search size={18} className="cmdk-search-icon" aria-hidden="true" />
                    <input
                        ref={inputRef}
                        className="cmdk-input"
                        placeholder="Buscar páginas, módulos…"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        autoComplete="off"
                        spellCheck={false}
                    />
                    <button
                        type="button"
                        className="cmdk-close"
                        onClick={close}
                        aria-label="Cerrar"
                    >
                        <X size={14} />
                    </button>
                </div>

                <div className="cmdk-list" ref={listRef}>
                    {candidates.length === 0 ? (
                        <div className="cmdk-empty">Sin resultados para “{query}”</div>
                    ) : (
                        Object.entries(grouped).map(([section, items]) => (
                            <div key={section} className="cmdk-group">
                                <div className="cmdk-group-title">{section}</div>
                                {items.map((c) => {
                                    const idx = flatIndex.get(c.item.path) ?? 0;
                                    const Icon = c.item.icon;
                                    return (
                                        <button
                                            key={c.item.path}
                                            type="button"
                                            data-idx={idx}
                                            className={`cmdk-item ${idx === activeIdx ? 'is-active' : ''}`}
                                            onMouseEnter={() => setActiveIdx(idx)}
                                            onClick={() => {
                                                navigate(c.item.path);
                                                close();
                                            }}
                                        >
                                            <span className="cmdk-item-icon">
                                                <Icon size={16} />
                                            </span>
                                            <span className="cmdk-item-label">{c.item.label}</span>
                                            <span className="cmdk-item-path">{c.item.path}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        ))
                    )}
                </div>

                <div className="cmdk-footer">
                    <span className="cmdk-hint">
                        <kbd><ArrowUpDown size={11} /></kbd>
                        navegar
                    </span>
                    <span className="cmdk-hint">
                        <kbd><CornerDownLeft size={11} /></kbd>
                        seleccionar
                    </span>
                    <span className="cmdk-hint">
                        <kbd>Esc</kbd>
                        cerrar
                    </span>
                </div>
            </div>

            <style>{`
                .cmdk-overlay {
                    position: fixed;
                    inset: 0;
                    background: rgba(15, 23, 42, 0.55);
                    backdrop-filter: blur(8px);
                    -webkit-backdrop-filter: blur(8px);
                    display: flex;
                    align-items: flex-start;
                    justify-content: center;
                    padding: 12vh 1.5rem 1.5rem;
                    z-index: 2000;
                    animation: cmdk-fade 0.18s var(--easing-soft);
                }

                .cmdk-panel {
                    width: 100%;
                    max-width: 600px;
                    background: var(--bg-card);
                    border: 1px solid var(--border);
                    border-radius: var(--radius-xl);
                    box-shadow: var(--shadow-xl), 0 0 0 1px var(--border);
                    display: flex;
                    flex-direction: column;
                    max-height: 70vh;
                    overflow: hidden;
                    animation: cmdk-pop 0.22s var(--easing-spring);
                }

                .cmdk-search {
                    position: relative;
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    padding: 0.85rem 1rem;
                    border-bottom: 1px solid var(--border);
                }

                .cmdk-search-icon { color: var(--text-muted); flex-shrink: 0; }

                .cmdk-input {
                    flex: 1;
                    background: transparent;
                    border: none;
                    outline: none;
                    color: var(--text-primary);
                    font-family: var(--font-sans);
                    font-size: var(--text-md);
                    font-weight: 500;
                }

                .cmdk-input::placeholder { color: var(--text-muted); }

                .cmdk-close {
                    width: 26px;
                    height: 26px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    border-radius: var(--radius-sm);
                    background: var(--bg-secondary);
                    border: 1px solid var(--border);
                    color: var(--text-muted);
                    cursor: pointer;
                }
                .cmdk-close:hover { color: var(--text-primary); }

                .cmdk-list {
                    flex: 1;
                    overflow-y: auto;
                    padding: 0.5rem;
                }

                .cmdk-group + .cmdk-group { margin-top: 0.5rem; }

                .cmdk-group-title {
                    font-family: var(--font-sans);
                    font-size: 0.65rem;
                    font-weight: 700;
                    color: var(--text-muted);
                    text-transform: uppercase;
                    letter-spacing: 0.16em;
                    padding: 0.5rem 0.625rem 0.25rem;
                }

                .cmdk-item {
                    width: 100%;
                    display: flex;
                    align-items: center;
                    gap: 0.625rem;
                    padding: 0.55rem 0.625rem;
                    border-radius: var(--radius-md);
                    background: transparent;
                    border: none;
                    color: var(--text-primary);
                    cursor: pointer;
                    text-align: left;
                    font-family: var(--font-sans);
                    font-size: var(--text-sm);
                    transition: background var(--duration-fast) var(--easing-soft);
                }

                .cmdk-item.is-active {
                    background: var(--accent-light);
                    color: var(--accent);
                }

                .cmdk-item-icon {
                    width: 28px;
                    height: 28px;
                    border-radius: var(--radius-sm);
                    background: var(--bg-secondary);
                    border: 1px solid var(--border);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: var(--text-secondary);
                }

                .cmdk-item.is-active .cmdk-item-icon {
                    background: var(--bg-card);
                    border-color: rgba(var(--accent-rgb), 0.3);
                    color: var(--accent);
                }

                .cmdk-item-label { flex: 1; font-weight: 500; }

                .cmdk-item-path {
                    font-family: var(--font-mono);
                    font-size: 0.7rem;
                    color: var(--text-muted);
                }

                .cmdk-empty {
                    padding: 3rem 1rem;
                    text-align: center;
                    color: var(--text-muted);
                    font-size: var(--text-sm);
                }

                .cmdk-footer {
                    display: flex;
                    align-items: center;
                    justify-content: flex-end;
                    gap: 1rem;
                    padding: 0.6rem 1rem;
                    border-top: 1px solid var(--border);
                    background: var(--bg-secondary);
                }

                .cmdk-hint {
                    display: inline-flex;
                    align-items: center;
                    gap: 0.35rem;
                    font-size: var(--text-xs);
                    color: var(--text-muted);
                }

                .cmdk-hint kbd {
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    min-width: 22px;
                    height: 20px;
                    padding: 0 0.35rem;
                    border-radius: var(--radius-xs);
                    background: var(--bg-card);
                    border: 1px solid var(--border);
                    font-family: var(--font-mono);
                    font-size: 0.7rem;
                    color: var(--text-secondary);
                }

                @keyframes cmdk-fade {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                @keyframes cmdk-pop {
                    from { opacity: 0; transform: translateY(-8px) scale(0.98); }
                    to { opacity: 1; transform: translateY(0) scale(1); }
                }
            `}</style>
        </div>
    );

    return createPortal(content, document.body);
};

export default CommandPalette;
