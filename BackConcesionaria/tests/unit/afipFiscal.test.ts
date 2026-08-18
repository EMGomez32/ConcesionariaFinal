import {
    CBTE_CODE,
    CBTE_LETRA,
    ivaId,
    docCodeFor,
    condIvaReceptorId,
    determinarTipoComprobante,
    descomponerImporte,
    monedaAfip,
    buildAfipQrUrl,
    round2,
    ALICUOTA_IVA_DEFAULT,
} from '../../src/domain/services/afip/fiscal';
import { MockAfipService } from '../../src/infrastructure/afip/MockAfipService';

// Unit tests PUROS (sin DB): validan la lógica fiscal AFIP y el mock de CAE.
// Corren standalone: `npx jest tests/unit` sin el stack docker.
describe('fiscal — determinarTipoComprobante', () => {
    it('emisor RI + receptor RI → Factura A', () => {
        expect(determinarTipoComprobante('responsable_inscripto', 'responsable_inscripto')).toBe('factura_a');
    });
    it('emisor RI + consumidor final → Factura B', () => {
        expect(determinarTipoComprobante('responsable_inscripto', 'consumidor_final')).toBe('factura_b');
    });
    it('emisor RI + monotributo → Factura B (no A: sólo RI habilita A)', () => {
        expect(determinarTipoComprobante('responsable_inscripto', 'monotributo')).toBe('factura_b');
    });
    it('emisor RI + exento → Factura B', () => {
        expect(determinarTipoComprobante('responsable_inscripto', 'exento')).toBe('factura_b');
    });
    it('emisor monotributo → siempre Factura C', () => {
        expect(determinarTipoComprobante('monotributo', 'responsable_inscripto')).toBe('factura_c');
        expect(determinarTipoComprobante('monotributo', 'consumidor_final')).toBe('factura_c');
    });
    it('emisor exento → Factura C', () => {
        expect(determinarTipoComprobante('exento', 'consumidor_final')).toBe('factura_c');
    });
});

describe('fiscal — descomponerImporte (precio bruto → neto + IVA)', () => {
    it('descompone un bruto con IVA 21% (Factura A/B)', () => {
        // 121000 bruto @ 21% → neto 100000, iva 21000
        const r = descomponerImporte(121000, 21, 'factura_a');
        expect(r.neto).toBe(100000);
        expect(r.iva).toBe(21000);
        expect(r.total).toBe(121000);
        expect(r.alicuota).toBe(21);
    });
    it('neto + iva === total (sin arrastre de flotante)', () => {
        const r = descomponerImporte(1000000, ALICUOTA_IVA_DEFAULT, 'factura_b');
        expect(round2(r.neto + r.iva)).toBe(r.total);
    });
    it('Factura C no discrimina IVA: neto = total, iva = 0', () => {
        const r = descomponerImporte(50000, 21, 'factura_c');
        expect(r.neto).toBe(50000);
        expect(r.iva).toBe(0);
        expect(r.alicuota).toBe(0);
    });
    it('redondea a 2 decimales', () => {
        const r = descomponerImporte(12345.67, 21, 'factura_a');
        // Invariante robusta a flotante: round2 es idempotente sobre neto/iva.
        expect(round2(r.neto)).toBe(r.neto);
        expect(round2(r.iva)).toBe(r.iva);
        expect(round2(r.neto + r.iva)).toBe(r.total);
    });
});

describe('fiscal — códigos AFIP', () => {
    it('códigos de comprobante A=1 B=6 C=11', () => {
        expect(CBTE_CODE.factura_a).toBe(1);
        expect(CBTE_CODE.factura_b).toBe(6);
        expect(CBTE_CODE.factura_c).toBe(11);
    });
    it('letras A/B/C', () => {
        expect(CBTE_LETRA.factura_a).toBe('A');
        expect(CBTE_LETRA.factura_b).toBe('B');
        expect(CBTE_LETRA.factura_c).toBe('C');
    });
    it('docCodeFor: CUIT=80 CUIL=86 DNI=96 CF/null=99', () => {
        expect(docCodeFor('CUIT')).toBe(80);
        expect(docCodeFor('CUIL')).toBe(86);
        expect(docCodeFor('DNI')).toBe(96);
        expect(docCodeFor('CF')).toBe(99);
        expect(docCodeFor(null)).toBe(99);
        expect(docCodeFor(undefined)).toBe(99);
    });
    it('condIvaReceptorId (RG 5616): RI=1 Exento=4 CF=5 Monotributo=6', () => {
        expect(condIvaReceptorId('responsable_inscripto')).toBe(1);
        expect(condIvaReceptorId('exento')).toBe(4);
        expect(condIvaReceptorId('consumidor_final')).toBe(5);
        expect(condIvaReceptorId('monotributo')).toBe(6);
    });
    it('ivaId por alícuota: 21→5, 10.5→4, 27→6, 0→3', () => {
        expect(ivaId(21)).toBe(5);
        expect(ivaId(10.5)).toBe(4);
        expect(ivaId(27)).toBe(6);
        expect(ivaId(0)).toBe(3);
    });
    it('monedaAfip: ARS→PES, USD→DOL', () => {
        expect(monedaAfip('ARS')).toBe('PES');
        expect(monedaAfip('USD')).toBe('DOL');
    });
});

describe('fiscal — QR RG 4291', () => {
    it('arma la URL con el payload base64 decodificable', () => {
        const url = buildAfipQrUrl({
            ver: 1, fecha: '2026-08-18', cuit: 20111111112, ptoVta: 1, tipoCmp: 1,
            nroCmp: 5, importe: 121000, moneda: 'PES', ctz: 1, tipoDocRec: 80,
            nroDocRec: 30712345678, tipoCodAut: 'E', codAut: 71234567890123,
        });
        expect(url.startsWith('https://www.afip.gob.ar/fe/qr/?p=')).toBe(true);
        const b64 = url.split('?p=')[1];
        const json = JSON.parse(Buffer.from(b64, 'base64').toString('utf-8'));
        expect(json).toMatchObject({ ver: 1, cuit: 20111111112, importe: 121000, codAut: 71234567890123, tipoCodAut: 'E' });
    });
});

describe('MockAfipService', () => {
    const svc = new MockAfipService();
    const baseReq = {
        cuit: 20111111112, puntoVenta: 1, tipoCbte: 1, concepto: 1, docTipo: 80,
        docNro: 30712345678, condIvaReceptorId: 1, numero: 1, fecha: '20260818',
        neto: 100000, iva: 21000, total: 121000, alicuota: 21, moneda: 'PES', cotizacion: 1,
    };

    it('entorno() === mock', () => {
        expect(svc.entorno()).toBe('mock');
    });
    it('emite un CAE ok de 14 dígitos', async () => {
        const r = await svc.emitirCae(baseReq);
        expect(r.ok).toBe(true);
        expect(r.cae).toMatch(/^\d{14}$/);
    });
    it('el CAE es determinístico para la misma entrada', async () => {
        const a = await svc.emitirCae(baseReq);
        const b = await svc.emitirCae(baseReq);
        expect(a.cae).toBe(b.cae);
    });
    it('el CAE cambia con el número de comprobante', async () => {
        const a = await svc.emitirCae({ ...baseReq, numero: 1 });
        const b = await svc.emitirCae({ ...baseReq, numero: 2 });
        expect(a.cae).not.toBe(b.cae);
    });
    it('vencimiento del CAE a +10 días de la fecha', async () => {
        const r = await svc.emitirCae({ ...baseReq, fecha: '20260818' });
        expect(r.caeVencimiento).toBe('20260828');
    });
    it('vencimiento cruza fin de mes correctamente', async () => {
        const r = await svc.emitirCae({ ...baseReq, fecha: '20260825' });
        expect(r.caeVencimiento).toBe('20260904');
    });
});
