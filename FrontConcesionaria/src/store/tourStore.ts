import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Preferencia del onboarding, POR USUARIO y persistida en el navegador (localStorage
 * `autenza-onboarding`), igual que el toggle de tema.
 *
 * - `autoStart`: master switch de los tours automáticos (el panorama del Dashboard y
 *   los mini-tours por módulo). Es el "activar/desactivar según necesidad".
 * - `completed` + `seenVersion`: si ya vio el tour PANORAMA (para no repetirlo solo).
 * - `modulesSeen`: mapa `ruta -> versión vista` de los mini-tours POR MÓDULO, así cada
 *   módulo se muestra una sola vez (y vuelve a aparecer si se sube su versión).
 *
 * El botón "?" y "Ver el tour ahora" relanzan aunque estén marcados como vistos.
 */
export const TOUR_VERSION = 1;

interface TourState {
    autoStart: boolean;
    completed: boolean;
    seenVersion: number;
    modulesSeen: Record<string, number>;
    setAutoStart: (v: boolean) => void;
    markCompleted: () => void;
    markModuleSeen: (key: string, version: number) => void;
    /** Reinicia TODO lo visto (panorama + módulos) para volver a verlos automáticamente. */
    replay: () => void;
    /** ¿Corresponde arrancar el panorama solo al entrar? */
    shouldAutoStart: () => boolean;
    /** ¿Corresponde arrancar el mini-tour del módulo `key` (versión `version`) al entrar? */
    shouldSeeModule: (key: string, version: number) => boolean;
}

export const useTourStore = create<TourState>()(
    persist(
        (set, get) => ({
            autoStart: true,
            completed: false,
            seenVersion: 0,
            modulesSeen: {},
            setAutoStart: (v) => set({ autoStart: v }),
            markCompleted: () => set({ completed: true, seenVersion: TOUR_VERSION }),
            markModuleSeen: (key, version) =>
                set((s) => ({ modulesSeen: { ...s.modulesSeen, [key]: version } })),
            replay: () => set({ completed: false, modulesSeen: {} }),
            shouldAutoStart: () => {
                const s = get();
                return s.autoStart && (!s.completed || s.seenVersion < TOUR_VERSION);
            },
            shouldSeeModule: (key, version) => {
                const s = get();
                return s.autoStart && (s.modulesSeen[key] ?? 0) < version;
            },
        }),
        { name: 'autenza-onboarding' }
    )
);
