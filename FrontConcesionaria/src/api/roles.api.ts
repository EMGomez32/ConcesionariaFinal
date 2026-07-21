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
