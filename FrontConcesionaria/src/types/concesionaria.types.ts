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
    /** Cupo de usuarios del tenant (lo fija el super_admin). null = ilimitado. */
    limiteUsuarios?: number | null;
    /** Uso actual del cupo. Sólo viene en getMine / getById, no en el listado. */
    usuariosActivos?: number;
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
    /** Cupo de usuarios del tenant. null/ausente = sin límite. */
    limiteUsuarios?: number | null;
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
    /** Cupo de usuarios (sólo super_admin). null = sin límite. */
    limiteUsuarios?: number | null;
}
