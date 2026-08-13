import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useTour } from '../../onboarding/useTour';
import { useTourStore } from '../../store/tourStore';
import { MODULE_TOURS } from '../../onboarding/moduleTours';

/**
 * Auto-inicia el mini-tour del MÓDULO la primera vez que el usuario entra a su ruta.
 * Se monta una sola vez (en el AppLayout) y escucha los cambios de ruta. El tour
 * PANORAMA del Dashboard lo dispara DashboardPage; acá sólo los módulos.
 * No renderiza nada.
 */
export default function ModuleTourController() {
    const location = useLocation();
    const { startModuleTour } = useTour();

    useEffect(() => {
        const path = location.pathname;
        const t = MODULE_TOURS[path];
        if (!t) return;
        if (!useTourStore.getState().shouldSeeModule(path, t.version)) return;
        // Delay para que la página (grillas/KPIs) termine de renderizar antes de anclar.
        const timer = window.setTimeout(() => startModuleTour(path), 700);
        return () => window.clearTimeout(timer);
    }, [location.pathname, startModuleTour]);

    return null;
}
