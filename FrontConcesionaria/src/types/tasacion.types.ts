export type CondicionTasacion = 'excelente' | 'muy_bueno' | 'bueno' | 'regular' | 'malo';

/** Etiqueta + variante de Badge por condición del usado. */
export const CONDICION_MAP: Record<CondicionTasacion, { label: string; variant: 'success' | 'cyan' | 'info' | 'warning' | 'danger' }> = {
    excelente: { label: 'Excelente', variant: 'success' },
    muy_bueno: { label: 'Muy bueno', variant: 'cyan' },
    bueno: { label: 'Bueno', variant: 'info' },
    regular: { label: 'Regular', variant: 'warning' },
    malo: { label: 'Malo', variant: 'danger' },
};

export const CONDICIONES: CondicionTasacion[] = ['excelente', 'muy_bueno', 'bueno', 'regular', 'malo'];

export interface Tasacion {
    id: number;
    concesionariaId: number;
    clienteId?: number | null;
    tasadorId?: number | null;
    marca: string;
    modelo: string;
    anio?: number | null;
    km?: number | null;
    dominio?: string | null;
    condicion: CondicionTasacion;
    valorEstimado?: number | null;
    moneda: 'ARS' | 'USD';
    fecha: string;
    observaciones?: string | null;
    createdAt: string;
    updatedAt: string;
    cliente?: { id: number; nombre: string; telefono?: string | null };
    tasador?: { id: number; nombre: string };
}

export interface CreateTasacionDto {
    marca: string;
    modelo: string;
    fecha: string;
    clienteId?: number;
    anio?: number;
    km?: number;
    /** Obligatorio: sin la patente el tasador no sabe qué auto revisar. */
    dominio?: string;
    condicion?: CondicionTasacion;
    valorEstimado?: number;
    moneda?: 'ARS' | 'USD';
    observaciones?: string;
}

/** PATCH parcial para completar una tasación existente (el tasador le pone el valor). */
export interface UpdateTasacionDto {
    valorEstimado?: number;
    moneda?: 'ARS' | 'USD';
    condicion?: CondicionTasacion;
    dominio?: string;
    anio?: number;
    km?: number;
    observaciones?: string;
}

export interface TasacionFilter {
    search?: string;
    condicion?: CondicionTasacion;
}
