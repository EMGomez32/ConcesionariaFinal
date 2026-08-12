import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Theme = 'dark' | 'light';

interface ThemeState {
    theme: Theme;
    setTheme: (t: Theme) => void;
    toggleTheme: () => void;
}

/**
 * Aplica el tema al <html data-theme>. El CSS (index.css) resuelve los tokens
 * `--bg-*`/`--text-*` con `:root` (claro) y `[data-theme="dark"]` (oscuro), así
 * que con cambiar el atributo toda la app conmuta.
 *
 * El PRIMER pintado ya lo resuelve el script inline de index.html (evita el flash);
 * este store mantiene el atributo en sync cuando el usuario usa el toggle, y lo
 * reafirma tras la hidratación de `persist`.
 */
const applyTheme = (t: Theme) => {
    if (typeof document !== 'undefined') {
        document.documentElement.setAttribute('data-theme', t);
    }
};

export const useThemeStore = create<ThemeState>()(
    persist(
        (set, get) => ({
            // Default dark: la app está diseñada dark-first; el claro es opt-in.
            theme: 'dark',
            setTheme: (t) => {
                applyTheme(t);
                set({ theme: t });
            },
            toggleTheme: () => {
                const next: Theme = get().theme === 'dark' ? 'light' : 'dark';
                applyTheme(next);
                set({ theme: next });
            },
        }),
        {
            name: 'autenza-theme',
            onRehydrateStorage: () => (state) => {
                if (state) applyTheme(state.theme);
            },
        }
    )
);
