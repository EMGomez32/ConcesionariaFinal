import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Search, ArrowUpDown, CornerDownLeft, X, Car, User, Truck, Loader2 } from 'lucide-react';
import { NAV_SECTIONS, type NavItem } from '../../config/nav';
import { useAuthStore } from '../../store/authStore';
import { useCommandPaletteStore } from '../../store/commandPaletteStore';
import { searchApi, type GlobalSearchResult } from '../../api/search.api';

const norm = (s: string) =>
    s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

interface ScoredItem {
    item: NavItem;
    section: string;
    score: number;
}

type IconType = typeof Search;

// Fila unificada del palette: sirve tanto para resultados de datos (vehículo,
// cliente, proveedor) como para navegación a páginas. Todo se navega igual.
interface Row {
    key: string;
    group: string;
    icon: IconType;
    label: string;
    sublabel?: string;
    path: string;
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
    const [data, setData] = useState<GlobalSearchResult | null>(null);
    const [loadingData, setLoadingData] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLDivElement>(null);
    const reqIdRef = useRef(0);

    // Navegación por páginas (scoring sobre el nav), como antes.
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

    // Filas unificadas: primero los resultados de datos (lo que el usuario suele
    // buscar), después las páginas del nav. Todo navega con ↑↓ + Enter.
    const rows = useMemo<Row[]>(() => {
        const out: Row[] = [];
        if (data) {
            for (const v of data.vehiculos) out.push({ key: `v-${v.id}`, group: 'Vehículos', icon: Car, label: v.titulo, sublabel: v.subtitulo, path: `/vehiculos/${v.id}` });
            for (const c of data.clientes) out.push({ key: `c-${c.id}`, group: 'Clientes', icon: User, label: c.titulo, sublabel: c.subtitulo, path: `/clientes/${c.id}` });
            for (const p of data.proveedores) out.push({ key: `p-${p.id}`, group: 'Proveedores', icon: Truck, label: p.titulo, sublabel: p.subtitulo, path: `/proveedores/${p.id}` });
        }
        for (const c of candidates) out.push({ key: `nav-${c.item.path}`, group: c.section, icon: c.item.icon, label: c.item.label, sublabel: c.item.path, path: c.item.path });
        return out;
    }, [data, candidates]);

    // Reset al abrir.
    useEffect(() => {
        if (!isOpen) return;
        setQuery('');
        setActiveIdx(0);
        setData(null);
        const t = setTimeout(() => inputRef.current?.focus(), 50);
        return () => clearTimeout(t);
    }, [isOpen]);

    useEffect(() => {
        setActiveIdx(0);
    }, [query]);

    // Búsqueda de datos con debounce. Se descarta la respuesta si ya salió una
    // query más nueva (evita parpadeos por respuestas fuera de orden).
    useEffect(() => {
        if (!isOpen) return;
        const q = query.trim();
        // Se incrementa SIEMPRE (antes del guard) para invalidar cualquier request
        // en vuelo: si el usuario baja de 2 chars o cierra/reabre, la respuesta
        // vieja ya no matchea el id vigente y se descarta.
        const myId = ++reqIdRef.current;
        if (q.length < 2) { setData(null); setLoadingData(false); return; }
        setLoadingData(true);
        const t = setTimeout(async () => {
            try {
                const res = await searchApi.global(q);
                if (reqIdRef.current === myId) { setData(res); setActiveIdx(0); }
            } catch {
                if (reqIdRef.current === myId) setData(null);
            } finally {
                if (reqIdRef.current === myId) setLoadingData(false);
            }
        }, 250);
        return () => clearTimeout(t);
    }, [query, isOpen]);

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
                setActiveIdx((i) => Math.min(i + 1, rows.length - 1));
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActiveIdx((i) => Math.max(i - 1, 0));
            } else if (e.key === 'Enter') {
                e.preventDefault();
                const target = rows[activeIdx];
                if (target) {
                    navigate(target.path);
                    close();
                }
            }
        };

        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [isOpen, rows, activeIdx, navigate, close]);

    useEffect(() => {
        if (!isOpen) return;
        const node = listRef.current?.querySelector<HTMLElement>(`[data-idx="${activeIdx}"]`);
        node?.scrollIntoView({ block: 'nearest' });
    }, [activeIdx, isOpen]);

    if (!isOpen) return null;

    // Índice lineal por fila (orden visible) para que ↑↓ y click coincidan.
    const flatIndex = new Map<string, number>();
    rows.forEach((r, i) => flatIndex.set(r.key, i));

    const grouped = rows.reduce<Record<string, Row[]>>((acc, r) => {
        (acc[r.group] ||= []).push(r);
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
                        placeholder="Buscar vehículos, clientes, proveedores, páginas…"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        autoComplete="off"
                        spellCheck={false}
                    />
                    {loadingData && <Loader2 size={16} className="cmdk-spin" aria-hidden="true" />}
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
                    {rows.length === 0 ? (
                        <div className="cmdk-empty">
                            {loadingData ? 'Buscando…' : `Sin resultados para “${query}”`}
                        </div>
                    ) : (
                        Object.entries(grouped).map(([section, items]) => (
                            <div key={section} className="cmdk-group">
                                <div className="cmdk-group-title">{section}</div>
                                {items.map((r) => {
                                    const idx = flatIndex.get(r.key) ?? 0;
                                    const Icon = r.icon;
                                    return (
                                        <button
                                            key={r.key}
                                            type="button"
                                            data-idx={idx}
                                            className={`cmdk-item ${idx === activeIdx ? 'is-active' : ''}`}
                                            onMouseEnter={() => setActiveIdx(idx)}
                                            onClick={() => {
                                                navigate(r.path);
                                                close();
                                            }}
                                        >
                                            <span className="cmdk-item-icon">
                                                <Icon size={16} />
                                            </span>
                                            <span className="cmdk-item-label">{r.label}</span>
                                            {r.sublabel && <span className="cmdk-item-path">{r.sublabel}</span>}
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
                    max-width: 45%;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }

                .cmdk-spin {
                    color: var(--text-muted);
                    flex-shrink: 0;
                    animation: cmdk-spin 0.8s linear infinite;
                }
                @keyframes cmdk-spin { to { transform: rotate(360deg); } }

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
