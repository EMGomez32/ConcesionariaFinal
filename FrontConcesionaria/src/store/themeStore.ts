import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Theme = 'dark' | 'light';

interface ThemeState {
    /** Tema que se ve ahora (el elegido, o el del sistema si no eligió). */
    theme: Theme;
    /** Lo que eligió el usuario con el toggle. null = nunca eligió: sigue al sistema. */
    elegido: Theme | null;
    setTheme: (t: Theme) => void;
    toggleTheme: () => void;
    /** Vuelve a seguir el tema del sistema (olvida la elección). */
    seguirSistema: () => void;
}

const CONSULTA_OSCURO = '(prefers-color-scheme: dark)';

/** Tema del sistema operativo / navegador. Sin matchMedia (tests, SSR) → claro. */
export const temaDelSistema = (): Theme => {
    if (typeof window === 'undefined' || !window.matchMedia) return 'light';
    return window.matchMedia(CONSULTA_OSCURO).matches ? 'dark' : 'light';
};

/**
 * Aplica el tema al <html data-theme>. El CSS (index.css) resuelve los tokens
 * `--bg-*`/`--text-*` con `:root` (claro) y `[data-theme="dark"]` (oscuro), así
 * que con cambiar el atributo toda la app conmuta.
 *
 * El PRIMER pintado ya lo resuelve el script inline de index.html con la misma
 * regla (evita el flash); este store mantiene el atributo en sync cuando el
 * usuario usa el toggle o cuando cambia el tema del sistema.
 */
const applyTheme = (t: Theme) => {
    if (typeof document !== 'undefined') {
        document.documentElement.setAttribute('data-theme', t);
    }
};

/**
 * Regla del tema:
 *  - Si el usuario nunca eligió, se sigue `prefers-color-scheme` y se reacciona
 *    en vivo cuando el sistema cambia (p.ej. el modo oscuro automático de noche).
 *  - El toggle guarda una elección explícita (localStorage `autenza-theme`) y
 *    desde ahí el sistema ya no la pisa.
 */
export const useThemeStore = create<ThemeState>()(
    persist(
        (set, get) => ({
            theme: temaDelSistema(),
            elegido: null,
            setTheme: (t) => {
                applyTheme(t);
                set({ theme: t, elegido: t });
            },
            toggleTheme: () => {
                const next: Theme = get().theme === 'dark' ? 'light' : 'dark';
                applyTheme(next);
                set({ theme: next, elegido: next });
            },
            seguirSistema: () => {
                const t = temaDelSistema();
                applyTheme(t);
                set({ theme: t, elegido: null });
            },
        }),
        {
            name: 'autenza-theme',
            // v1: se persiste sólo la ELECCIÓN. En v0 se guardaba `theme`, y como el
            // store sólo escribía al usar el toggle, un `theme` guardado siempre fue
            // una elección explícita: se migra tal cual.
            version: 1,
            partialize: (s) => ({ elegido: s.elegido }),
            migrate: (persistido) => {
                const viejo = (persistido ?? {}) as { theme?: unknown; elegido?: unknown };
                const t = viejo.elegido ?? viejo.theme;
                return { elegido: t === 'dark' || t === 'light' ? t : null };
            },
            merge: (persistido, actual) => {
                const e = (persistido as { elegido?: unknown } | undefined)?.elegido;
                const elegido: Theme | null = e === 'dark' || e === 'light' ? e : null;
                return { ...actual, elegido, theme: elegido ?? temaDelSistema() };
            },
            onRehydrateStorage: () => (state) => {
                if (state) applyTheme(state.theme);
            },
        }
    )
);

// Mientras no haya elección, el tema acompaña los cambios del sistema en vivo.
if (typeof window !== 'undefined' && window.matchMedia) {
    const mq = window.matchMedia(CONSULTA_OSCURO);
    const alCambiar = (e: MediaQueryListEvent) => {
        if (useThemeStore.getState().elegido) return;
        const t: Theme = e.matches ? 'dark' : 'light';
        applyTheme(t);
        useThemeStore.setState({ theme: t });
    };
    if (mq.addEventListener) mq.addEventListener('change', alCambiar);
    else mq.addListener?.(alCambiar);
}
