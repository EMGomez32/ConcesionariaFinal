import type { DriveStep } from 'driver.js';

/**
 * Pasos del tour "panorama general" (~7-8). Se anclan a atributos `data-tour="..."`
 * que agregamos en el Sidebar / TopBar / Dashboard (el proyecto no tenía ids/selectores
 * estables). El hook `useTour` filtra los pasos cuyo elemento NO está visible (p.ej.
 * ítems ocultos por rol, o el sidebar en mobile), así que acá se listan todos y cada
 * uno aparece sólo si su elemento existe en pantalla.
 */
export function buildTourSteps(roles: string[]): DriveStep[] {
    const isAdmin = roles.includes('admin') || roles.includes('super_admin');

    const steps: DriveStep[] = [
        {
            // Paso de bienvenida (sin elemento → popover centrado).
            popover: {
                title: '¡Te damos la bienvenida! 👋',
                description:
                    'En menos de un minuto te mostramos dónde está cada cosa. Podés saltarlo cuando quieras y retomarlo con el <strong>?</strong> de la barra de arriba.',
                align: 'center',
            },
        },
        {
            element: '[data-tour="sidebar-nav"]',
            popover: {
                title: 'Todo empieza por acá',
                description:
                    'Tu menú, agrupado por tema: stock, operaciones, finanzas y postventa. ¿Necesitás más espacio? Colapsalo con el botón de abajo.',
                side: 'right',
                align: 'start',
            },
        },
        {
            element: '[data-tour="nav:/vehiculos"]',
            popover: {
                title: 'El corazón: tus vehículos',
                description:
                    'Cargá unidades con fotos y precios, y seguí su estado —publicado, reservado, vendido— de un vistazo.',
                side: 'right',
                align: 'start',
            },
        },
        {
            element: '[data-tour="nav:/ventas"]',
            popover: {
                title: 'Cerrá la venta',
                description:
                    'Registrás la operación con sus pagos, extras y hasta el usado en canje. El stock y la ficha del auto se actualizan solos.',
                side: 'right',
                align: 'start',
            },
        },
        {
            element: '[data-tour="nav:/financiaciones"]',
            popover: {
                title: 'Financiá y cobrá',
                description:
                    'Armás el plan de cuotas y llevás la cobranza al día. Cada cuota se cobra y, si hace falta, se refinancia.',
                side: 'right',
                align: 'start',
            },
        },
        {
            element: '[data-tour="dashboard-kpis"]',
            popover: {
                title: 'Tu tablero de un vistazo',
                description:
                    'Los números que importan: stock, ventas, reservas y clientes. Más abajo, las finanzas del mes y las alertas del día.',
                side: 'bottom',
                align: 'center',
            },
        },
        {
            element: '[data-tour="search"]',
            popover: {
                title: 'Buscá sin dar vueltas',
                description:
                    'Un auto, un cliente, una sección… lo que sea, al toque. Atajo desde cualquier pantalla: <kbd>Ctrl/⌘ K</kbd>.',
                side: 'bottom',
                align: 'end',
            },
        },
    ];

    if (isAdmin) {
        steps.push({
            element: '[data-tour="notifications"]',
            popover: {
                title: 'No se te escapa nada',
                description:
                    'La campanita junta lo que necesita atención: turnos, vencimientos, cuotas en mora y más.',
                side: 'bottom',
                align: 'end',
            },
        });
    }

    steps.push(
        {
            element: '[data-tour="theme"]',
            popover: {
                title: 'A tu gusto: claro u oscuro',
                description: 'Cambiá el aspecto de la app con un toque. Tu elección queda guardada.',
                side: 'bottom',
                align: 'end',
            },
        },
        {
            element: '[data-tour="help"]',
            popover: {
                title: '¿Lo querés ver de nuevo?',
                description:
                    'Este <strong>?</strong> relanza el tour cuando quieras. Y si ya te lo sabés, apagalo en <strong>Configuración → Preferencias</strong>. ¡A vender! 🚗',
                side: 'bottom',
                align: 'end',
            },
        },
    );

    return steps;
}
