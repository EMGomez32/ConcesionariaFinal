import { useCallback } from 'react';
import { driver, type DriveStep } from 'driver.js';
import 'driver.js/dist/driver.css';
import './tour.css';
import { useAuthStore } from '../store/authStore';
import { useTourStore } from '../store/tourStore';
import { buildTourSteps } from './tourSteps';

/** ¿El elemento del paso está presente Y visible? (filtra ítems ocultos por rol y el
 *  sidebar en mobile, que vive offscreen a la izquierda). */
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
 * Devuelve `startTour()`: arma el tour panorama con la marca AUTENZA, filtra los
 * pasos cuyo ancla no está visible (rol/mobile), y al cerrarse/completarse marca el
 * tour como visto (para no repetirlo solo). Se usa en el auto-inicio del Dashboard,
 * en el botón "?" del TopBar y en Configuración → Preferencias.
 */
export function useTour() {
    const roles = useAuthStore((s) => s.user?.roles ?? []);

    const startTour = useCallback(() => {
        // Guard: no apilar tours. El auto-inicio del Dashboard y un lanzamiento manual
        // ("?" / "Ver el tour ahora") pueden coincidir; si ya hay uno activo, no abrimos otro.
        if (typeof document !== 'undefined' && document.querySelector('.driver-popover')) return;
        const steps = buildTourSteps(roles).filter(stepVisible);
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
            // onDestroyStarted (NO onDestroyed, que no dispara de forma confiable): se
            // llama al cerrar por cualquier vía (X / "Listo" / Esc / click en el overlay).
            // Al overridearlo hay que destruir a mano. Marcamos "visto" para no repetir
            // el auto-inicio la próxima vez.
            onDestroyStarted: () => {
                useTourStore.getState().markCompleted();
                d.destroy();
            },
        });
        d.drive();
    }, [roles]);

    return { startTour };
}
