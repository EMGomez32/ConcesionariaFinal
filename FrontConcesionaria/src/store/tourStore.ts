import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Preferencia del tour de bienvenida (onboarding), POR USUARIO y persistida en el
 * navegador (localStorage `autenza-onboarding`), igual que el toggle de tema.
 *
 * - `autoStart`: si el tour se muestra SOLO cuando el usuario entra por primera vez.
 *   Es el "activar/desactivar según necesidad": el usuario lo puede apagar en
 *   Configuración → Preferencias, y prenderlo de nuevo cuando quiera.
 * - `completed`: marca que ya lo vio/cerró, para no repetirlo automáticamente. El
 *   botón "?" del TopBar y "Ver el tour" en Preferencias lo relanzan igual.
 * - `version`: si algún día el tour cambia sustancialmente, se sube y vuelve a
 *   aparecer una vez (comparando contra `seenVersion`).
 */
export const TOUR_VERSION = 1;

interface TourState {
    autoStart: boolean;
    completed: boolean;
    seenVersion: number;
    setAutoStart: (v: boolean) => void;
    markCompleted: () => void;
    /** Reinicia el flag para volver a verlo automáticamente. */
    replay: () => void;
    /** ¿Corresponde arrancarlo solo al entrar? */
    shouldAutoStart: () => boolean;
}

export const useTourStore = create<TourState>()(
    persist(
        (set, get) => ({
            autoStart: true,
            completed: false,
            seenVersion: 0,
            setAutoStart: (v) => set({ autoStart: v }),
            markCompleted: () => set({ completed: true, seenVersion: TOUR_VERSION }),
            replay: () => set({ completed: false }),
            shouldAutoStart: () => {
                const s = get();
                return s.autoStart && (!s.completed || s.seenVersion < TOUR_VERSION);
            },
        }),
        { name: 'autenza-onboarding' }
    )
);
