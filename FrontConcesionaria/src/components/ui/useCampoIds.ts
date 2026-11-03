import { useId } from 'react';

/**
 * Ids accesibles de un campo de formulario (Input, Select, Textarea, Combobox).
 * Si la página no pasa `id`, se genera uno con useId: antes la etiqueta usaba
 * `htmlFor={props.id}` y en 322 de 343 usos no había id, así que el clic en la
 * etiqueta no enfocaba nada y el lector de pantalla anunciaba el campo sin
 * nombre. El error o la ayuda quedan conectados con aria-describedby (se leen al
 * entrar al campo), sumados a un aria-describedby que pase la página.
 */
export function useCampoIds(id: string | undefined, describedBy: string | undefined, conMensaje: boolean) {
    const generado = useId();
    const campoId = id ?? `campo-${generado}`;
    const mensajeId = `${campoId}-mensaje`;
    const descripcion = [describedBy, conMensaje ? mensajeId : null].filter(Boolean).join(' ') || undefined;
    return { campoId, mensajeId, descripcion };
}
