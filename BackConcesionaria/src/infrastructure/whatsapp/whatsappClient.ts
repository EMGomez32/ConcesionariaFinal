import { Boom } from '@hapi/boom';
import * as QRCode from 'qrcode';
import * as path from 'path';
import * as fs from 'fs';
import { logger } from '../logging/logger';

/**
 * Cliente de WhatsApp sobre Baileys — un socket por cuenta vinculada.
 *
 * Baileys NO es la API oficial de Meta: implementa el protocolo de WhatsApp Web
 * multi-dispositivo, así que el número se vincula escaneando un QR (como
 * WhatsApp Web/Desktop) y SIGUE funcionando en el celular. La contracara es que
 * es un cliente no oficial: Meta puede bloquear el número, y por eso el envío
 * pasa por el espaciado anti-ban del worker (nunca ráfagas).
 *
 * La sesión (credenciales Signal) vive en disco, en WHATSAPP_AUTH_DIR/<cuentaId>:
 * si ese directorio se pierde, hay que volver a escanear el QR. En Docker tiene
 * que ser un volumen persistente.
 *
 * Portado del chatbot de la Municipalidad de Guaymallén (NestJS) a una clase
 * plana, conservando su manejo de reconexión con backoff y el reporte de estado.
 */

export type EstadoCliente =
    | 'desconectado'
    | 'conectando'
    | 'esperando_qr'
    | 'conectado'
    | 'reconectando'
    | 'error';

export interface EstadoProveedor {
    estado: EstadoCliente;
    /** Data-URL del QR pendiente de escanear (sólo en `esperando_qr`). */
    qr: string | null;
    numero: string | null;
    error: string | null;
}

export interface MensajeEntranteNormalizado {
    waMessageId: string;
    jid: string;
    telefono: string;
    nombreContacto: string | null;
    tipo: 'texto' | 'imagen' | 'audio' | 'video' | 'documento' | 'ubicacion' | 'contacto' | 'sistema';
    contenido: string;
    /** true si lo mandó el propio número desde el celular vinculado. */
    propio: boolean;
    fecha: Date;
}

export interface ClienteCallbacks {
    onEstadoCambia: (estado: EstadoCliente, extra?: { numero?: string | null; error?: string | null }) => void;
    onQr: (qrDataUrl: string) => void;
    onMensaje: (msg: MensajeEntranteNormalizado) => void | Promise<void>;
    /** Cambios de estado de entrega de un mensaje ya enviado (entregado/leído). */
    onActualizacion?: (waMessageId: string, estado: 'entregado' | 'leido') => void | Promise<void>;
}

// El import dinámico evita que Baileys (ESM) rompa el build CommonJS del backend.
interface BaileysModule {
    default: (config: Record<string, unknown>) => WASocketLike;
    useMultiFileAuthState: (dir: string) => Promise<{ state: unknown; saveCreds: () => Promise<void> }>;
    fetchLatestBaileysVersion: () => Promise<{ version: number[] }>;
    DisconnectReason: Record<string, number>;
}

interface WASocketLike {
    ev: { on: (evento: string, cb: (...args: never[]) => void) => void };
    user?: { id?: string } | null;
    sendMessage: (jid: string, contenido: Record<string, unknown>) => Promise<{ key?: { id?: string | null } } | undefined>;
    logout: () => Promise<void>;
    end: (err?: Error) => void;
}

let baileysMod: BaileysModule | null = null;
async function cargarBaileys(): Promise<BaileysModule> {
    if (!baileysMod) {
        // `new Function` para que TypeScript no transpile el import() a require().
        const importarDinamico = new Function('s', 'return import(s);') as (s: string) => Promise<BaileysModule>;
        baileysMod = await importarDinamico('baileys');
    }
    return baileysMod;
}

/** Un JID de chat directo termina en @s.whatsapp.net (los grupos, en @g.us). */
export const esChatDirecto = (jid: string | undefined | null): boolean =>
    !!jid && jid.endsWith('@s.whatsapp.net');

/** 5493615551234@s.whatsapp.net → 5493615551234 */
export const telefonoDeJid = (jid: string): string => jid.split('@')[0].split(':')[0];

/** Número (dígitos) → JID de chat directo. */
export const jidDeTelefono = (telefono: string): string => {
    const d = telefono.replace(/\D/g, '');
    return `${d}@s.whatsapp.net`;
};

export class WhatsappClient {
    private socket: WASocketLike | null = null;
    private estado: EstadoCliente = 'desconectado';
    private qrDataUrl: string | null = null;
    private ultimoError: string | null = null;
    private numero: string | null = null;
    private readonly authDir: string;
    private reconnectTimer: NodeJS.Timeout | null = null;
    private intentosReconexion = 0;
    private cerradoAProposito = false;
    private readonly MAX_RECONEXIONES = 8;

    constructor(
        readonly cuentaId: number,
        private readonly callbacks: ClienteCallbacks,
        baseAuthDir = process.env.WHATSAPP_AUTH_DIR || path.resolve(process.cwd(), 'wa-auth'),
    ) {
        this.authDir = path.resolve(baseAuthDir, String(cuentaId));
        if (!fs.existsSync(this.authDir)) fs.mkdirSync(this.authDir, { recursive: true });
    }

    getEstado(): EstadoProveedor {
        return { estado: this.estado, qr: this.qrDataUrl, numero: this.numero, error: this.ultimoError };
    }

    /** ¿El authDir ya tiene una sesión vinculada? (creds.json lo escribe Baileys) */
    tieneSesion(): boolean {
        try {
            return fs.existsSync(path.join(this.authDir, 'creds.json'));
        } catch {
            return false;
        }
    }

    private setEstado(estado: EstadoCliente, extra?: { numero?: string | null; error?: string | null }) {
        this.estado = estado;
        if (extra?.numero !== undefined) this.numero = extra.numero;
        if (extra?.error !== undefined) this.ultimoError = extra.error;
        if (estado !== 'esperando_qr') this.qrDataUrl = null;
        this.callbacks.onEstadoCambia(estado, extra);
    }

    async iniciar(): Promise<EstadoProveedor> {
        if (this.estado === 'conectado' || this.estado === 'conectando') return this.getEstado();
        this.cerradoAProposito = false;
        await this.abrirSocket();
        return this.getEstado();
    }

    private async abrirSocket(): Promise<void> {
        const baileys = await cargarBaileys();
        this.setEstado('conectando', { error: null });

        const { state, saveCreds } = await baileys.useMultiFileAuthState(this.authDir);
        const { version } = await baileys.fetchLatestBaileysVersion();

        // Baileys es MUY verboso; su logger va silenciado y los eventos que
        // importan se loguean acá con el logger del proyecto.
        const silencioso = {
            level: 'silent',
            child: () => silencioso,
            trace: () => undefined, debug: () => undefined, info: () => undefined,
            warn: () => undefined, error: () => undefined, fatal: () => undefined,
        };

        const socket = baileys.default({
            version,
            auth: state,
            logger: silencioso,
            printQRInTerminal: false,
            // Marcarse como navegador: WhatsApp lo muestra como dispositivo vinculado.
            browser: ['AUTENZA', 'Chrome', '1.0.0'],
            syncFullHistory: false,
            markOnlineOnConnect: false,
        });
        this.socket = socket;

        socket.ev.on('creds.update', (() => { void saveCreds(); }) as never);

        socket.ev.on('connection.update', ((update: { connection?: string; lastDisconnect?: { error?: Error }; qr?: string }) => {
            void this.onConnectionUpdate(update, baileys);
        }) as never);

        socket.ev.on('messages.upsert', ((payload: { messages?: unknown[]; type?: string }) => {
            if (payload?.type !== 'notify') return; // 'append' = historia vieja
            for (const m of payload.messages ?? []) void this.onMensaje(m as Record<string, unknown>);
        }) as never);

        socket.ev.on('messages.update', ((updates: unknown[]) => {
            for (const u of updates ?? []) this.onActualizacion(u as Record<string, unknown>);
        }) as never);
    }

    private async onConnectionUpdate(
        update: { connection?: string; lastDisconnect?: { error?: Error }; qr?: string },
        baileys: BaileysModule,
    ): Promise<void> {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            try {
                this.qrDataUrl = await QRCode.toDataURL(qr);
                this.setEstado('esperando_qr');
                this.callbacks.onQr(this.qrDataUrl);
            } catch (e) {
                logger.warn(`[whatsapp:${this.cuentaId}] no se pudo generar el QR: ${(e as Error).message}`);
            }
            return;
        }

        if (connection === 'open') {
            this.intentosReconexion = 0;
            const jid = this.socket?.user?.id ?? null;
            this.setEstado('conectado', { numero: jid ? telefonoDeJid(jid) : null, error: null });
            logger.info(`[whatsapp:${this.cuentaId}] conectado como ${this.numero ?? 'desconocido'}`);
            return;
        }

        if (connection === 'close') {
            const codigo = (lastDisconnect?.error as Boom | undefined)?.output?.statusCode;
            const deslogueado = codigo === baileys.DisconnectReason.loggedOut;

            if (this.cerradoAProposito) {
                this.setEstado('desconectado');
                return;
            }
            if (deslogueado) {
                // La sesión murió del otro lado (cerraron el dispositivo vinculado):
                // reconectar es inútil, hay que escanear un QR nuevo.
                this.purgarSesion();
                this.setEstado('error', { numero: null, error: 'Sesión cerrada desde el teléfono: hay que vincular de nuevo' });
                return;
            }
            if (this.intentosReconexion >= this.MAX_RECONEXIONES) {
                this.setEstado('error', { error: `Sin reconexión tras ${this.MAX_RECONEXIONES} intentos` });
                return;
            }

            // Backoff exponencial con techo de 60s.
            this.intentosReconexion += 1;
            const espera = Math.min(60_000, 2 ** this.intentosReconexion * 1000);
            this.setEstado('reconectando', { error: (lastDisconnect?.error as Error | undefined)?.message ?? null });
            logger.warn(`[whatsapp:${this.cuentaId}] desconectado (código ${codigo ?? 's/d'}), reintento ${this.intentosReconexion} en ${espera}ms`);
            if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
            this.reconnectTimer = setTimeout(() => {
                void this.abrirSocket().catch((e) => {
                    this.setEstado('error', { error: (e as Error).message });
                });
            }, espera);
        }
    }

    /** Normaliza un mensaje de Baileys al contrato del dominio. */
    private async onMensaje(raw: Record<string, unknown>): Promise<void> {
        const key = raw.key as { id?: string; remoteJid?: string; fromMe?: boolean } | undefined;
        const jid = key?.remoteJid;
        if (!key?.id || !jid || !esChatDirecto(jid)) return; // ignora grupos y estados

        const message = (raw.message ?? {}) as Record<string, unknown>;
        const { tipo, contenido } = this.extraerContenido(message);
        if (tipo === 'sistema' && !contenido) return; // notificaciones de protocolo

        const ts = Number(raw.messageTimestamp ?? 0);
        await this.callbacks.onMensaje({
            waMessageId: key.id,
            jid,
            telefono: telefonoDeJid(jid),
            nombreContacto: (raw.pushName as string | undefined) ?? null,
            tipo,
            contenido,
            propio: !!key.fromMe,
            fecha: ts ? new Date(ts * 1000) : new Date(),
        });
    }

    private extraerContenido(message: Record<string, unknown>): { tipo: MensajeEntranteNormalizado['tipo']; contenido: string } {
        const texto = message.conversation as string | undefined;
        if (texto) return { tipo: 'texto', contenido: texto };

        const extendido = (message.extendedTextMessage as { text?: string } | undefined)?.text;
        if (extendido) return { tipo: 'texto', contenido: extendido };

        const img = message.imageMessage as { caption?: string } | undefined;
        if (img) return { tipo: 'imagen', contenido: img.caption || '[imagen]' };

        const doc = message.documentMessage as { fileName?: string; caption?: string } | undefined;
        if (doc) return { tipo: 'documento', contenido: doc.caption || doc.fileName || '[documento]' };

        const audio = message.audioMessage as object | undefined;
        if (audio) return { tipo: 'audio', contenido: '[audio]' };

        const video = message.videoMessage as { caption?: string } | undefined;
        if (video) return { tipo: 'video', contenido: video.caption || '[video]' };

        const ubic = message.locationMessage as { degreesLatitude?: number; degreesLongitude?: number } | undefined;
        if (ubic) return { tipo: 'ubicacion', contenido: `[ubicación] ${ubic.degreesLatitude ?? ''},${ubic.degreesLongitude ?? ''}` };

        const contacto = message.contactMessage as { displayName?: string } | undefined;
        if (contacto) return { tipo: 'contacto', contenido: `[contacto] ${contacto.displayName ?? ''}` };

        return { tipo: 'sistema', contenido: '' };
    }

    private onActualizacion(u: Record<string, unknown>): void {
        const key = u.key as { id?: string } | undefined;
        const update = u.update as { status?: number } | undefined;
        if (!key?.id || update?.status === undefined) return;
        // Baileys: 3 = delivery ack, 4 = read
        if (update.status === 3) void this.callbacks.onActualizacion?.(key.id, 'entregado');
        else if (update.status >= 4) void this.callbacks.onActualizacion?.(key.id, 'leido');
    }

    /** Envía un texto. Devuelve el id que asignó WhatsApp (para trazar acks). */
    async enviarTexto(telefono: string, texto: string): Promise<{ waMessageId: string | null; jid: string }> {
        if (!this.socket || this.estado !== 'conectado') {
            throw new Error('El número de WhatsApp no está conectado');
        }
        const jid = jidDeTelefono(telefono);
        const res = await this.socket.sendMessage(jid, { text: texto });
        return { waMessageId: res?.key?.id ?? null, jid };
    }

    /** Cierra el socket sin borrar la sesión: al reiniciar reconecta sin QR. */
    async desconectar(): Promise<EstadoProveedor> {
        this.cerradoAProposito = true;
        if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
        try {
            this.socket?.end(undefined);
        } catch { /* el socket ya estaba muerto */ }
        this.socket = null;
        this.setEstado('desconectado', { error: null });
        return this.getEstado();
    }

    /** Cierra sesión en WhatsApp y purga credenciales: el próximo inicio pide QR. */
    async cerrarSesion(): Promise<EstadoProveedor> {
        this.cerradoAProposito = true;
        if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
        try {
            await this.socket?.logout();
        } catch { /* si el socket ya murió, alcanza con purgar el authDir */ }
        this.socket = null;
        this.purgarSesion();
        this.setEstado('desconectado', { numero: null, error: null });
        return this.getEstado();
    }

    private purgarSesion(): void {
        try {
            fs.rmSync(this.authDir, { recursive: true, force: true });
            fs.mkdirSync(this.authDir, { recursive: true });
        } catch (e) {
            logger.warn(`[whatsapp:${this.cuentaId}] no se pudo purgar la sesión: ${(e as Error).message}`);
        }
    }
}
