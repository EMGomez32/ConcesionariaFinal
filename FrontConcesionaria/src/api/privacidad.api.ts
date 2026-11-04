import client from './client';
import type { Cliente } from '../types/cliente.types';

/**
 * Derechos del titular de los datos (Ley 25.326, arts. 14 a 16). Espejo de
 * BackConcesionaria/src/interface/routes/privacidad.routes.ts: todo es de admin salvo
 * la revocación del consentimiento, que también registra el vendedor.
 */

export type TipoSolicitudTitular = 'acceso' | 'rectificacion' | 'supresion' | 'bloqueo' | 'oposicion';
export type EstadoSolicitudTitular = 'pendiente' | 'en_curso' | 'resuelta' | 'rechazada';

export const TIPO_SOLICITUD_LABEL: Record<TipoSolicitudTitular, string> = {
    acceso: 'Acceso a sus datos',
    rectificacion: 'Rectificación',
    supresion: 'Supresión',
    bloqueo: 'Bloqueo',
    oposicion: 'Oposición al contacto',
};

/** Plazo legal que muestra el formulario (el backend es el que lo calcula). */
export const PLAZO_SOLICITUD_LABEL: Record<TipoSolicitudTitular, string> = {
    acceso: '10 días corridos (art. 14)',
    rectificacion: '5 días hábiles (art. 16)',
    supresion: '5 días hábiles (art. 16)',
    bloqueo: '5 días hábiles (art. 16)',
    oposicion: '5 días hábiles',
};

export const ESTADO_SOLICITUD_META: Record<EstadoSolicitudTitular, { label: string; variant: 'warning' | 'cyan' | 'success' | 'default' }> = {
    pendiente: { label: 'Pendiente', variant: 'warning' },
    en_curso: { label: 'En curso', variant: 'cyan' },
    resuelta: { label: 'Resuelta', variant: 'success' },
    rechazada: { label: 'Rechazada', variant: 'default' },
};

export interface SolicitudTitular {
    id: number;
    concesionariaId: number;
    clienteId: number | null;
    /** La ficha vinculada. `deletedAt` = suprimida o dada de baja: ya no se abre. */
    cliente: { id: number; nombre: string; apellido?: string | null; deletedAt?: string | null; suprimidoEn?: string | null } | null;
    tipo: TipoSolicitudTitular;
    titularNombre: string;
    canal: string | null;
    detalle: string | null;
    /** YYYY-MM-DD */
    recibidaEl: string;
    /** YYYY-MM-DD: vencimiento legal calculado al registrarla. */
    venceEl: string;
    estado: EstadoSolicitudTitular;
    resolucion: string | null;
    resueltaEn: string | null;
    vencida: boolean;
    /** Días hasta el vencimiento (negativo = vencida). null si está cerrada. */
    diasRestantes: number | null;
    registradaPor: string | null;
    atendidaPor: string | null;
    createdAt: string;
}

export interface ListadoSolicitudes {
    results: SolicitudTitular[];
    page: number;
    limit: number;
    totalPages: number;
    totalResults: number;
    /** Abiertas con el plazo legal vencido (de todo el registro, no de la página). */
    vencidas: number;
}

export interface CrearSolicitudDto {
    tipo: TipoSolicitudTitular;
    titularNombre: string;
    clienteId?: number;
    canal?: string;
    detalle?: string;
    recibidaEl?: string;
}

export interface ActualizarSolicitudDto {
    estado?: EstadoSolicitudTitular;
    resolucion?: string;
    canal?: string;
    detalle?: string;
}

export interface ResultadoSupresion {
    clienteId: number;
    modo: 'total' | 'parcial';
    obligaciones: { motivos: string[]; hayObligacion: boolean };
    conservado: string[];
    suprimido: Record<string, number>;
    adjuntosBorrados: number;
    /** Texto para responderle al titular. */
    explicacion: string;
}

export const privacidadApi = {
    /** Informe de acceso (JSON descargable). getRaw: hace falta el Content-Disposition. */
    informe: (clienteId: number) =>
        client.getRaw<Blob>(`/privacidad/clientes/${clienteId}/informe`, { responseType: 'blob' }),

    suprimir: (clienteId: number, motivo: string) =>
        client.post<ResultadoSupresion>(`/privacidad/clientes/${clienteId}/suprimir`, { motivo, confirmacion: 'SUPRIMIR' }),

    revocarConsentimiento: (clienteId: number, motivo?: string) =>
        client.post<Cliente>(`/privacidad/clientes/${clienteId}/revocar-consentimiento`, { motivo: motivo || undefined }),

    bloquear: (clienteId: number, motivo: string) =>
        client.post<Cliente>(`/privacidad/clientes/${clienteId}/bloquear`, { motivo }),

    desbloquear: (clienteId: number, motivo: string) =>
        client.post<Cliente>(`/privacidad/clientes/${clienteId}/desbloquear`, { motivo }),

    listarSolicitudes: (params: { estado?: EstadoSolicitudTitular; tipo?: TipoSolicitudTitular; abiertas?: boolean; clienteId?: number; page?: number; limit?: number } = {}) =>
        client.get<ListadoSolicitudes>('/privacidad/solicitudes', { params }),

    crearSolicitud: (data: CrearSolicitudDto) =>
        client.post<SolicitudTitular>('/privacidad/solicitudes', data),

    actualizarSolicitud: (id: number, data: ActualizarSolicitudDto) =>
        client.patch<SolicitudTitular>(`/privacidad/solicitudes/${id}`, data),
};

/**
 * Versión del texto de consentimiento que muestra la pantalla de la atención. Tiene que
 * coincidir, palabra por palabra, con el catálogo del backend
 * (BackConcesionaria/src/domain/services/consentimiento.ts): el backend guarda la
 * versión como evidencia de QUÉ se le informó al titular.
 */
export const CONSENTIMIENTO_CONTACTO = {
    version: 'contacto-v1',
    texto: 'El cliente presta conformidad para ser contactado (Ley 25.326 de Protección de Datos Personales).',
} as const;
