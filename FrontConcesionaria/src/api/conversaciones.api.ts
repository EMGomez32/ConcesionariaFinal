import client from './client';

/** Estado del hilo dentro de la bandeja. */
export type EstadoConversacion = 'abierta' | 'cerrada' | 'archivada';

export type DireccionMensaje = 'entrante' | 'saliente';

export type TipoMensajeWhatsapp =
    | 'texto'
    | 'imagen'
    | 'audio'
    | 'video'
    | 'documento'
    | 'ubicacion'
    | 'contacto'
    | 'sistema';

/** Ciclo de vida del mensaje. Los salientes arrancan en `pendiente` (el envío
 *  real lo hace el worker con el espaciado anti-ban); `recibido` es de entrantes. */
export type EstadoMensajeWhatsapp =
    | 'pendiente'
    | 'enviando'
    | 'enviado'
    | 'entregado'
    | 'leido'
    | 'fallido'
    | 'recibido';

/** Referencia mínima a un usuario (vendedor asignado, autor del saliente). */
export interface UsuarioRef {
    id: number;
    nombre: string;
}

/** Fila del listado de la bandeja. */
export interface ConversacionListItem {
    id: number;
    telefono: string;
    nombreContacto: string | null;
    estado: EstadoConversacion;
    /** Entrantes sin leer; el detalle (getById) lo deja en 0 al abrir el hilo. */
    noLeidos: number;
    ultimoMensajeAt: string | null;
    ultimoMensajeDir: DireccionMensaje;
    cliente: { id: number; nombre: string } | null;
    asignadoA: UsuarioRef | null;
    /** Preview del último mensaje (texto plano). */
    ultimoMensaje: string | null;
}

export interface MensajeWhatsapp {
    id: number;
    direccion: DireccionMensaje;
    tipo: TipoMensajeWhatsapp;
    contenido: string;
    estado: EstadoMensajeWhatsapp;
    createdAt: string;
    enviadoPor: UsuarioRef | null;
}

/** Hilo abierto: la conversación + sus últimos 100 mensajes en orden ascendente. */
export interface ConversacionDetalle {
    id: number;
    whatsappCuentaId: number;
    clienteId: number | null;
    telefono: string;
    jid: string | null;
    nombreContacto: string | null;
    estado: EstadoConversacion;
    asignadoAId: number | null;
    ultimoMensajeAt: string | null;
    ultimoMensajeDir: DireccionMensaje;
    noLeidos: number;
    createdAt: string;
    updatedAt: string;
    mensajes: MensajeWhatsapp[];
    /** Relaciones que el backend puede expandir además del contrato mínimo. */
    cliente?: { id: number; nombre: string } | null;
    asignadoA?: UsuarioRef | null;
}

export interface ConversacionFilter {
    estado?: EstadoConversacion;
    asignadoAId?: number;
    /** Sólo los hilos cuyo último mensaje es entrante (esperan respuesta). */
    sinResponder?: boolean;
    /** Busca por nombre de contacto o teléfono. */
    q?: string;
}

/** Página del listado. El contrato devuelve sólo estos tres campos. */
export interface ConversacionesPagina {
    results: ConversacionListItem[];
    totalResults: number;
    totalPages: number;
}

/** Alta de un saliente: el request NO envía por WhatsApp, sólo encola el mensaje
 *  con su `enviarAt` (espaciado anti-ban); el worker lo despacha después. */
export interface MensajeEncolado {
    id: number;
    estado: EstadoMensajeWhatsapp;
}

/** Resultado de empujar el hilo al intake de consultas (dedupe + round-robin). */
export interface RegistrarConsultaResultado {
    clienteId: number;
    /** true = se creó un cliente nuevo; false = dedupe contra uno existente. */
    creado: boolean;
}

export const conversacionesApi = {
    /** Listado paginado. El backend acota por rol: el vendedor puro sólo ve las
     *  suyas o las que no tienen dueño. */
    getAll: (filters: ConversacionFilter = {}, options: { page?: number; limit?: number } = {}) =>
        client.get<ConversacionesPagina>('/conversaciones', {
            params: { ...filters, ...options },
        }),

    /** Hilo completo. Efecto lateral en el backend: marca la conversación leída. */
    getById: (id: number) =>
        client.get<ConversacionDetalle>(`/conversaciones/${id}`),

    /** Encola un saliente de texto (queda `pendiente` hasta que lo tome el worker). */
    enviarMensaje: (id: number, contenido: string) =>
        client.post<MensajeEncolado>(`/conversaciones/${id}/mensajes`, { contenido }),

    /** Cambia el estado del hilo o reasigna el vendedor. */
    update: (id: number, data: { estado?: EstadoConversacion; asignadoAId?: number | null }) =>
        client.patch<ConversacionDetalle>(`/conversaciones/${id}`, data),

    /** Da de alta el contacto como consulta (crea/deduplica el cliente y lo ata al hilo). */
    registrarConsulta: (id: number) =>
        client.post<RegistrarConsultaResultado>(`/conversaciones/${id}/registrar-consulta`),
};
