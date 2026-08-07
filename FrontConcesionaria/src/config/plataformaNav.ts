import { Building2, Store, UserPlus } from 'lucide-react';
import type { NavSection } from './nav';

/**
 * Navegación del panel de PLATAFORMA (super_admin), separado del shell operativo
 * del tenant. Sólo administración global: crear/editar concesionarias, sus
 * sucursales y sus usuarios (eligiendo la concesionaria destino). El super_admin
 * no ve las pantallas operativas de la concesionaria (ventas, stock, etc.).
 */
export const PLATAFORMA_NAV: NavSection[] = [
    {
        title: 'Plataforma',
        items: [
            { label: 'Concesionarias', path: '/plataforma/concesionarias', icon: Building2, keywords: ['empresas', 'tenants', 'clientes'] },
            { label: 'Sucursales', path: '/plataforma/sucursales', icon: Store, keywords: ['locales', 'branches'] },
            { label: 'Usuarios', path: '/plataforma/usuarios', icon: UserPlus, keywords: ['admins', 'staff', 'cuentas'] },
        ],
    },
];
