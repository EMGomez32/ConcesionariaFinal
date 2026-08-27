import {
    LayoutDashboard,
    Car,
    Users,
    FileText,
    BadgeDollarSign,
    Wrench,
    Settings,
    Store,
    Wallet,
    UserPlus,
    Truck,
    LogIn,
    ArrowLeftRight,
    Bookmark,
    DollarSign,
    CreditCard,
    ClipboardList,
    CalendarClock,
    Gauge,
    GitCompare,
    Inbox,
    MessageCircle,
    ShoppingBag,
    UserRoundCheck,
    // BadgeCheck, // Billing deshabilitado temporalmente (ver ítem comentado abajo)
    BarChart3,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface NavItem {
    label: string;
    path: string;
    icon: LucideIcon;
    /**
     * Label para el breadcrumb, cuando repetir `label` sonaría redundante. Pasa
     * en las rutas de dos segmentos cuyo prefijo ya nombra la sección:
     * /mercadolibre/preguntas sería "Mercado Libre › Mercado Libre".
     */
    crumb?: string;
    keywords?: string[];
    superAdminOnly?: boolean;
    /** Visible sólo para admin/super_admin (gestión administrativa del tenant). */
    adminOnly?: boolean;
    /**
     * Visible sólo si el usuario tiene ALGUNO de estos roles. Para ítems que no
     * son admin-only pero tampoco para todos (p.ej. la agenda de seguimientos:
     * admin y vendedor, no postventa). super_admin se incluye explícito acá.
     */
    roles?: string[];
}

export interface NavSection {
    title: string;
    items: NavItem[];
}

export const NAV_SECTIONS: NavSection[] = [
    {
        title: 'General',
        items: [
            { label: 'Dashboard', path: '/', icon: LayoutDashboard, keywords: ['inicio', 'home', 'panel', 'resumen'] },
            // La gestión de Concesionarias (super_admin) vive en el panel de
            // plataforma separado (/plataforma), no en el shell del tenant.
        ],
    },
    {
        title: 'Gestión de Stock',
        items: [
            { label: 'Vehículos', path: '/vehiculos', icon: Car, keywords: ['autos', 'unidades', 'stock'] },
            { label: 'Comparador', path: '/comparador', icon: GitCompare, keywords: ['comparar', 'versus', 'vs', 'comparativa', 'vehículos'] },
            { label: 'Ingresos', path: '/ingresos', icon: LogIn, keywords: ['compras', 'recepcion'] },
            { label: 'Movimientos', path: '/movimientos', icon: ArrowLeftRight, keywords: ['traslados'] },
            { label: 'Reservas', path: '/reservas', icon: Bookmark, keywords: ['señas', 'reservar'] },
            // Criterio de aceptación 7: `gasto.monto` es el costo de preparación de la
            // unidad. El backend cerró `GET /gastos` a admin; el nav lo espeja para que
            // el vendedor no vea un ítem que sólo lo lleva a un 403.
            { label: 'Gastos Unidades', path: '/gastos', icon: DollarSign, keywords: ['gastos vehículos'], roles: ['admin', 'super_admin'] },
        ],
    },
    {
        title: 'Operaciones',
        items: [
            // Primero de la sección a propósito: es la puerta de entrada del
            // vendedor. Cuando entra alguien al salón, la visita se abre acá, y
            // todo lo demás (cliente, presupuesto, reserva) cuelga de esa visita.
            // SIN super_admin, a diferencia de sus vecinos: la atención presencial la
            // abre un usuario DEL salón (el vendedorId es una FK a un usuario del
            // tenant), y el backend le contesta 400 SIN_CONCESIONARIA a la cuenta de
            // plataforma. Ofrecerle el ítem era mandarlo a una pantalla que no puede usar.
            { label: 'Atenciones', path: '/atenciones', icon: UserRoundCheck, keywords: ['atencion', 'atención', 'visita', 'mostrador', 'salón', 'salon', 'presencial', 'recepción', 'recepcion', 'cliente en el salón', 'test drive', 'permuta'], roles: ['admin', 'vendedor'] },
            { label: 'Consultas', path: '/consultas', icon: Inbox, keywords: ['leads', 'consultas', 'deruedas', 'instagram'], roles: ['admin', 'super_admin', 'vendedor'] },
            // "WhatsApp" quedó corto: la bandeja ahora es multi-canal (WhatsApp,
            // DM de Instagram y Messenger, comentarios de IG y de Facebook). Se
            // MANTIENE 'whatsapp' en keywords para que quien lo busque por el
            // nombre viejo lo siga encontrando en el buscador de comandos.
            { label: 'Bandeja', path: '/conversaciones', icon: MessageCircle, keywords: ['whatsapp', 'instagram', 'messenger', 'facebook', 'dm', 'mensajes directos', 'comentarios', 'chat', 'bandeja', 'mensajes', 'meta'], roles: ['admin', 'super_admin', 'vendedor'] },
            // Pegado a WhatsApp: las dos son bandejas de atención y el vendedor las lee juntas.
            { label: 'Mercado Libre', path: '/mercadolibre/preguntas', icon: ShoppingBag, crumb: 'Preguntas', keywords: ['mercadolibre', 'meli', 'ml', 'preguntas', 'publicaciones', 'publicar'], roles: ['admin', 'super_admin', 'vendedor'] },
            { label: 'Clientes', path: '/clientes', icon: Users, keywords: ['compradores', 'leads'] },
            { label: 'Seguimientos', path: '/seguimientos', icon: CalendarClock, keywords: ['crm', 'contactos', 'agenda', 'próximo contacto', 'llamar'], roles: ['admin', 'super_admin', 'vendedor'] },
            { label: 'Tasaciones', path: '/tasaciones', icon: Gauge, keywords: ['tasación', 'valuación', 'usado', 'permuta', 'cotizar auto'], roles: ['admin', 'super_admin', 'vendedor', 'tasador'] },
            // "El vendedor NO VE: … proveedor". El PADRÓN sigue disponible por API para el
            // formulario de movimientos (mandar una unidad al taller), pero la pantalla —que
            // entra a la ficha, con vehículos comprados y montos pagados— es admin+postventa.
            { label: 'Proveedores', path: '/proveedores', icon: Truck, keywords: ['suppliers'], roles: ['admin', 'super_admin', 'postventa'] },
            { label: 'Presupuestos', path: '/presupuestos', icon: FileText, keywords: ['cotización', 'quote'] },
            { label: 'Ventas', path: '/ventas', icon: BadgeDollarSign, keywords: ['vender'] },
        ],
    },
    {
        title: 'Finanzas & Postventa',
        items: [
            { label: 'Financiación', path: '/financiaciones', icon: Wallet, keywords: ['cuotas', 'préstamos'] },
            { label: 'Fin. Externa', path: '/solicitudes', icon: CreditCard, keywords: ['banco', 'solicitudes'] },
            // Estructura de costos operativos del tenant: `GET /gastos-fijos` es admin.
            { label: 'Gastos Fijos', path: '/gastos-fijos', icon: FileText, keywords: ['operativos'], roles: ['admin', 'super_admin'] },
            { label: 'Postventa', path: '/postventa', icon: Wrench, keywords: ['reclamos', 'service'] },
            { label: 'Reportes', path: '/reportes', icon: BarChart3, keywords: ['informes', 'analytics', 'ventas', 'caja', 'mora', 'rentabilidad'] },
        ],
    },
    {
        title: 'Configuración',
        items: [
            { label: 'Sucursales', path: '/sucursales', icon: Store, keywords: ['locales'] },
            { label: 'Usuarios', path: '/usuarios', icon: UserPlus, keywords: ['empleados', 'staff'], adminOnly: true },
            { label: 'Auditoría', path: '/auditoria', icon: ClipboardList, keywords: ['logs', 'historial'], adminOnly: true },
            // Billing: sección deshabilitada temporalmente. El código (página, API,
            // hooks y backend) queda intacto para reactivarla en el futuro; basta
            // con descomentar esta línea, el ícono BadgeCheck arriba y la ruta en App.tsx.
            // { label: 'Billing', path: '/billing', icon: BadgeCheck, keywords: ['planes', 'facturación', 'suscripción'], adminOnly: true },
            { label: 'Ajustes', path: '/configuracion', icon: Settings, keywords: ['settings', 'preferencias'] },
        ],
    },
];

export const ALL_NAV_ITEMS: NavItem[] = NAV_SECTIONS.flatMap((s) => s.items);

/**
 * Resuelve segmentos de pathname a labels legibles.
 * - segmentos numéricos → "#123"
 * - segmentos conocidos → label del NAV
 * - 'editar' / 'nuevo' → 'Editar' / 'Nuevo'
 */
export function resolveSegmentLabel(segment: string, parentPath: string): string {
    if (/^\d+$/.test(segment)) return `#${segment}`;
    if (segment === 'nuevo') return 'Nuevo';
    if (segment === 'editar') return 'Editar';
    // Prefijo de sección sin página propia: capitalizar el segmento daría
    // "Mercadolibre", que no es como se escribe la marca.
    if (segment === 'mercadolibre') return 'Mercado Libre';
    const path = `${parentPath}/${segment}`;
    const item = ALL_NAV_ITEMS.find((i) => i.path === path);
    if (item) return item.crumb ?? item.label;
    return segment.charAt(0).toUpperCase() + segment.slice(1);
}
