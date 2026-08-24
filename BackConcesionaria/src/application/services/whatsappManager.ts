import * as fs from 'fs';
import * as path from 'path';
import { EstadoWhatsappCuenta } from '@prisma/client';
import prisma from '../../infrastructure/database/prisma';
import { withAuthBypass } from '../../infrastructure/database/unitOfWork';
import { logger } from '../../infrastructure/logging/logger';
import { env } from '../../config/env';
import { BaseException } from '../../domain/exceptions/BaseException';
import { EstadoCliente, EstadoProveedor, WhatsappClient } from '../../infrastructure/whatsapp/whatsappClient';
import { conContextoSistema } from './consultaIngest';
import { marcarActualizacion, registrarEntrante } from './conversacionService';

/**
 * Registro EN MEMORIA de los sockets de WhatsApp (uno por cuenta vinculada).
 *
 * El socket vive en el PROCESO, no en la base: la fila `WhatsappCuenta` es sólo
 * el reflejo persistido de lo que pasa acá. Consecuencias que hay que tener
 * presentes al tocar esto:
 *  - Si el proceso reinicia, no hay sockets: `iniciarCuentasActivas()` los
 *    levanta de nuevo para las cuentas activas que todavía tengan sesión en
 *    disco (WHATSAPP_AUTH_DIR/<cuentaId>/creds.json).
 *  - Con varias instancias del backend, cada una tendría su propio Map y su
 *    propio socket para la misma cuenta: WhatsApp acepta un solo dispositivo por
 *    sesión, así que se pisarían. Este módulo asume UNA instancia.
 *
 * El QR NUNCA se persiste: es un secreto de vinculación de vida corta (segundos)
 * y en la base sería un vector de secuestro de la sesión. Vive en el Map y se
 * borra en cuanto la cuenta cambia de estado.
 *
 * Los callbacks del cliente llegan FUERA de un request (no hay JWT ni tenant en
 * el AsyncLocalStorage), por eso toda escritura pasa por `conContextoSistema`.
 */

interface Entrada {
    cliente: WhatsappClient;
    concesionariaId: number;
    /** Data-URL del QR pendiente. Sólo memoria. */
    qr: string | null;
}

const clientes = new Map<number, Entrada>();

const baseAuthDir = (): string =>
    process.env.WHATSAPP_AUTH_DIR || path.resolve(process.cwd(), 'wa-auth');

const mensajeCorto = (err: unknown): string =>
    (err instanceof Error ? err.message : String(err)).slice(0, 300);

/** El cliente vivo de la cuenta, o null si en este proceso no hay socket. */
export function obtener(cuentaId: number): WhatsappClient | null {
    return clientes.get(cuentaId)?.cliente ?? null;
}

/**
 * ¿La cuenta tiene sesión vinculada en disco? Se responde sin instanciar el
 * cliente (el constructor crea el authDir): el listado de cuentas lo consulta
 * para TODAS las filas, incluidas las que no tienen socket levantado.
 */
export function tieneSesion(cuentaId: number): boolean {
    const vivo = clientes.get(cuentaId);
    if (vivo) return vivo.cliente.tieneSesion();
    try {
        return fs.existsSync(path.join(baseAuthDir(), String(cuentaId), 'creds.json'));
    } catch {
        return false;
    }
}

/** Estado del socket vivo, o null si la cuenta no tiene socket en este proceso. */
export function estado(cuentaId: number): EstadoProveedor | null {
    const entrada = clientes.get(cuentaId);
    if (!entrada) return null;
    const actual = entrada.cliente.getEstado();
    // El QR lo guarda el manager (el cliente también lo expone, pero el callback
    // onQr es la fuente de verdad para el polling del panel).
    return { ...actual, qr: actual.qr ?? entrada.qr };
}

/**
 * Levanta (o reusa) el socket de la cuenta y devuelve su estado. Si ya estaba
 * conectado, `iniciar()` es idempotente y no reabre nada.
 */
export async function conectar(cuentaId: number, concesionariaId: number): Promise<EstadoProveedor> {
    const entrada = obtenerOCrear(cuentaId, concesionariaId);
    return entrada.cliente.iniciar();
}

/** Cierra el socket SIN borrar la sesión: al reconectar no pide QR. */
export async function desconectar(cuentaId: number): Promise<EstadoProveedor | null> {
    const entrada = clientes.get(cuentaId);
    if (!entrada) return null;
    return entrada.cliente.desconectar();
}

/**
 * Cierra sesión en WhatsApp y purga las credenciales del disco: la próxima
 * conexión arranca de cero con un QR nuevo. La entrada se saca del Map para que
 * el próximo `conectar` construya un cliente limpio.
 */
export async function cerrarSesion(cuentaId: number): Promise<EstadoProveedor | null> {
    const entrada = clientes.get(cuentaId);
    if (!entrada) return null;
    const resultado = await entrada.cliente.cerrarSesion();
    clientes.delete(cuentaId);
    return resultado;
}

/**
 * Envía un texto por el socket de la cuenta. Lo usa el WORKER de la cola, no el
 * request del panel: el panel encola (conversacionService.encolarSaliente) y el
 * worker despacha respetando el espaciado anti-ban.
 */
export async function enviar(
    cuentaId: number,
    telefono: string,
    texto: string,
): Promise<{ waMessageId: string | null; jid: string }> {
    const entrada = clientes.get(cuentaId);
    if (!entrada) {
        throw new BaseException(409, 'El número de WhatsApp no está conectado', 'WHATSAPP_DESCONECTADO');
    }
    return entrada.cliente.enviarTexto(telefono, texto);
}

function obtenerOCrear(cuentaId: number, concesionariaId: number): Entrada {
    const existente = clientes.get(cuentaId);
    if (existente) return existente;

    const entrada: Entrada = { cliente: null as unknown as WhatsappClient, concesionariaId, qr: null };
    entrada.cliente = new WhatsappClient(cuentaId, {
        onEstadoCambia: (estadoNuevo, extra) => {
            // El QR sólo vale mientras la cuenta lo está esperando.
            if (estadoNuevo !== 'esperando_qr') entrada.qr = null;
            void persistirEstado(cuentaId, concesionariaId, estadoNuevo, extra);
        },
        onQr: (qrDataUrl) => {
            entrada.qr = qrDataUrl;
        },
        onMensaje: async (msg) => {
            // Un mensaje podrido no puede tumbar el socket ni el proceso
            // (server.ts mata la app ante un unhandledRejection).
            try {
                await registrarEntrante(cuentaId, concesionariaId, msg);
            } catch (err) {
                logger.error(`[whatsapp:${cuentaId}] no se pudo registrar el mensaje ${msg.waMessageId}: ${mensajeCorto(err)}`);
            }
        },
        onActualizacion: async (waMessageId, estadoEntrega) => {
            try {
                await marcarActualizacion(concesionariaId, waMessageId, estadoEntrega);
            } catch (err) {
                logger.error(`[whatsapp:${cuentaId}] ack ${estadoEntrega} de ${waMessageId} falló: ${mensajeCorto(err)}`);
            }
        },
    });

    clientes.set(cuentaId, entrada);
    return entrada;
}

/** Refleja en la fila lo que reporta el socket. Nunca tira: es telemetría. */
async function persistirEstado(
    cuentaId: number,
    concesionariaId: number,
    estadoNuevo: EstadoCliente,
    extra?: { numero?: string | null; error?: string | null },
): Promise<void> {
    try {
        await conContextoSistema(concesionariaId, async () => {
            await prisma.whatsappCuenta.update({
                where: { id: cuentaId },
                data: {
                    estado: estadoNuevo as EstadoWhatsappCuenta,
                    ...(extra?.numero !== undefined ? { numero: extra.numero } : {}),
                    // `error: null` limpia el último error (reconexión OK); si el
                    // callback no trae la clave, el error previo se conserva.
                    ...(extra?.error !== undefined ? { ultimoError: extra.error } : {}),
                },
            });
        });
    } catch (err) {
        logger.error(`[whatsapp:${cuentaId}] no se pudo persistir el estado ${estadoNuevo}: ${mensajeCorto(err)}`);
    }
}

/**
 * Re-vincula al arranque las cuentas activas que ya tienen sesión en disco.
 *
 * El socket no sobrevive al reinicio del proceso; la sesión de Baileys sí (vive
 * en WHATSAPP_AUTH_DIR). Sin esto, después de cada deploy los números quedan
 * mudos hasta que un admin entra a Ajustes y aprieta "conectar". Las cuentas SIN
 * sesión se saltean: levantarles el socket sólo generaría un QR que nadie mira.
 *
 * Barrido CROSS-TENANT deliberado (atiende a todas las concesionarias): va por
 * `withAuthBypass`, que es el cliente RAW dentro de una transacción con la RLS
 * bypasseada. Con el rol de runtime `app_rw` un findMany raw SIN esas GUC lo
 * filtraría la policy `tenant_iso` a 0 filas. Al no pasar por la extensión,
 * `deletedAt` se filtra A MANO.
 *
 * La llama server.ts (fuera de este grupo de archivos): si el hook todavía no
 * existe, la función igual queda exportada y lista.
 */
export async function iniciarCuentasActivas(): Promise<number> {
    if (env.NODE_ENV === 'test') return 0;

    let cuentas: Array<{ id: number; concesionariaId: number; alias: string }>;
    try {
        cuentas = await withAuthBypass((tx) => tx.whatsappCuenta.findMany({
            where: { activa: true, deletedAt: null },
            select: { id: true, concesionariaId: true, alias: true },
            orderBy: { id: 'asc' },
        }));
    } catch (err) {
        logger.error(`[whatsapp] no se pudieron listar las cuentas activas: ${mensajeCorto(err)}`);
        return 0;
    }

    let levantadas = 0;
    for (const cuenta of cuentas) {
        if (!tieneSesion(cuenta.id)) {
            logger.info(`[whatsapp:${cuenta.id}] "${cuenta.alias}" sin sesión en disco: hay que vincular por QR`);
            continue;
        }
        try {
            await conectar(cuenta.id, cuenta.concesionariaId);
            levantadas += 1;
            logger.info(`[whatsapp:${cuenta.id}] "${cuenta.alias}" reconectando desde la sesión guardada`);
        } catch (err) {
            // Una cuenta rota no puede frenar al resto ni al arranque.
            logger.error(`[whatsapp:${cuenta.id}] no se pudo reconectar: ${mensajeCorto(err)}`);
        }
    }
    return levantadas;
}

/**
 * Fachada con nombre del singleton. Existe además de los exports sueltos porque
 * los consumidores de infraestructura (el worker de envío) importan
 * `{ whatsappManager }`: leer `whatsappManager.enviar(...)` deja claro en el
 * punto de uso que atrás hay un socket vivo y no una simple función.
 */
export const whatsappManager = {
    obtener,
    tieneSesion,
    estado,
    conectar,
    desconectar,
    cerrarSesion,
    enviar,
    iniciarCuentasActivas,
};
