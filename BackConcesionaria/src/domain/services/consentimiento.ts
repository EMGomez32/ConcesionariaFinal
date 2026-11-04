/**
 * Catálogo de los textos de consentimiento que se le informan al titular (PRIV-04,
 * ISO 27701 A.7.2.4 "obtener y registrar el consentimiento").
 *
 * La ficha del cliente guarda la VERSIÓN que se mostró (`Cliente.consentimientoVersion`)
 * y acá vive el texto de cada versión. Con eso se puede contestar "¿a qué dijo que sí
 * esta persona, y cuándo?" sin guardar el mismo párrafo en cada fila.
 *
 * REGLA: una versión publicada NO se edita nunca. Si el texto cambia (otra finalidad,
 * otro responsable, una aclaración), se agrega una versión nueva y se pasa
 * `VERSION_CONSENTIMIENTO_VIGENTE` a ella. Reescribir una versión vieja cambiaría lo que
 * "dijeron que sí" personas que nunca leyeron el texto nuevo.
 *
 * Los textos tienen que coincidir con lo que muestran las pantallas que lo piden:
 *   - web:  FrontConcesionaria/src/pages/atenciones/AtencionPage.tsx (modal de datos)
 *   - app:  AppConcesionaria/src/screens/AtencionDetalleScreen.tsx (hoja de datos)
 * La app móvil todavía no manda la versión: el backend le estampa la vigente, que es
 * el mismo texto que esa pantalla muestra hoy.
 */

export const TEXTOS_CONSENTIMIENTO = {
    'contacto-v1':
        'El cliente presta conformidad para ser contactado (Ley 25.326 de Protección de Datos Personales).',
} as const;

export type VersionConsentimiento = keyof typeof TEXTOS_CONSENTIMIENTO;

export const VERSION_CONSENTIMIENTO_VIGENTE: VersionConsentimiento = 'contacto-v1';

export const VERSIONES_CONSENTIMIENTO = Object.keys(TEXTOS_CONSENTIMIENTO) as VersionConsentimiento[];

export function esVersionConsentimiento(v: unknown): v is VersionConsentimiento {
    return typeof v === 'string' && Object.prototype.hasOwnProperty.call(TEXTOS_CONSENTIMIENTO, v);
}

/** El texto de una versión, o null si la ficha es anterior al registro de versiones. */
export function textoDeConsentimiento(version: string | null | undefined): string | null {
    return esVersionConsentimiento(version) ? TEXTOS_CONSENTIMIENTO[version] : null;
}
