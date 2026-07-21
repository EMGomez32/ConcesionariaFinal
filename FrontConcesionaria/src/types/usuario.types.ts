export interface Rol {
    id: number;
    nombre: string;
}

export interface Usuario {
    id: number;
    concesionariaId: number | null;
    sucursalId: number | null;
    nombre: string;
    email: string;
    activo: boolean;
    createdAt: string;
    updatedAt: string;
    deletedAt: string | null;
    roles: {
        rolId: number;
        rol: Rol;
    }[];
    sucursal?: {
        id: number;
        nombre: string;
        concesionariaId: number;
    } | null;
    concesionaria?: {
        id: number;
        nombre: string;
    } | null;
}

export interface UsuarioFilter {
    nombre?: string;
    email?: string;
    concesionariaId?: number;
    sucursalId?: number;
}

export interface CreateUsuarioDto {
    // Opcional: para un admin lo inyecta el backend desde el token (su propio
    // tenant). Sólo super_admin lo manda para elegir la concesionaria destino.
    concesionariaId?: number;
    sucursalId?: number;
    nombre: string;
    email: string;
    password?: string; // Solo para create
    activo?: boolean;
    roleIds: number[];
}

export type UpdateUsuarioDto = Partial<CreateUsuarioDto>;
