import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * matchMedia controlable: jsdom no lo implementa. `cambiar(true)` simula que el
 * sistema pasó a oscuro y avisa a los listeners como lo haría el navegador.
 */
function simularSistema(oscuroInicial: boolean) {
    let oscuro = oscuroInicial;
    const listeners = new Set<(e: MediaQueryListEvent) => void>();
    const mql = {
        get matches() { return oscuro; },
        media: '(prefers-color-scheme: dark)',
        addEventListener: (_: string, fn: (e: MediaQueryListEvent) => void) => listeners.add(fn),
        removeEventListener: (_: string, fn: (e: MediaQueryListEvent) => void) => listeners.delete(fn),
    };
    vi.stubGlobal('matchMedia', vi.fn(() => mql));
    return {
        cambiar(nuevo: boolean) {
            oscuro = nuevo;
            listeners.forEach((fn) => fn({ matches: nuevo } as MediaQueryListEvent));
        },
    };
}

/** Importa el store de cero (el módulo registra el listener del sistema al cargar). */
const cargarStore = async () => (await import('./themeStore')).useThemeStore;

const tema = () => document.documentElement.getAttribute('data-theme');

describe('themeStore: sigue al sistema hasta que el usuario elige', () => {
    beforeEach(() => {
        vi.resetModules();
        localStorage.clear();
        document.documentElement.removeAttribute('data-theme');
    });
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('sin elección, toma el tema del sistema', async () => {
        simularSistema(true);
        const store = await cargarStore();
        expect(store.getState().theme).toBe('dark');
        expect(store.getState().elegido).toBeNull();
    });

    it('sin elección, reacciona cuando cambia el sistema', async () => {
        const sistema = simularSistema(false);
        const store = await cargarStore();
        expect(store.getState().theme).toBe('light');
        sistema.cambiar(true);
        expect(store.getState().theme).toBe('dark');
        expect(tema()).toBe('dark');
    });

    it('el toggle guarda la elección y el sistema ya no la pisa', async () => {
        const sistema = simularSistema(false);
        const store = await cargarStore();
        store.getState().toggleTheme();
        expect(store.getState().theme).toBe('dark');
        expect(store.getState().elegido).toBe('dark');
        expect(JSON.parse(localStorage.getItem('autenza-theme') ?? '{}').state).toEqual({ elegido: 'dark' });
        sistema.cambiar(false);
        expect(store.getState().theme).toBe('dark');
        expect(tema()).toBe('dark');
    });

    it('una elección guardada gana sobre el sistema al recargar', async () => {
        simularSistema(true);
        localStorage.setItem('autenza-theme', JSON.stringify({ state: { elegido: 'light' }, version: 1 }));
        const store = await cargarStore();
        expect(store.getState().theme).toBe('light');
        expect(tema()).toBe('light');
    });

    it('migra la elección del formato viejo (v0 guardaba `theme`)', async () => {
        simularSistema(false);
        localStorage.setItem('autenza-theme', JSON.stringify({ state: { theme: 'dark' }, version: 0 }));
        const store = await cargarStore();
        expect(store.getState().elegido).toBe('dark');
        expect(store.getState().theme).toBe('dark');
    });

    it('seguirSistema olvida la elección', async () => {
        simularSistema(true);
        const store = await cargarStore();
        store.getState().setTheme('light');
        store.getState().seguirSistema();
        expect(store.getState().elegido).toBeNull();
        expect(store.getState().theme).toBe('dark');
    });
});
