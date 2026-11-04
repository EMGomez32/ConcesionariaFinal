import client from './client';
// import type { Rol } from '../types/usuario.types';

export const rolesApi = {
    getAll: () => {
        return client.get('/roles');
    },

    getById: (id: number) => {
        return client.get(`/roles/${id}`);
    }
};

/** Nombre de cada rol como lo lee una persona (en la base viven como 'super_admin', 'lectura'…). */
export const ROL_LABEL: Record<string, string> = {
    super_admin: 'Super administrador',
    admin: 'Administrador',
    vendedor: 'Vendedor',
    tasador: 'Tasador',
    cobrador: 'Cobrador',
    postventa: 'Postventa',
    lectura: 'Sólo lectura',
};

/** Un rol nuevo del backend nunca se muestra crudo: "algo_nuevo" → "Algo nuevo". */
export const rolLabel = (rol?: string | null): string => {
    if (!rol) return 'Sin rol';
    return ROL_LABEL[rol] ?? (rol.charAt(0).toUpperCase() + rol.slice(1)).replace(/_/g, ' ');
};
