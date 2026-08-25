import {
    claveHiloDe,
    fechaDeEntry,
    normalizarComentarioFeed,
    normalizarComentarioInstagram,
    normalizarMensajeria,
    type ContextoNotificacion,
    type EventoEntranteMeta,
} from '../../src/domain/services/metaNormalizacion';

// Unit tests PUROS (sin DB ni red): validan la NORMALIZACIÓN de los cuatro
// payloads de Meta que caen en la bandeja. Corren standalone:
// `npx jest tests/unit` sin el stack docker.
//
// Por qué importan tanto: las cuatro formas no se parecen entre sí, Meta las
// manda todas a la MISMA URL, y equivocarse acá no rompe nada visible — el
// webhook contesta 200 igual y el mensaje simplemente no aparece nunca. Estos
// tests son el único lugar donde ese silencio se convierte en una falla ruidosa.

const PAGE_ID = '111111111111111';
const IG_ID = '222222222222222';
const PSID = '9876543210';
const IGSID = '5544332211';

/**
 * Un instante fijo, derivado de la fecha y no escrito a mano en epoch: los dos
 * tests de fecha comparan el MISMO instante llegando por escalas distintas
 * (Meta manda ms en messaging[] y SEGUNDOS en created_time del feed), así que
 * la constante tiene que ser evidentemente correcta o el test no prueba nada.
 */
const CUANDO = new Date('2026-08-25T12:00:00.000Z');
const CUANDO_MS = CUANDO.getTime();
const CUANDO_S = CUANDO_MS / 1000;

const ctxPage: ContextoNotificacion = {
    objeto: 'page',
    entryId: PAGE_ID,
    idsPropios: [PAGE_ID, IG_ID],
    fechaEntry: new Date('2026-01-01T00:00:00.000Z'),
};

const ctxInstagram: ContextoNotificacion = { ...ctxPage, objeto: 'instagram', entryId: IG_ID };

/** Estrecha el tipo y falla con un mensaje útil si el normalizador devolvió null. */
const noNulo = (e: EventoEntranteMeta | null): EventoEntranteMeta => {
    if (!e) throw new Error('el normalizador descartó un evento que debía entrar');
    return e;
};

describe('normalizarMensajeria — DM de Messenger y de Instagram', () => {
    const dm = (texto: string) => ({
        sender: { id: PSID },
        recipient: { id: PAGE_ID },
        timestamp: CUANDO_MS,
        message: { mid: 'm_abc123', text: texto },
    });

    it('DM de Messenger: object page → canal messenger, mid como externoId, PSID como contacto', () => {
        const e = noNulo(normalizarMensajeria(dm('¿Sigue disponible la Hilux?'), ctxPage));
        expect(e.canal).toBe('messenger');
        expect(e.externoId).toBe('m_abc123');
        expect(e.contactoExternoId).toBe(PSID);
        expect(e.contenido).toBe('¿Sigue disponible la Hilux?');
        expect(e.tipo).toBe('texto');
        expect(e.fecha).toEqual(CUANDO);
    });

    it('DM de Instagram: MISMO payload pero object instagram → canal instagram', () => {
        // Es el único dato que los distingue: si el webhook no lee payload.object,
        // los DM de Instagram entran como Messenger y se responden por la API
        // equivocada.
        const e = noNulo(normalizarMensajeria({ ...dm('hola'), sender: { id: IGSID } }, ctxInstagram));
        expect(e.canal).toBe('instagram');
        expect(e.contactoExternoId).toBe(IGSID);
    });

    it('ECHO (is_echo) se descarta: si no, cada respuesta del vendedor sale duplicada', () => {
        const echo = {
            sender: { id: PAGE_ID },   // en un echo el sender es la PÁGINA
            recipient: { id: PSID },
            timestamp: CUANDO_MS,
            message: { mid: 'm_propio', text: 'Sí, está disponible', is_echo: true },
        };
        expect(normalizarMensajeria(echo, ctxPage)).toBeNull();
    });

    it('un mensaje cuyo sender es la propia página se descarta aunque no venga marcado como echo', () => {
        const sospechoso = {
            sender: { id: PAGE_ID },
            recipient: { id: PSID },
            timestamp: CUANDO_MS,
            message: { mid: 'm_x', text: 'algo' },
        };
        expect(normalizarMensajeria(sospechoso, ctxPage)).toBeNull();
    });

    it('acks de entrega/lectura y reacciones se descartan (no traen `message`)', () => {
        expect(normalizarMensajeria({ sender: { id: PSID }, read: { watermark: 1 } }, ctxPage)).toBeNull();
        expect(normalizarMensajeria({ sender: { id: PSID }, delivery: { mids: ['m_1'] } }, ctxPage)).toBeNull();
        expect(normalizarMensajeria({ sender: { id: PSID }, reaction: { emoji: '❤' } }, ctxPage)).toBeNull();
        expect(normalizarMensajeria({ sender: { id: PSID }, postback: { title: 'x' } }, ctxPage)).toBeNull();
    });

    it('un unsend de Instagram (is_deleted) se descarta', () => {
        const borrado = {
            sender: { id: IGSID },
            timestamp: CUANDO_MS,
            message: { mid: 'm_del', is_deleted: true },
        };
        expect(normalizarMensajeria(borrado, ctxInstagram)).toBeNull();
    });

    it('DM sólo con imagen: contenido descriptivo y tipo imagen (no queda el hilo en blanco)', () => {
        const conFoto = {
            sender: { id: PSID },
            timestamp: CUANDO_MS,
            message: {
                mid: 'm_img',
                attachments: [{ type: 'image', payload: { url: 'https://cdn.meta/x.jpg' } }],
            },
        };
        const e = noNulo(normalizarMensajeria(conFoto, ctxPage));
        expect(e.contenido).toBe('[imagen]');
        expect(e.tipo).toBe('imagen');
    });

    it('respuesta a una historia lleva prefijo: sin él el vendedor no sabe a qué le contestan', () => {
        const historia = {
            sender: { id: IGSID },
            timestamp: CUANDO_MS,
            message: { mid: 'm_st', text: 'me interesa', reply_to: { story: { id: 's1' } } },
        };
        const e = noNulo(normalizarMensajeria(historia, ctxInstagram));
        expect(e.contenido).toBe('[respondió a tu historia] me interesa');
    });

    it('mensaje sin texto ni adjuntos entra igual: el hilo tiene que existir para poder contestarlo', () => {
        const raro = {
            sender: { id: PSID },
            timestamp: CUANDO_MS,
            message: { mid: 'm_raro', is_unsupported: true },
        };
        const e = noNulo(normalizarMensajeria(raro, ctxPage));
        expect(e.contenido).toBe('[mensaje sin texto]');
        expect(e.tipo).toBe('texto');
    });

    it('sin mid no entra: sin la clave de idempotencia un reintento de Meta duplicaría la burbuja', () => {
        const sinMid = { sender: { id: PSID }, timestamp: 1, message: { text: 'hola' } };
        expect(normalizarMensajeria(sinMid, ctxPage)).toBeNull();
    });

    it('un timestamp corrupto no desordena la bandeja: se cae al entry.time', () => {
        const e = noNulo(normalizarMensajeria({ ...dm('x'), timestamp: 1 }, ctxPage));
        expect(e.fecha).toEqual(ctxPage.fechaEntry);
    });
});

describe('normalizarComentarioFeed — comentarios de la página de Facebook', () => {
    const comentario = (extra: Record<string, unknown> = {}) => ({
        item: 'comment',
        verb: 'add',
        comment_id: `${PAGE_ID}_5001`,
        post_id: `${PAGE_ID}_900`,
        parent_id: `${PAGE_ID}_900`, // primer nivel: el parent ES el post
        created_time: CUANDO_S, // SEGUNDOS, no ms
        from: { id: '7001', name: 'Juan Pérez' },
        message: '¿Cuánto sale?',
        ...extra,
    });

    it('comentario de primer nivel: la raíz del hilo es el comentario mismo', () => {
        const e = noNulo(normalizarComentarioFeed(comentario(), ctxPage));
        expect(e.canal).toBe('facebook_comentario');
        expect(e.externoId).toBe(`${PAGE_ID}_5001`);
        expect(e.comentarioExternoId).toBe(`${PAGE_ID}_5001`);
        expect(e.postExternoId).toBe(`${PAGE_ID}_900`);
        expect(e.nombreContacto).toBe('Juan Pérez');
        // created_time viene en segundos: si se leyera como ms caería en 1970.
        expect(e.fecha).toEqual(CUANDO);
    });

    it('respuesta dentro del hilo: la raíz es el comentario padre, no el propio', () => {
        // Así las respuestas de una misma discusión caen en la MISMA conversación
        // y la respuesta del vendedor se publica en el hilo correcto.
        const e = noNulo(normalizarComentarioFeed(
            comentario({ comment_id: `${PAGE_ID}_5002`, parent_id: `${PAGE_ID}_5001` }),
            ctxPage,
        ));
        expect(e.externoId).toBe(`${PAGE_ID}_5002`);
        expect(e.comentarioExternoId).toBe(`${PAGE_ID}_5001`);
    });

    it('lo que no es un comentario nuevo se descarta (posts, reacciones, ediciones, borrados)', () => {
        expect(normalizarComentarioFeed(comentario({ item: 'post' }), ctxPage)).toBeNull();
        expect(normalizarComentarioFeed(comentario({ item: 'reaction' }), ctxPage)).toBeNull();
        expect(normalizarComentarioFeed(comentario({ verb: 'edited' }), ctxPage)).toBeNull();
        expect(normalizarComentarioFeed(comentario({ verb: 'remove' }), ctxPage)).toBeNull();
    });

    it('nuestra propia respuesta vuelve por el webhook y se descarta', () => {
        expect(normalizarComentarioFeed(comentario({ from: { id: PAGE_ID, name: 'La agencia' } }), ctxPage)).toBeNull();
    });

    it('comentario sin texto (sólo sticker o foto) entra con contenido descriptivo', () => {
        // Ojo: también es lo que se ve si falta pages_read_user_content, que hace
        // que Meta mande la notificación con el mensaje recortado.
        const e = noNulo(normalizarComentarioFeed(comentario({ message: undefined }), ctxPage));
        expect(e.contenido).toBe('[comentario sin texto]');
    });
});

describe('normalizarComentarioInstagram — comentarios de Instagram', () => {
    const comentario = (extra: Record<string, unknown> = {}) => ({
        id: '17900001',
        text: 'precio?',
        from: { id: IGSID, username: 'juanp' },
        media: { id: 'media_77', media_product_type: 'FEED' },
        ...extra,
    });

    it('comentario de IG: username como nombre y media como post', () => {
        const e = noNulo(normalizarComentarioInstagram(comentario(), ctxInstagram));
        expect(e.canal).toBe('instagram_comentario');
        expect(e.externoId).toBe('17900001');
        expect(e.comentarioExternoId).toBe('17900001');
        expect(e.postExternoId).toBe('media_77');
        expect(e.nombreContacto).toBe('juanp');
    });

    it('el payload de IG no trae fecha: se cae al entry.time de la notificación', () => {
        const e = noNulo(normalizarComentarioInstagram(comentario(), ctxInstagram));
        expect(e.fecha).toEqual(ctxInstagram.fechaEntry);
    });

    it('respuesta dentro del hilo: la raíz es el parent_id', () => {
        const e = noNulo(normalizarComentarioInstagram(
            comentario({ id: '17900002', parent_id: '17900001' }),
            ctxInstagram,
        ));
        expect(e.comentarioExternoId).toBe('17900001');
    });

    it('un comentario de la propia cuenta se descarta', () => {
        expect(normalizarComentarioInstagram(
            comentario({ from: { id: IG_ID, username: 'laagencia' } }),
            ctxInstagram,
        )).toBeNull();
    });
});

describe('claveHiloDe — la clave natural del hilo de Meta', () => {
    const base: EventoEntranteMeta = {
        canal: 'messenger',
        externoId: 'm_1',
        contactoExternoId: PSID,
        nombreContacto: null,
        contenido: 'hola',
        tipo: 'texto',
        fecha: new Date(),
        postExternoId: null,
        comentarioExternoId: null,
    };

    it('DM: <integracionId>:<contactoExternoId>', () => {
        expect(claveHiloDe(7, base)).toBe(`7:${PSID}`);
    });

    it('comentarios: <integracionId>:<comentarioRaíz> (un hilo por discusión)', () => {
        const comentario: EventoEntranteMeta = {
            ...base,
            canal: 'facebook_comentario',
            externoId: 'c_2',
            comentarioExternoId: 'c_1',
            postExternoId: 'p_1',
        };
        expect(claveHiloDe(7, comentario)).toBe('7:c_1');
    });

    it('el prefijo de integración separa dos páginas del mismo tenant', () => {
        // El PSID/IGSID es un id SCOPED a la página: sin el prefijo, dos
        // integraciones de la misma concesionaria colisionarían en un solo hilo.
        expect(claveHiloDe(7, base)).not.toBe(claveHiloDe(8, base));
    });
});

describe('fechaDeEntry — la escala de entry.time', () => {
    // REGRESIÓN. `entry.time` no tiene una escala fija: viene en MILISEGUNDOS en
    // las notificaciones de messaging[] y en SEGUNDOS en las de changes[].
    // El webhook lo construía con `new Date(Number(entry.time))`, así que un
    // comentario de Instagram —el ÚNICO evento que no trae timestamp propio y
    // por lo tanto se apoya en este respaldo— quedaba fechado en 1970.
    //
    // No es cosmético: la bandeja ordena por ultimoMensajeAt, así que el
    // comentario se hundía al fondo de la lista y el vendedor no lo veía nunca,
    // sin ningún error que lo delatara. Los tests de arriba no lo agarraban
    // porque le pasan al normalizador un `fechaEntry` ya construido.
    it('segundos (changes[]: feed y comments) se interpretan como segundos', () => {
        expect(fechaDeEntry(CUANDO_S)).toEqual(CUANDO);
    });

    it('milisegundos (messaging[]) se interpretan como milisegundos', () => {
        expect(fechaDeEntry(CUANDO_MS)).toEqual(CUANDO);
    });

    it('el mismo instante por las dos escalas da la misma fecha', () => {
        expect(fechaDeEntry(CUANDO_S)).toEqual(fechaDeEntry(CUANDO_MS));
    });

    it('un entry.time ausente o corrupto no propaga basura: undefined', () => {
        // undefined deja que cada normalizador caiga en su propio respaldo (la
        // hora de llegada) en vez de fechar el hilo en 1970 o en el año 3000.
        expect(fechaDeEntry(undefined)).toBeUndefined();
        expect(fechaDeEntry(0)).toBeUndefined();
        expect(fechaDeEntry(-1)).toBeUndefined();
        expect(fechaDeEntry('no es un numero')).toBeUndefined();
        expect(fechaDeEntry(123)).toBeUndefined();            // 1970 leído como segundos
        expect(fechaDeEntry(99_999_999_999_999)).toBeUndefined(); // año 5138 leído como ms
    });
});
