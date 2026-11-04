import { describe, expect, it } from 'vitest';
import { etiquetaDocumento } from './documento';

describe('etiquetaDocumento', () => {
    it('usa el tipo cargado en la ficha cuando está', () => {
        expect(etiquetaDocumento('20334445556', 'CUIT')).toBe('CUIT');
        expect(etiquetaDocumento('33444555', 'DNI')).toBe('DNI');
    });

    it('sin tipo, un número de 7 u 8 dígitos es un DNI (no un CUIT/CUIL)', () => {
        expect(etiquetaDocumento('33444555')).toBe('DNI');
        expect(etiquetaDocumento('33.444.555')).toBe('DNI');
        expect(etiquetaDocumento('5444555')).toBe('DNI');
    });

    it('sin tipo, 11 dígitos es CUIT/CUIL', () => {
        expect(etiquetaDocumento('20-33444555-6')).toBe('CUIT/CUIL');
    });

    it('cualquier otra cosa queda como "Documento"', () => {
        expect(etiquetaDocumento('')).toBe('Documento');
        expect(etiquetaDocumento('ABC123', 'CF')).toBe('Documento');
    });
});
