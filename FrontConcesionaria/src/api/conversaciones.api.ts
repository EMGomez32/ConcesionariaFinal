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

/**
 * Ids que emite el modo demostración de Meta. Van con prefijo `DEMO-` a
 * propósito, igual que los de Mercado Libre: se distinguen a simple vista de un
 * IGSID/PSID real (que son números largos) sin tener que consultar nada.
 *
 * NO va anclada sólo al principio: los ids sueltos (`contactoExternoId`,
 * `comentarioExternoId`) empiezan con DEMO-, pero la clave natural del hilo es
 * `<integracionId>:<idExterno>` — "7:DEMO-IGSID-ARIEL" —, así que con `/^DEMO-/`
 * esa rama no podía dar verdadero NUNCA y el respaldo por clave era decorativo.
 */
const ID_SIMULADO = /(^|:)DEMO-/i;

/**
 * Lo mínimo que hace falta para saber si un hilo es simulado. Es estructural
 * para que le sirvan las dos formas que llegan del backend: la FILA de la lista
 * y el DETALLE del hilo (que además trae los ids externos).
 */
export interface HiloSimulable {
    /** Lo dice el backend: la integración por la que entró el hilo está en modo demo. */
    simulado?: boolean | null;
    /** Alias del anterior, por si el backend rotula con el nombre del modo. */
    demo?: boolean | null;
    modo?: string | null;
    claveHilo?: string | null;
    contactoExternoId?: string | null;
    comentarioExternoId?: string | null;
    envio?: { simulado?: boolean | null } | null;
}

/**
 * Si el hilo lo fabricó el modo demostración de Meta.
 *
 * No depende de en qué nivel del payload viaje el flag —alcanza con que UNO diga
 * simulado—, y como último recurso lo confirma por los ids `DEMO-`: el rótulo es
 * lo único que le permite al vendedor (y a quien mira la demostración)
 * distinguir un comprador real de uno fabricado, así que no puede depender de
 * que un campo opcional llegue. Equivocarse rotulando de más cuesta un chip;
 * equivocarse rotulando de menos hace pasar por cliente a alguien que no existe.
 */
export const esHiloSimulado = (hilo?: HiloSimulable | null): boolean =>
    hilo?.simulado === true
    || hilo?.demo === true
    || hilo?.modo === 'demo'
    || hilo?.envio?.simulado === true
    || ID_SIMULADO.test(hilo?.contactoExternoId ?? '')
    || ID_SIMULADO.test(hilo?.comentarioExternoId ?? '')
    || ID_SIMULADO.test(hilo?.claveHilo ?? '');

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
    /** El hilo lo fabricó el modo demostración de Meta. Viaja en el LISTADO
     *  porque GET /integraciones es admin-only: sin esto el vendedor —que es el
     *  que atiende la bandeja— no tendría forma de saber que del otro lado no
     *  hay nadie. Se lee con `esHiloSimulado`, que además lo confirma por la
     *  clave del hilo. */
    simulado?: boolean;
    /** Clave natural del hilo (`<integracionId>:<idExterno>`). Sólo se usa para
     *  rotular: en un hilo simulado el id externo empieza con DEMO-. */
    claveHilo?: string | null;
    /** Id del contacto en Meta y, en los comentarios, el comentario raíz. Como
     *  `claveHilo`, viajan SÓLO para que el rótulo tenga más de una fuente: en
     *  un hilo simulado empiezan con DEMO-. No se muestran. */
    contactoExternoId?: string | null;
    comentarioExternoId?: string | null;
    /** Integración de Meta por la que entró. Diagnóstico, no se muestra. */
    integracionId?: number | null;
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
    /** El hilo entró por una integración en modo demostración: el saliente se
     *  guarda acá adentro y NO se llama a Meta. Va junto a las otras condiciones
     *  porque el composer es donde más caro sale creer que algo es real: es el
     *  lugar donde se escribe pensando que lo lee un cliente. */
    simulado?: boolean;
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
    /** Clave natural del hilo dentro del canal. En un hilo simulado el id
     *  externo que la compone empieza con DEMO-, y eso alcanza para rotularlo. */
    claveHilo?: string | null;
    /** El hilo lo fabricó el modo demostración. Duplicado con `envio.simulado` a
     *  propósito (mismo criterio que la cuenta demo de Mercado Libre): la
     *  cabecera decide el rótulo antes de mirar las condiciones del composer. */
    simulado?: boolean;
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
    /**
     * La conversación era simulada: el cliente quedó marcado como tal en el CRM
     * (`origenSimulado`) y fuera de los reportes. El aviso de éxito lo repite —
     * es el único paso del circuito por el que algo simulado se convierte en un
     * dato permanente que sobrevive a apagar la demostración.
     */
    simulada?: boolean;
    /**
     * La consulta era simulada y el teléfono que se cargó a mano matcheó con un
     * cliente REAL que ya estaba en el CRM. Esa ficha NO se rotula (es de verdad)
     * y por eso tampoco se le tocó nada: la ingesta sólo le anotó la consulta,
     * rotulada, en observaciones — no le cambió el origen ni le reabrió el lead.
     * El aviso lo dice: si no, la pantalla anuncia un alta que no pasó.
     */
    sobreFichaReal?: boolean;
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
