export const roles = {
    ADMIN: 'admin',
    VENDEDOR: 'vendedor',
    COBRADOR: 'cobrador',
    POSTVENTA: 'postventa',
    LECTURA: 'lectura',
    SUPER_ADMIN: 'super_admin',
} as const;

export type RolNombre = typeof roles[keyof typeof roles];

export const roleNames = Object.values(roles);

export const vehicleStatuses = {
    PREPARACION: 'preparacion',
    PUBLICADO: 'publicado',
    RESERVADO: 'reservado',
    VENDIDO: 'vendido',
    DEVUELTO: 'devuelto',
} as const;

export const budgetStatuses = {
    BORRADOR: 'borrador',
    ENVIADO: 'enviado',
    ACEPTADO: 'aceptado',
    RECHAZADO: 'rechazado',
    VENCIDO: 'vencido',
    CANCELADO: 'cancelado',
} as const;
