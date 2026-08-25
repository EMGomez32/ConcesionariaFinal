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
 * OJO: esa suposición ("ocultos por rol") es la que hace que este archivo NO necesite
 * saber de roles, y durante un tiempo no se cumplió — Ventas, Reservas y Financiaciones
 * mostraban el botón de alta a todos, así que el tour auto-arrancaba y le señalaba a
 * `lectura` un "Registra la operación" que terminaba en un error. Hoy esas páginas
 * esconden el control por rol (hooks/usePermisos.ts) y el filtro vuelve a alcanzar. Si
 * alguna vez se decide mostrar un botón deshabilitado en vez de esconderlo, el paso
 * correspondiente hay que filtrarlo ACÁ, porque un botón disabled sigue siendo visible.
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
                    title: 'Sumá una unidad al parque',
                    description: 'El alta del vehículo —fotos, precios y datos de compra— en un solo formulario.',
                    side: 'bottom', align: 'end',
                },
            },
            {
                element: '[data-tour="veh-filtros"]',
                popover: {
                    title: 'Filtrá y priorizá',
                    description: 'Por estado, tipo y sucursal. Ordená por antigüedad en stock para detectar qué conviene repreciar.',
                    side: 'bottom', align: 'start',
                },
            },
            {
                element: '[data-tour="veh-catalogo"]',
                popover: {
                    title: 'Llevatelo en PDF',
                    description: 'Exportás el listado que estás viendo como catálogo PDF o planilla CSV.',
                    side: 'bottom', align: 'end',
                },
            },
            {
                element: '[data-tour="veh-tabla"]',
                popover: {
                    title: 'Tu stock, vivo',
                    description: 'Tocá el estado de una fila para avanzar su ciclo de vida; el color de la antigüedad delata las unidades que se están durmiendo.',
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
                    title: 'Registrá la operación',
                    description: 'Unidad, cliente, pagos y el usado en canje, todo junto. El auto se marca vendido solo.',
                    side: 'bottom', align: 'end',
                },
            },
            {
                element: '[data-tour="ventas-kpis"]',
                popover: {
                    title: 'El pulso del mes',
                    description: 'Volumen facturado (por moneda), ventas del mes y entregas pendientes.',
                    side: 'bottom', align: 'center',
                },
            },
            {
                element: '[data-tour="ventas-filtros"]',
                popover: {
                    title: 'Afiná la vista',
                    description: 'Buscá y acotá por estado de entrega o forma de pago.',
                    side: 'bottom', align: 'start',
                },
            },
            {
                element: '[data-tour="ventas-tabla"]',
                popover: {
                    title: 'Entrá a cada venta',
                    description: 'Auditala, bajá el comprobante o gestioná la entrega desde el detalle.',
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
                    title: 'Armá el plan',
                    description: 'Instrumentás las cuotas sobre una venta.',
                    side: 'bottom', align: 'end',
                },
            },
            {
                element: '[data-tour="fin-simular"]',
                popover: {
                    title: 'Simulá y enganchá',
                    description: 'Mostrale al cliente cómo quedan las cuotas sin crear nada — y pasásela por WhatsApp.',
                    side: 'bottom', align: 'end',
                },
            },
            {
                element: '[data-tour="fin-kpis"]',
                popover: {
                    title: 'Tu cartera de un vistazo',
                    description: 'Capital administrado, planes activos y la alerta de mora.',
                    side: 'bottom', align: 'center',
                },
            },
            {
                element: '[data-tour="fin-tabla"]',
                popover: {
                    title: 'Cobrá y refinanciá',
                    description: 'Entrá a un contrato para recaudar cada cuota, o pasar el saldo impago a un plan nuevo.',
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
                    title: 'Cargá un cliente',
                    description: 'Sumás un cliente o prospecto a tu cartera.',
                    side: 'bottom', align: 'end',
                },
            },
            {
                element: '[data-tour="cli-funnel"]',
                popover: {
                    title: 'Movés el embudo',
                    description: 'El pipeline por etapa: tocá una para filtrar y ver en qué anda cada lead.',
                    side: 'bottom', align: 'center',
                },
            },
            {
                element: '[data-tour="cli-filtros"]',
                popover: {
                    title: 'Encontralo ya',
                    description: 'Por nombre, CUIT o email; por etapa; o "Mis clientes" para ver sólo los tuyos.',
                    side: 'bottom', align: 'start',
                },
            },
            {
                element: '[data-tour="cli-tabla"]',
                popover: {
                    title: 'Entrá a la ficha',
                    description: 'Editá el contacto, seguí su etapa o abrí su historial completo.',
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
                    description: 'Un reclamo o service — o un tipo de caso, según la pestaña.',
                    side: 'bottom', align: 'end',
                },
            },
            {
                element: '[data-tour="pv-stats"]',
                popover: {
                    title: 'El pulso del taller',
                    description: 'Pendientes, en curso y resueltos.',
                    side: 'bottom', align: 'center',
                },
            },
            {
                element: '[data-tour="pv-tabs"]',
                popover: {
                    title: 'Tres vistas en una',
                    description: 'Casos, agenda de taller (con recordatorio por WhatsApp) y el catálogo de tipos.',
                    side: 'bottom', align: 'center',
                },
            },
            {
                element: '[data-tour="pv-filtros"]',
                popover: {
                    title: 'Acotá los casos',
                    description: 'Por estado, sucursal y tipo.',
                    side: 'bottom', align: 'start',
                },
            },
            {
                element: '[data-tour="pv-tabla"]',
                popover: {
                    title: 'Gestioná cada caso',
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
                    title: 'Acotá la lista',
                    description: 'Por estado, sucursal o cliente.',
                    side: 'bottom', align: 'start',
                },
            },
            {
                element: '[data-tour="res-tabla"]',
                popover: {
                    title: 'Ojo con los vencimientos',
                    description: 'Las reservas por vencer se marcan en ámbar. Si cancelás una, el vehículo vuelve a Publicado.',
                    side: 'top', align: 'center',
                },
            },
        ],
    },
};
