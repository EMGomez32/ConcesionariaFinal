export interface Proveedor {
    id: number;
    concesionariaId: number;
    nombre: string;
    tipo?: string;
    telefono?: string;
    email?: string;
    direccion?: string;
    activo: boolean;
    createdAt: string;
    updatedAt: string;
}

export interface ProveedorFilter {
    nombre?: string;
    tipo?: string;
    activo?: boolean;
}
