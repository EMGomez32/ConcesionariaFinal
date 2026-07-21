export interface Cliente {
    id: number;
    concesionariaId: number;
    nombre: string;
    dni?: string;
    telefono?: string;
    email?: string;
    direccion?: string;
    observaciones?: string;
    createdAt: string;
    updatedAt: string;
    concesionaria?: {
        id: number;
        nombre: string;
    };
}

export interface ClienteFilter {
    /** Búsqueda libre: matchea nombre, DNI/CUIT, email o teléfono. */
    search?: string;
    nombre?: string;
    dni?: string;
    telefono?: string;
    concesionariaId?: number;
}
