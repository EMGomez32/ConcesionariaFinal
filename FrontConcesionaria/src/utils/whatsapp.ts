/**
 * Arma un link de WhatsApp (wa.me) con un mensaje YA REDACTADO.
 *
 * IMPORTANTE: no envía nada. Abre el chat con el borrador y es el usuario quien
 * revisa y manda (igual que un `mailto:`). El mensaje se codifica con
 * encodeURIComponent.
 *
 * Normalización AR best-effort: se toman solo los dígitos y se antepone el
 * prefijo de país 54 si falta. Devuelve null si no hay un número usable (menos
 * de 8 dígitos) — el llamador muestra el botón deshabilitado. Como el usuario
 * verifica el contacto antes de enviar, un número mal cargado no manda mensajes
 * a la persona equivocada.
 */
export const waLink = (telefono: string | undefined | null, mensaje: string): string | null => {
    const d = (telefono || '').replace(/\D/g, '');
    if (d.length < 8) return null;
    const num = d.startsWith('54') ? d : `54${d}`;
    return `https://wa.me/${num}?text=${encodeURIComponent(mensaje)}`;
};
