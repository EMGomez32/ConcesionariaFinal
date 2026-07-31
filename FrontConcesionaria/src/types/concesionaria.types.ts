export interface Concesionaria {
    id: number;
    nombre: string;
    cuit?: string;
    email?: string;
    telefono?: string;
    direccion?: string;
    // Marca de los documentos (PDF). null/ausente = look AUTENZA por defecto.
    logoUrl?: string | null;
    colorPrimario?: string | null;
    colorSecundario?: string | null;
    pdfPie?: string | null;
    sitioWeb?: string | null;
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

export interface UpdateConcesionariaDto {
    nombre?: string;
    cuit?: string;
    email?: string;
    telefono?: string;
    direccion?: string;
    // Marca de los documentos (el logo se sube por su propio endpoint, no acá).
    colorPrimario?: string;
    colorSecundario?: string;
    pdfPie?: string;
    sitioWeb?: string;
}
