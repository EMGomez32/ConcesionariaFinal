/**
 * ¿Se lo puede contactar? (Ley 25.326: revocación del consentimiento y bloqueo).
 *
 * Un cliente que revocó el consentimiento de contacto o pidió el bloqueo de sus datos
 * NO aparece como alguien a quien llamar: sale de la agenda de seguimientos, de la
 * campanita y queda rotulado en la bandeja. "Nunca dio el consentimiento" NO es lo
 * mismo: la mayoría de los leads llegan solos (escribieron ellos) y contestarles es
 * responder su pedido; lo que se respeta acá es un "no" explícito.
 *
 * Fragmento de `where` de Prisma para filtrar por la relación `cliente`.
 */
export const CLIENTE_CONTACTABLE = { bloqueadoEn: null, consentimientoRevocadoEn: null } as const;

export function esContactable(c: { bloqueadoEn?: Date | null; consentimientoRevocadoEn?: Date | null } | null | undefined): boolean {
    if (!c) return true;
    return !c.bloqueadoEn && !c.consentimientoRevocadoEn;
}
