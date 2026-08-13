import type { DriveStep } from 'driver.js';

/**
 * Mini-tours POR MÓDULO. Clave = la ruta (pathname). Cada uno arranca la primera vez
 * que el usuario entra a esa sección (rastreado en tourStore.modulesSeen por versión),
 * y el botón "?" del TopBar lanza el del módulo en el que estás.
 *
 * Los pasos se anclan a atributos `data-tour="..."` agregados en cada página. El hook
 * `useTour` descarta los pasos cuyo elemento no está visible (ocultos por rol, mobile),
 * así que un paso con ancla ausente simplemente no aparece.
 *
 * Nota: en Financiaciones, RECAUDAR/REFINANCIAR viven dentro del modal de detalle, así
 * que el tour de la LISTA los explica desde el paso de la tabla (no se anclan directo).
 */
export interface ModuleTour {
    version: number;
    label: string;
    steps: () => DriveStep[];
}

export const MODULE_TOURS: Record<string, ModuleTour> = {
    '/vehiculos': {
        version: 1,
        label: 'Vehículos',
        steps: () => [
            {
                element: '[data-tour="veh-nuevo"]',
                popover: {
                    title: 'Sumá una unidad',
                    description: 'Cargá un vehículo al parque con sus fotos, precios y datos de compra.',
                    side: 'bottom', align: 'end',
                },
            },
            {
                element: '[data-tour="veh-filtros"]',
                popover: {
                    title: 'Encontrá rápido',
                    description: 'Filtrá por estado, tipo y sucursal, y ordená por antigüedad en stock para ver qué conviene repreciar.',
                    side: 'bottom', align: 'start',
                },
            },
            {
                element: '[data-tour="veh-catalogo"]',
                popover: {
                    title: 'Catálogo para compartir',
                    description: 'Exportás lo que estás viendo como catálogo PDF o CSV.',
                    side: 'bottom', align: 'end',
                },
            },
            {
                element: '[data-tour="veh-tabla"]',
                popover: {
                    title: 'Tu stock',
                    description: 'Tocá el estado de una fila para avanzar su ciclo de vida; el color de la antigüedad marca las unidades que llevan mucho tiempo.',
                    side: 'top', align: 'center',
                },
            },
        ],
    },

    '/ventas': {
        version: 1,
        label: 'Ventas',
        steps: () => [
            {
                element: '[data-tour="ventas-nueva"]',
                popover: {
                    title: 'Registrá una venta',
                    description: 'La unidad, el cliente, los pagos y hasta el usado en canje — todo junto. El stock se actualiza solo.',
                    side: 'bottom', align: 'end',
                },
            },
            {
                element: '[data-tour="ventas-kpis"]',
                popover: {
                    title: 'Tus números',
                    description: 'Volumen facturado (por moneda), ventas del mes y entregas pendientes.',
                    side: 'bottom', align: 'center',
                },
            },
            {
                element: '[data-tour="ventas-filtros"]',
                popover: {
                    title: 'Filtrá',
                    description: 'Buscá y acotá por estado de entrega o forma de pago.',
                    side: 'bottom', align: 'start',
                },
            },
            {
                element: '[data-tour="ventas-tabla"]',
                popover: {
                    title: 'Cada operación',
                    description: 'Abrí una venta para auditarla, bajar el comprobante o gestionar la entrega.',
                    side: 'top', align: 'center',
                },
            },
        ],
    },

    '/financiaciones': {
        version: 1,
        label: 'Financiación',
        steps: () => [
            {
                element: '[data-tour="fin-nuevo"]',
                popover: {
                    title: 'Instrumentá un plan',
                    description: 'Armás el plan de cuotas sobre una venta.',
                    side: 'bottom', align: 'end',
                },
            },
            {
                element: '[data-tour="fin-simular"]',
                popover: {
                    title: 'Simulá antes de cerrar',
                    description: 'Mostrale al cliente cómo quedan las cuotas sin crear nada — y compartilas por WhatsApp.',
                    side: 'bottom', align: 'end',
                },
            },
            {
                element: '[data-tour="fin-kpis"]',
                popover: {
                    title: 'Tu cartera',
                    description: 'Cartera administrada, planes activos y alerta de mora, de un vistazo.',
                    side: 'bottom', align: 'center',
                },
            },
            {
                element: '[data-tour="fin-tabla"]',
                popover: {
                    title: 'Cobrá y refinanciá',
                    description: 'Abrí un contrato para registrar el cobro de cada cuota (RECAUDAR) o pasar el saldo impago a un plan nuevo (REFINANCIAR).',
                    side: 'top', align: 'center',
                },
            },
        ],
    },

    '/clientes': {
        version: 1,
        label: 'Clientes',
        steps: () => [
            {
                element: '[data-tour="cli-nuevo"]',
                popover: {
                    title: 'Sumá un cliente',
                    description: 'Cargás un cliente o prospecto a tu cartera.',
                    side: 'bottom', align: 'end',
                },
            },
            {
                element: '[data-tour="cli-funnel"]',
                popover: {
                    title: 'Tu embudo',
                    description: 'El pipeline por etapa: tocá una para filtrar la cartera y ver en qué anda cada lead.',
                    side: 'bottom', align: 'center',
                },
            },
            {
                element: '[data-tour="cli-filtros"]',
                popover: {
                    title: 'Buscá y filtrá',
                    description: 'Por nombre, CUIT o email; por etapa; o "Mis clientes" para ver sólo los tuyos.',
                    side: 'bottom', align: 'start',
                },
            },
            {
                element: '[data-tour="cli-tabla"]',
                popover: {
                    title: 'Cada contacto',
                    description: 'Editá, seguí su etapa o entrá a la ficha completa con su historial.',
                    side: 'top', align: 'center',
                },
            },
        ],
    },

    '/postventa': {
        version: 1,
        label: 'Postventa',
        steps: () => [
            {
                element: '[data-tour="pv-nuevo"]',
                popover: {
                    title: 'Abrí un caso',
                    description: 'Registrás un reclamo o service (o un tipo de caso, según la pestaña).',
                    side: 'bottom', align: 'end',
                },
            },
            {
                element: '[data-tour="pv-stats"]',
                popover: {
                    title: 'El estado del taller',
                    description: 'Pendientes, en curso y resueltos.',
                    side: 'bottom', align: 'center',
                },
            },
            {
                element: '[data-tour="pv-tabs"]',
                popover: {
                    title: 'Tres vistas',
                    description: 'Casos, agenda de taller (con recordatorios por WhatsApp) y el catálogo de tipos.',
                    side: 'bottom', align: 'center',
                },
            },
            {
                element: '[data-tour="pv-filtros"]',
                popover: {
                    title: 'Filtrá los casos',
                    description: 'Por estado, sucursal y tipo.',
                    side: 'bottom', align: 'start',
                },
            },
            {
                element: '[data-tour="pv-tabla"]',
                popover: {
                    title: 'Cada caso',
                    description: 'Avanzá su estado, cargá los costos y mandá el recordatorio del turno.',
                    side: 'top', align: 'center',
                },
            },
        ],
    },

    '/reservas': {
        version: 1,
        label: 'Reservas',
        steps: () => [
            {
                element: '[data-tour="res-nueva"]',
                popover: {
                    title: 'Tomá una reserva',
                    description: 'Reservás un vehículo publicado con su seña.',
                    side: 'bottom', align: 'end',
                },
            },
            {
                element: '[data-tour="res-filtros"]',
                popover: {
                    title: 'Filtrá',
                    description: 'Por estado, sucursal o cliente.',
                    side: 'bottom', align: 'start',
                },
            },
            {
                element: '[data-tour="res-tabla"]',
                popover: {
                    title: 'Tus reservas',
                    description: 'Las que están por vencer se marcan en ámbar. Al cancelar una, el vehículo vuelve a Publicado.',
                    side: 'top', align: 'center',
                },
            },
        ],
    },
};
