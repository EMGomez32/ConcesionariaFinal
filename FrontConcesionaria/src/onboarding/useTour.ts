import { useCallback } from 'react';
import { driver, type DriveStep } from 'driver.js';
import 'driver.js/dist/driver.css';
import './tour.css';
import { useAuthStore } from '../store/authStore';
import { useTourStore } from '../store/tourStore';
import { buildTourSteps } from './tourSteps';
import { MODULE_TOURS } from './moduleTours';

/** ¿El elemento del paso está presente Y visible? (filtra ítems ocultos por rol y el
 *  sidebar/elementos en mobile, que viven offscreen a la izquierda). */
function stepVisible(step: DriveStep): boolean {
    if (!step.element) return true; // paso centrado (bienvenida)
    const el = typeof step.element === 'string' ? document.querySelector(step.element) : step.element;
    if (!el) return false;
    const r = (el as HTMLElement).getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;
    if (r.right <= 0 || r.left >= window.innerWidth) return false; // fuera del viewport horizontal
    const cs = window.getComputedStyle(el as HTMLElement);
    return cs.visibility !== 'hidden' && cs.display !== 'none';
}

/**
 * Tours de onboarding (driver.js) con la marca AUTENZA:
 *  - `startTour()`: el PANORAMA general (Dashboard + navegación).
 *  - `startModuleTour(path)`: el mini-tour del MÓDULO de esa ruta (si existe).
 *
 * Ambos comparten el mismo motor: filtran los pasos cuyo ancla no está visible
 * (rol/mobile), no apilan tours (guard), y al cerrarse marcan lo visto (para no
 * repetir el auto-inicio). Se usan en el auto-inicio (Dashboard + ModuleTourController),
 * el botón "?" del TopBar (contextual) y Configuración → Preferencias.
 */
export function useTour() {
    const roles = useAuthStore((s) => s.user?.roles ?? []);

    const run = useCallback((rawSteps: DriveStep[], onSeen: () => void) => {
        // Guard: no apilar tours. El auto-inicio y un lanzamiento manual pueden coincidir.
        if (typeof document !== 'undefined' && document.querySelector('.driver-popover')) return;
        const steps = rawSteps.filter(stepVisible);
        if (steps.length === 0) return;

        const d = driver({
            showProgress: true,
            progressText: '{{current}} de {{total}}',
            allowClose: true,
            overlayColor: 'rgba(2, 6, 23, 0.72)',
            stagePadding: 6,
            stageRadius: 12,
            popoverClass: 'autenza-tour-popover',
            nextBtnText: 'Siguiente',
            prevBtnText: 'Atrás',
            doneBtnText: 'Listo',
            steps,
            // onDestroyStarted (NO onDestroyed, que no dispara confiablemente): se llama
            // al cerrar por cualquier vía (X / "Listo" / Esc / overlay). Al overridearlo
            // hay que destruir a mano. Marcamos "visto" para no repetir el auto-inicio.
            onDestroyStarted: () => {
                onSeen();
                d.destroy();
            },
        });
        d.drive();
    }, []);

    const startTour = useCallback(() => {
        run(buildTourSteps(roles), () => useTourStore.getState().markCompleted());
    }, [roles, run]);

    const startModuleTour = useCallback((key: string) => {
        const t = MODULE_TOURS[key];
        if (!t) return;
        run(t.steps(), () => useTourStore.getState().markModuleSeen(key, t.version));
    }, [run]);

    return { startTour, startModuleTour };
}
