export interface Concesionaria {
    id: number;
    nombre: string;
    cuit?: string;
    email?: string;
    telefono?: string;
    direccion?: string;
    createdAt: string;
    updatedAt: string;
    deletedAt: string | null;
}

export interface ConcesionariaFilter {
    nombre?: string;
    cuit?: string;
}

export interface CreateConcesionariaDto {
    nombre: string;
    cuit?: string;
    email?: string;
    telefono?: string;
    direccion?: string;
}

export type UpdateConcesionariaDto = Partial<CreateConcesionariaDto>;
