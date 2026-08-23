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
    // BadgeCheck, // Billing deshabilitado temporalmente (ver ítem comentado abajo)
    BarChart3,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface NavItem {
    label: string;
    path: string;
    icon: LucideIcon;
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
            { label: 'Gastos Unidades', path: '/gastos', icon: DollarSign, keywords: ['gastos vehículos'] },
        ],
    },
    {
        title: 'Operaciones',
        items: [
            { label: 'Consultas', path: '/consultas', icon: Inbox, keywords: ['leads', 'consultas', 'deruedas', 'instagram'], roles: ['admin', 'super_admin', 'vendedor'] },
            { label: 'Clientes', path: '/clientes', icon: Users, keywords: ['compradores', 'leads'] },
            { label: 'Seguimientos', path: '/seguimientos', icon: CalendarClock, keywords: ['crm', 'contactos', 'agenda', 'próximo contacto', 'llamar'], roles: ['admin', 'super_admin', 'vendedor'] },
            { label: 'Tasaciones', path: '/tasaciones', icon: Gauge, keywords: ['tasación', 'valuación', 'usado', 'permuta', 'cotizar auto'], roles: ['admin', 'super_admin', 'vendedor'] },
            { label: 'Proveedores', path: '/proveedores', icon: Truck, keywords: ['suppliers'] },
            { label: 'Presupuestos', path: '/presupuestos', icon: FileText, keywords: ['cotización', 'quote'] },
            { label: 'Ventas', path: '/ventas', icon: BadgeDollarSign, keywords: ['vender'] },
        ],
    },
    {
        title: 'Finanzas & Postventa',
        items: [
            { label: 'Financiación', path: '/financiaciones', icon: Wallet, keywords: ['cuotas', 'préstamos'] },
            { label: 'Fin. Externa', path: '/solicitudes', icon: CreditCard, keywords: ['banco', 'solicitudes'] },
            { label: 'Gastos Fijos', path: '/gastos-fijos', icon: FileText, keywords: ['operativos'] },
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
    const path = `${parentPath}/${segment}`;
    const item = ALL_NAV_ITEMS.find((i) => i.path === path);
    if (item) return item.label;
    return segment.charAt(0).toUpperCase() + segment.slice(1);
}
