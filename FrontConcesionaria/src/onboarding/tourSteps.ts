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
                title: '¡Bienvenido a AUTENZA! 👋',
                description:
                    'Te muestro lo esencial en 30 segundos para que sepas moverte. Podés saltarlo cuando quieras, y volver a verlo desde el botón <strong>?</strong> arriba a la derecha.',
                align: 'center',
            },
        },
        {
            element: '[data-tour="sidebar-nav"]',
            popover: {
                title: 'Tu navegación',
                description:
                    'Desde acá entrás a todos los módulos: stock, operaciones, finanzas y postventa. Podés colapsar el menú con el botón de abajo.',
                side: 'right',
                align: 'start',
            },
        },
        {
            element: '[data-tour="nav:/vehiculos"]',
            popover: {
                title: 'Vehículos',
                description:
                    'Tu inventario: alta de unidades, fotos, precios y estado (publicado, reservado, vendido).',
                side: 'right',
                align: 'start',
            },
        },
        {
            element: '[data-tour="nav:/ventas"]',
            popover: {
                title: 'Ventas',
                description:
                    'Registrás las ventas con sus pagos, extras y vehículos en canje. El stock se actualiza solo.',
                side: 'right',
                align: 'start',
            },
        },
        {
            element: '[data-tour="nav:/financiaciones"]',
            popover: {
                title: 'Financiación',
                description:
                    'Armás planes de cuotas y llevás la cobranza. Cada cuota se puede cobrar y refinanciar.',
                side: 'right',
                align: 'start',
            },
        },
        {
            element: '[data-tour="dashboard-kpis"]',
            popover: {
                title: 'Tu tablero',
                description:
                    'Un vistazo rápido a la operación: stock, ventas, reservas y clientes. Más abajo tenés finanzas y alertas del día.',
                side: 'bottom',
                align: 'center',
            },
        },
        {
            element: '[data-tour="search"]',
            popover: {
                title: 'Buscador rápido',
                description:
                    'Encontrá cualquier cosa al instante —una unidad, un cliente, una sección— con <kbd>Ctrl/⌘ K</kbd>.',
                side: 'bottom',
                align: 'end',
            },
        },
    ];

    if (isAdmin) {
        steps.push({
            element: '[data-tour="notifications"]',
            popover: {
                title: 'Alertas',
                description:
                    'La campanita te avisa lo que necesita atención: turnos, vencimientos, mora y más.',
                side: 'bottom',
                align: 'end',
            },
        });
    }

    steps.push(
        {
            element: '[data-tour="theme"]',
            popover: {
                title: 'Tema claro u oscuro',
                description: 'Cambiá el aspecto de la app a tu gusto. Tu elección se recuerda.',
                side: 'bottom',
                align: 'end',
            },
        },
        {
            element: '[data-tour="help"]',
            popover: {
                title: '¿Perdido? Volvé acá',
                description:
                    'Este botón <strong>?</strong> vuelve a lanzar el tour cuando quieras. Y podés apagarlo en Configuración → Preferencias. ¡A vender! 🚗',
                side: 'bottom',
                align: 'end',
            },
        },
    );

    return steps;
}
