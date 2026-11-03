import type { TipoDocumento } from '../../types/cliente.types';

/**
 * Rótulo del documento de un cliente.
 *
 * La ficha guarda un solo número (`dni`) y, opcionalmente, su tipo fiscal
 * (`tipoDoc`). El listado decía siempre "CUIT/CUIL: 33444555", que es un DNI
 * de 8 dígitos. Si el tipo está cargado se usa ese; si no, se deduce del largo:
 * 11 dígitos es CUIT/CUIL, 7 u 8 es DNI.
 */
export const etiquetaDocumento = (
    dni?: string | null,
    tipoDoc?: TipoDocumento | null,
): string => {
    if (tipoDoc === 'CUIT' || tipoDoc === 'CUIL' || tipoDoc === 'DNI') return tipoDoc;
    const digitos = (dni ?? '').replace(/\D/g, '');
    if (digitos.length === 11) return 'CUIT/CUIL';
    if (digitos.length === 7 || digitos.length === 8) return 'DNI';
    return 'Documento';
};

/** Ayuda breve para las siglas (se usa como `title`). */
export const AYUDA_DOCUMENTO: Record<string, string> = {
    DNI: 'Documento Nacional de Identidad',
    CUIT: 'Clave Única de Identificación Tributaria',
    CUIL: 'Código Único de Identificación Laboral',
    'CUIT/CUIL': 'Clave fiscal de 11 dígitos (CUIT o CUIL)',
    Documento: 'Número de documento cargado en la ficha',
};
