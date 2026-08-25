import {
    CanalMetaNoConfiguradoError,
    MetaError,
    VentanaMetaCerradaError,
    estadoVentanaMeta,
} from '../../src/domain/services/metaErrores';

/**
 * Unit tests PUROS (sin DB ni red) del contrato `ErrorDeEnvio`: qué lee el
 * worker de la cola de un error de envío.
 *
 * Existen por dos bugs que este contrato arregla y que eran invisibles leyendo
 * el código, porque los comentarios afirmaban lo contrario de lo que pasaba:
 *   1. la ventana cerrada y el canal sin configurar se REINTENTABAN tres veces
 *      (nadie seteaba la marca), dejando al vendedor mirando un "pendiente" que
 *      ya era un fallido seguro;
 *   2. el rechazo de Meta se guardaba CRUDO en el mensaje y el vendedor leía un
 *      volcado del Graph API en inglés adentro del chat del cliente.
 *
 * `esReintentable` del worker es `typeof err.reintentable === 'boolean' ?
 * err.reintentable : true`, así que lo que hay que garantizar es que estas tres
 * clases expongan la propiedad con el valor correcto.
 *
 * Corren standalone: `npx jest tests/unit`.
 */

/** Lo mismo que hace envioWorker.esReintentable, replicado para no importar el
 *  worker (arrastraría Baileys y el socket de WhatsApp a un test puro). */
const esReintentable = (err: unknown): boolean => {
    const marca = (err as { reintentable?: unknown } | null)?.reintentable;
    return typeof marca === 'boolean' ? marca : true;
};

describe('errores de dominio de Meta — NO se reintentan', () => {
    it('la ventana cerrada es definitiva: no se reabre sola esperando 15 segundos', () => {
        const err = new VentanaMetaCerradaError('Pasaron más de 24 horas desde el último mensaje de Juan.');
        expect(err.reintentable).toBe(false);
        expect(esReintentable(err)).toBe(false);
    });

    it('el canal sin configurar es definitivo: el token no aparece entre un reintento y el siguiente', () => {
        const err = new CanalMetaNoConfiguradoError('Falta el id de la página de Facebook.');
        expect(err.reintentable).toBe(false);
        expect(esReintentable(err)).toBe(false);
    });

    it('los dos ya están escritos en criollo, así que el vendedor lee ese mismo texto', () => {
        const ventana = new VentanaMetaCerradaError('Pasaron más de 24 horas.');
        const canal = new CanalMetaNoConfiguradoError('Falta el token de página.');
        expect(ventana.mensajeVendedor).toBe(ventana.message);
        expect(canal.mensajeVendedor).toBe(canal.message);
    });

    it('un error cualquiera (Baileys) sigue siendo reintentable: WhatsApp no cambia', () => {
        expect(esReintentable(new Error('Connection Closed'))).toBe(true);
        expect(esReintentable(null)).toBe(true);
    });
});

describe('MetaError — clasificación y traducción', () => {
    /** Rechazo real de Meta cuando falta un permiso sin aprobar (App Review). */
    const CRUDO_PERMISO = 'Meta rechazó la llamada (HTTP 403, code 200): '
        + '(#200) Requires pages_manage_engagement permission to manage the object '
        + '· crudo: {"message":"(#200) Requires pages_manage_engagement permission to manage the object",'
        + '"type":"OAuthException","code":200,"fbtrace_id":"A1bCdEfGhIjKlMnOpQrStUv"}';

    it('un permiso sin aprobar no se reintenta y se explica sin códigos', () => {
        const err = new MetaError(CRUDO_PERMISO, 403, 200, null);
        expect(err.reintentable).toBe(false);
        expect(esReintentable(err)).toBe(false);

        // Lo que se guarda en el mensaje y lee el vendedor: nada de volcados.
        expect(err.mensajeVendedor).toMatch(/permiso/i);
        expect(err.mensajeVendedor).toMatch(/administrador/i);
        expect(err.mensajeVendedor).not.toMatch(/#200|OAuthException|fbtrace_id|crudo/);
    });

    it('el detalle técnico se conserva ENTERO para el log (el fbtrace_id incluido)', () => {
        const err = new MetaError(CRUDO_PERMISO, 403, 200, null);
        expect(err.detalleTecnico).toBe(CRUDO_PERMISO);
        expect(err.detalleTecnico).toContain('fbtrace_id');
    });

    it('el token vencido y el objeto borrado dicen QUÉ pasó, cada uno lo suyo', () => {
        expect(new MetaError('x', 401, 190, null).mensajeVendedor).toMatch(/venció|token/i);
        expect(new MetaError('x', 400, 803, null).mensajeVendedor).toMatch(/borrado|no encontró/i);
    });

    it('fuera de la ventana de 24 h (subcódigo 2534022) se explica como la ventana, no como un permiso', () => {
        const err = new MetaError('x', 400, 10, 2534022);
        expect(err.mensajeVendedor).toMatch(/24 horas/);
        expect(err.reintentable).toBe(false);
    });

    it('una caída de red o un 5xx SÍ se reintentan, y se dice que se reintenta solo', () => {
        const red = new MetaError('No se pudo contactar al Graph API', 0, null, null, false);
        expect(red.reintentable).toBe(true);
        expect(esReintentable(red)).toBe(true);
        expect(red.mensajeVendedor).toMatch(/reintenta/i);

        const cuota = new MetaError('x', 429, null, null);
        expect(cuota.reintentable).toBe(true);
        expect(cuota.mensajeVendedor).toMatch(/reintenta/i);
    });
});

describe('estadoVentanaMeta — una sola implementación de la ventana de 24 h', () => {
    const EN_UNA_HORA = () => new Date(Date.now() + 60 * 60 * 1000);
    const HACE_UNA_HORA = () => new Date(Date.now() - 60 * 60 * 1000);

    it('WhatsApp y los comentarios no tienen ventana', () => {
        for (const canal of ['whatsapp', 'instagram_comentario', 'facebook_comentario'] as const) {
            expect(estadoVentanaMeta({ canal, ventanaVenceAt: null }).puedeResponder).toBe(true);
        }
    });

    it('un DM sin ventana conocida se trata como CERRADO (nunca escribió esa persona)', () => {
        const estado = estadoVentanaMeta({ canal: 'instagram', ventanaVenceAt: null, nombreContacto: 'Carla' });
        expect(estado.puedeResponder).toBe(false);
        expect(estado.motivo).toContain('Carla');
        expect(estado.motivo).toContain('Instagram');
    });

    it('vencida cierra y vigente abre', () => {
        expect(estadoVentanaMeta({ canal: 'messenger', ventanaVenceAt: HACE_UNA_HORA() }).puedeResponder).toBe(false);
        expect(estadoVentanaMeta({ canal: 'messenger', ventanaVenceAt: EN_UNA_HORA() }).puedeResponder).toBe(true);
    });

    it('el motivo nunca trae un código de Meta: lo lee un vendedor', () => {
        const estado = estadoVentanaMeta({ canal: 'instagram', ventanaVenceAt: HACE_UNA_HORA() });
        expect(estado.motivo).not.toMatch(/\d{3,}|code|error/i);
    });
});
