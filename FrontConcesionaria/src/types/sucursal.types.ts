export interface Sucursal {
    id: number;
    concesionariaId: number;
    nombre: string;
    direccion: string | null;
    ciudad: string | null;
    email: string | null;
    telefono: string | null;
    activo: boolean;
    createdAt: string;
    updatedAt: string;
    deletedAt: string | null;
    concesionaria?: {
        id: number;
        nombre: string;
    };
}

export interface SucursalFilter {
    nombre?: string;
    concesionariaId?: number;
    activo?: boolean;
}

export interface CreateSucursalDto {
    concesionariaId: number;
    nombre: string;
    direccion?: string;
    ciudad?: string;
    email?: string;
    telefono?: string;
    activo?: boolean;
}

export type UpdateSucursalDto = Partial<CreateSucursalDto>;
