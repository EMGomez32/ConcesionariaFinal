import { withAuthBypass } from '../../infrastructure/database/unitOfWork';
import { BaseException, NotFoundException } from '../../domain/exceptions/BaseException';
import { cifrarSecreto, descifrarSecreto } from '../../infrastructure/security/secretBox';
import {
    CANTIDAD_CODIGOS_RECUPERACION, generarCodigoRecuperacion, generarSecretoTotp, hashCodigoRecuperacion,
    normalizarCodigoRecuperacion, otpauthUrl, verificarTotp,
} from '../../infrastructure/security/totp';

/**
 * 2FA (TOTP) de los usuarios. Todo el acceso a `usuarios` va con `withAuthBypass`: el login con
 * segundo factor corre SIN sesión (sin tenant en contexto) y, bajo app_rw, la RLS ocultaría la fila.
 * Siempre se filtra por el id del usuario que ya autenticó el llamador.
 */

const EMISOR = 'AUTENZA';

export interface SetupMfa {
    secreto: string;
    otpauthUrl: string;
}

async function cargar(usuarioId: number) {
    const u = await withAuthBypass((tx) => tx.usuario.findFirst({
        where: { id: usuarioId, deletedAt: null },
        select: { id: true, email: true, totpSecret: true, totpEnabled: true, totpLastStep: true },
    }));
    if (!u) throw new NotFoundException('Usuario');
    return u;
}

export async function estadoMfa(usuarioId: number) {
    const u = await cargar(usuarioId);
    const restantes = u.totpEnabled
        ? await withAuthBypass((tx) => tx.recoveryCode.count({ where: { usuarioId, usedAt: null } }))
        : 0;
    return { activo: u.totpEnabled, codigosRestantes: restantes };
}

/** Genera un secreto NUEVO y lo guarda (cifrado) como pendiente: no vale hasta confirmar un código. */
export async function iniciarSetupMfa(usuarioId: number): Promise<SetupMfa> {
    const u = await cargar(usuarioId);
    if (u.totpEnabled) {
        throw new BaseException(409, 'El 2FA ya está activado. Desactivalo primero si querés configurarlo de nuevo.', 'MFA_YA_ACTIVO');
    }
    const secreto = generarSecretoTotp();
    await withAuthBypass((tx) => tx.usuario.update({
        where: { id: usuarioId },
        data: { totpSecret: cifrarSecreto(secreto), totpEnabled: false, totpEnabledAt: null, totpLastStep: null },
    }));
    return { secreto, otpauthUrl: otpauthUrl({ secreto, cuenta: u.email, emisor: EMISOR }) };
}

/** Códigos de recuperación nuevos (reemplazan a todos los anteriores). Devuelve los EN CLARO, una sola vez. */
async function emitirCodigos(usuarioId: number): Promise<string[]> {
    const codigos = Array.from({ length: CANTIDAD_CODIGOS_RECUPERACION }, generarCodigoRecuperacion);
    await withAuthBypass(async (tx) => {
        await tx.recoveryCode.deleteMany({ where: { usuarioId } });
        await tx.recoveryCode.createMany({
            data: codigos.map((c) => ({ usuarioId, codeHash: hashCodigoRecuperacion(c) })),
        });
    });
    return codigos;
}

/** Confirma el setup con un código de la app: activa el 2FA y entrega los códigos de recuperación. */
export async function confirmarSetupMfa(usuarioId: number, codigo: string): Promise<string[]> {
    const u = await cargar(usuarioId);
    if (u.totpEnabled) throw new BaseException(409, 'El 2FA ya está activado.', 'MFA_YA_ACTIVO');
    if (!u.totpSecret) {
        throw new BaseException(400, 'Primero iniciá la configuración del 2FA.', 'MFA_SIN_SETUP');
    }
    const paso = verificarTotp(descifrarSecreto(u.totpSecret), codigo);
    if (paso === null) throw new BaseException(400, 'El código es incorrecto o venció. Probá con el siguiente.', 'MFA_CODIGO_INVALIDO');

    await withAuthBypass((tx) => tx.usuario.update({
        where: { id: usuarioId },
        data: { totpEnabled: true, totpEnabledAt: new Date(), totpLastStep: paso },
    }));
    return emitirCodigos(usuarioId);
}

/**
 * Verifica el segundo factor de un login: un código TOTP o un código de recuperación.
 *  - TOTP: el paso se "reclama" con un UPDATE condicional (totp_last_step < paso): dos requests con
 *    el mismo código no pasan las dos (replay) y un código ya usado no vale otra vez.
 *  - Recuperación: se marca usado con un UPDATE condicional (used_at IS NULL): sirve una sola vez.
 */
export async function verificarSegundoFactor(
    usuarioId: number,
    entrada: { codigo?: string; recuperacion?: string },
): Promise<{ ok: boolean; usoRecuperacion: boolean }> {
    const u = await cargar(usuarioId);
    if (!u.totpEnabled || !u.totpSecret) return { ok: false, usoRecuperacion: false };

    if (entrada.codigo) {
        const paso = verificarTotp(descifrarSecreto(u.totpSecret), entrada.codigo, { ultimoPaso: u.totpLastStep });
        if (paso === null) return { ok: false, usoRecuperacion: false };
        const r = await withAuthBypass((tx) => tx.usuario.updateMany({
            where: { id: usuarioId, OR: [{ totpLastStep: null }, { totpLastStep: { lt: paso } }] },
            data: { totpLastStep: paso },
        }));
        return { ok: r.count === 1, usoRecuperacion: false };
    }

    if (entrada.recuperacion) {
        const normal = normalizarCodigoRecuperacion(entrada.recuperacion);
        if (!normal) return { ok: false, usoRecuperacion: false };
        const r = await withAuthBypass((tx) => tx.recoveryCode.updateMany({
            where: { usuarioId, codeHash: hashCodigoRecuperacion(normal), usedAt: null },
            data: { usedAt: new Date() },
        }));
        return { ok: r.count === 1, usoRecuperacion: r.count === 1 };
    }

    return { ok: false, usoRecuperacion: false };
}

export async function regenerarCodigosMfa(usuarioId: number): Promise<string[]> {
    const u = await cargar(usuarioId);
    if (!u.totpEnabled) throw new BaseException(400, 'El 2FA no está activado.', 'MFA_NO_ACTIVO');
    return emitirCodigos(usuarioId);
}

/** Apaga el 2FA y borra secreto y códigos. Lo usan: el propio usuario (con prueba de identidad), un admin que resetea, y el script de emergencia. */
export async function desactivarMfa(usuarioId: number): Promise<void> {
    await withAuthBypass(async (tx) => {
        await tx.usuario.update({
            where: { id: usuarioId },
            data: { totpSecret: null, totpEnabled: false, totpEnabledAt: null, totpLastStep: null },
        });
        await tx.recoveryCode.deleteMany({ where: { usuarioId } });
    });
}
