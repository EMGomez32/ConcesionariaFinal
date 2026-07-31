import client from './client';

export interface SearchHit {
    id: number;
    titulo: string;
    subtitulo: string;
}

export interface GlobalSearchResult {
    vehiculos: SearchHit[];
    clientes: SearchHit[];
    proveedores: SearchHit[];
}

export const searchApi = {
    /** Búsqueda global (vehículos, clientes, proveedores). Mín. 2 caracteres. */
    global: (q: string) => client.get<GlobalSearchResult>('/search', { params: { q } }),
};
