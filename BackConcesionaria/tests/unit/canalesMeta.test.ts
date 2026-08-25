import {
    estadoCanalesMeta,
    canalMetaHabilitado,
    campoTokenParaCanal,
    idDeCuentaMeta,
    CANALES_META,
    type CanalMeta,
    type ConfigMeta,
} from '../../src/domain/services/canalesMeta';

// Unit tests PUROS (sin DB ni env): validan qué canales de Meta queda en
// condiciones de atender una integración según lo que tiene cargado. Es lo que
// la pantalla de Ajustes muestra como "canales activos", así que si esto miente,
// miente la pantalla.
// Corren standalone: `npx jest tests/unit`.

/** Config tal como quedó guardada la integración de Lead Ads que ya está en producción. */
const LEGADO: ConfigMeta = {
    origen: 'instagram',
    verifyToken: 'tok',
    appSecret: 'sec',
    pageAccessToken: 'EAAG...',
};

const habilitados = (config: ConfigMeta): CanalMeta[] =>
    estadoCanalesMeta(config).filter((c) => c.habilitado).map((c) => c.canal);

describe('estadoCanalesMeta', () => {
    it('devuelve los cinco canales siempre, habilitados o no', () => {
        expect(estadoCanalesMeta(LEGADO)).toHaveLength(CANALES_META.length);
        expect(estadoCanalesMeta({}).map((c) => c.canal)).toEqual([
            'leadgen', 'messenger', 'facebook_comentario', 'instagram', 'instagram_comentario',
        ]);
    });

    it('una integración de Lead Ads que ya existe sigue habilitada (y sólo para leadgen)', () => {
        // REGRESIÓN: los campos nuevos son opcionales justamente para esto. Si
        // leadgen empezara a pedir pageId, las integraciones vivas aparecerían
        // apagadas de un día para el otro siendo mentira.
        expect(habilitados(LEGADO)).toEqual(['leadgen']);
    });

    it('sin token de página no hay ningún canal de la página', () => {
        expect(habilitados({ verifyToken: 'tok', appSecret: 'sec' })).toEqual([]);
        const leadgen = estadoCanalesMeta({}).find((c) => c.canal === 'leadgen');
        expect(leadgen?.falta).toMatch(/token de página/i);
    });

    it('con el id de la página se habilitan Messenger y los comentarios de Facebook', () => {
        expect(habilitados({ ...LEGADO, pageId: '1234567890' }))
            .toEqual(['leadgen', 'messenger', 'facebook_comentario']);
    });

    it('con el id de Instagram se habilitan DM y comentarios de IG usando el token de página', () => {
        // Facebook Login for Business: no hay token propio de IG, se reusa el de la página.
        expect(habilitados({ ...LEGADO, igBusinessAccountId: '17841400000000000' }))
            .toEqual(['leadgen', 'instagram', 'instagram_comentario']);
    });

    it('el id de Instagram sin ningún token no alcanza', () => {
        const estado = estadoCanalesMeta({ verifyToken: 'tok', igBusinessAccountId: '17841400000000000' });
        const dm = estado.find((c) => c.canal === 'instagram');
        expect(dm?.habilitado).toBe(false);
        expect(dm?.falta).toMatch(/token/i);
    });

    it('el token propio de Instagram alcanza aunque no haya token de página', () => {
        expect(habilitados({
            verifyToken: 'tok',
            appSecret: 'sec',
            igBusinessAccountId: '17841400000000000',
            instagramAccessToken: 'IGQ...',
        })).toEqual(['instagram', 'instagram_comentario']);
    });

    it('con todo cargado quedan los cinco', () => {
        expect(habilitados({
            ...LEGADO,
            pageId: '1234567890',
            igBusinessAccountId: '17841400000000000',
        })).toHaveLength(5);
    });

    it('un campo en blanco cuenta como ausente', () => {
        expect(habilitados({ ...LEGADO, pageId: '   ' })).toEqual(['leadgen']);
    });

    it('tolera un config nulo o basura sin explotar (viene de un Json de Prisma)', () => {
        expect(habilitados(null as unknown as ConfigMeta)).toEqual([]);
        expect(habilitados(undefined as unknown as ConfigMeta)).toEqual([]);
    });

    it('cada canal dice qué falta acá y qué hay que hacer en Meta', () => {
        for (const canal of estadoCanalesMeta({})) {
            expect(canal.falta).not.toBeNull();
            expect(canal.enMeta.length).toBeGreaterThan(20);
            expect(canal.etiqueta.length).toBeGreaterThan(0);
        }
        for (const canal of estadoCanalesMeta({ ...LEGADO, pageId: '1', igBusinessAccountId: '2' })) {
            // pageId '1' no pasa el regex del schema, pero acá sólo importa que esté.
            expect(canal.falta).toBeNull();
        }
    });

    it('el objeto y el campo de webhook de cada canal son los que Meta espera', () => {
        const porCanal = Object.fromEntries(estadoCanalesMeta({}).map((c) => [c.canal, `${c.objeto}/${c.campo}`]));
        expect(porCanal).toEqual({
            leadgen: 'page/leadgen',
            messenger: 'page/messages',
            // Los comentarios de la página NO tienen campo propio: llegan por feed.
            facebook_comentario: 'page/feed',
            instagram: 'instagram/messages',
            instagram_comentario: 'instagram/comments',
        });
    });
});

describe('canalMetaHabilitado', () => {
    it('responde por canal', () => {
        expect(canalMetaHabilitado(LEGADO, 'leadgen')).toBe(true);
        expect(canalMetaHabilitado(LEGADO, 'messenger')).toBe(false);
    });

    it('un canal desconocido es false, no una excepción', () => {
        expect(canalMetaHabilitado(LEGADO, 'telepatia' as CanalMeta)).toBe(false);
    });
});

describe('campoTokenParaCanal', () => {
    it('los canales de la página siempre usan el token de página', () => {
        expect(campoTokenParaCanal({ ...LEGADO, instagramAccessToken: 'IGQ...' }, 'messenger'))
            .toBe('pageAccessToken');
        expect(campoTokenParaCanal({ ...LEGADO, instagramAccessToken: 'IGQ...' }, 'facebook_comentario'))
            .toBe('pageAccessToken');
    });

    it('Instagram prefiere su propio token y cae al de la página', () => {
        expect(campoTokenParaCanal({ ...LEGADO, instagramAccessToken: 'IGQ...' }, 'instagram'))
            .toBe('instagramAccessToken');
        expect(campoTokenParaCanal(LEGADO, 'instagram')).toBe('pageAccessToken');
        expect(campoTokenParaCanal(LEGADO, 'instagram_comentario')).toBe('pageAccessToken');
    });

    it('sin ningún token devuelve null (no un string vacío que termine viajando a Meta)', () => {
        expect(campoTokenParaCanal({ verifyToken: 'tok' }, 'instagram')).toBeNull();
        expect(campoTokenParaCanal({ pageAccessToken: '  ' }, 'messenger')).toBeNull();
    });
});

describe('idDeCuentaMeta', () => {
    it('devuelve el id del objeto pedido, ya recortado', () => {
        const config: ConfigMeta = { pageId: ' 1234567890 ', igBusinessAccountId: '17841400000000000' };
        expect(idDeCuentaMeta(config, 'page')).toBe('1234567890');
        expect(idDeCuentaMeta(config, 'instagram')).toBe('17841400000000000');
    });

    it('null si no está cargado', () => {
        expect(idDeCuentaMeta(LEGADO, 'page')).toBeNull();
        expect(idDeCuentaMeta({}, 'instagram')).toBeNull();
    });
});
