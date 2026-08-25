import client from './client';

/** Estado del hilo dentro de la bandeja. */
export type EstadoConversacion = 'abierta' | 'cerrada' | 'archivada';

export type DireccionMensaje = 'entrante' | 'saliente';

/** Canal por el que entró el hilo. Los valores son los del enum
 *  `CanalConversacion` de Prisma: viajan tal cual desde la DB al JSON.
 *  'whatsapp' es el único vivo con datos reales — la migración deja todas las
 *  conversaciones existentes marcadas así. */
export type CanalConversacion =
    | 'whatsapp'
    | 'instagram'
    | 'messenger'
    | 'instagram_comentario'
    | 'facebook_comentario';

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
    canal: CanalConversacion;
    /** Null en todo lo que no sea WhatsApp: un DM de Instagram no tiene número. */
    telefono: string | null;
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
    /** Opcional: si el backend lo manda en el listado, la bandeja marca en la
     *  lista los hilos de Meta a los que se les está por cerrar la ventana de
     *  24 h. Si no viene, la lista simplemente no muestra ese aviso. */
    ventanaVenceAt?: string | null;
}

export interface MensajeWhatsapp {
    id: number;
    direccion: DireccionMensaje;
    tipo: TipoMensajeWhatsapp;
    contenido: string;
    estado: EstadoMensajeWhatsapp;
    createdAt: string;
    enviadoPor: UsuarioRef | null;
    /** Por qué rebotó el saliente, YA redactado para mostrar (columna
     *  `error_mensaje`). El backend traduce el código de Meta a una frase en
     *  criollo —qué pasó y a quién avisarle— y deja el volcado del Graph API en
     *  el log; los errores del socket de WhatsApp salen con una frase fija. La
     *  burbuja fallida lo muestra tal cual: nunca hay que interpretarlo acá. */
    errorMensaje?: string | null;
}

/**
 * Todo lo que el composer necesita para decidir si deja escribir, resuelto en el
 * backend (`conversacionService.condicionesEnvio`). El front NO reimplementa las
 * reglas de Meta: sólo pinta. `motivo` viene redactado en criollo y es el MISMO
 * texto que devuelve el 409 al encolar, así que el vendedor nunca lee dos
 * explicaciones distintas del mismo rechazo — ni un código de Meta.
 */
export interface CondicionesEnvio {
    canal: CanalConversacion;
    /** false = composer deshabilitado; se muestra `motivo` tal cual. */
    puedeEnviar: boolean;
    motivo: string | null;
    /** false en WhatsApp y en comentarios: no hay plazo que mostrar. */
    aplicaVentana: boolean;
    /** Cierre de la ventana de 24 h, para el contador. */
    ventanaVenceAt: string | null;
    /** true = lo que se escriba queda PÚBLICO abajo de la publicación. */
    respuestaPublica: boolean;
    /** Tope real del canal (DM de Instagram 1000, Messenger 2000, WhatsApp 4096,
     *  comentarios 8000). NO se usa como `maxLength` del textarea: el navegador
     *  recorta el pegado en silencio y el vendedor manda medio mensaje sin
     *  enterarse. Se avisa y se frena el envío. */
    limiteCaracteres: number;
}

/** Hilo abierto: la conversación + sus últimos 100 mensajes en orden ascendente. */
export interface ConversacionDetalle {
    id: number;
    canal: CanalConversacion;
    /** Null en los canales de Meta: esos hilos no cuelgan de un número. */
    whatsappCuentaId: number | null;
    clienteId: number | null;
    /** Null salvo en WhatsApp. */
    telefono: string | null;
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
    /** Id del contacto en Meta (IGSID/PSID) y, en los comentarios, el post y el
     *  comentario raíz. Sirven para el diagnóstico, no se muestran al vendedor. */
    integracionId?: number | null;
    contactoExternoId?: string | null;
    postExternoId?: string | null;
    comentarioExternoId?: string | null;
    /** Cierre crudo de la ventana. Para la UI usar `envio`, que ya lo interpreta:
     *  este campo no dice si el canal tiene ventana o no. No se deriva nada de
     *  `ultimoMensajeAt` a propósito — ese lo mueve también un saliente, y la
     *  ventana la corre sólo el entrante del usuario. */
    ventanaVenceAt: string | null;
    /** Estado del composer, ya resuelto por el backend. */
    envio: CondicionesEnvio;
    /** Relaciones que el backend puede expandir además del contrato mínimo. */
    cliente?: { id: number; nombre: string } | null;
    asignadoA?: UsuarioRef | null;
}

export interface ConversacionFilter {
    estado?: EstadoConversacion;
    /** Un solo canal; sin la clave, la bandeja trae todos (es el default: el
     *  vendedor atiende consultas, no canales). */
    canal?: CanalConversacion;
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

/** Alta de un saliente: el request NO despacha, sólo encola el mensaje con su
 *  `enviarAt` (el espaciado anti-ban de WhatsApp); el worker lo manda después
 *  por el canal de la conversación. El request SÍ puede fallar en el momento
 *  con un error de dominio — p. ej. la ventana de 24 h de Meta cerrada — y ese
 *  texto es el que la bandeja muestra tal cual. */
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

/**
 * Datos que el vendedor completa a mano al registrar la consulta. Los dos son
 * opcionales: en WhatsApp el hilo ya trae nombre y teléfono y el body va vacío.
 * Hacen falta en Meta, donde un DM no tiene teléfono NUNCA y el nombre depende
 * de un permiso que puede no estar aprobado; sin ellos el cliente nacía llamado
 * "Contacto 17841400123456789", sin forma de contactarlo ni de deduplicarlo.
 */
export interface DatosConsultaManual {
    nombre?: string;
    telefono?: string;
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

    /** Da de alta el contacto como consulta (crea/deduplica el cliente y lo ata
     *  al hilo). `datos` lleva lo que el vendedor completó a mano cuando el hilo
     *  no trae nombre ni teléfono. */
    registrarConsulta: (id: number, datos: DatosConsultaManual = {}) =>
        client.post<RegistrarConsultaResultado>(`/conversaciones/${id}/registrar-consulta`, datos),
};
