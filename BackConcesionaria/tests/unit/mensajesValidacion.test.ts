import { z } from 'zod';
import { obligatorio, invalido, listaDeOpciones, elegiUnaOpcion, etiquetaDe, mapaDeErrores } from '../../src/interface/validation/mensajes';

// Unit tests PUROS de los mensajes de validación (sin DB ni HTTP).
describe('mensajes de validación', () => {
    test('concuerdan género y número con el artículo', () => {
        expect(obligatorio('La sucursal')).toBe('La sucursal es obligatoria');
        expect(obligatorio('El cliente')).toBe('El cliente es obligatorio');
        expect(obligatorio('Los ítems')).toBe('Los ítems son obligatorios');
        expect(obligatorio('Las observaciones')).toBe('Las observaciones son obligatorias');
        expect(invalido('La venta')).toBe('La venta no es válida');
        expect(invalido('El vehículo')).toBe('El vehículo no es válido');
    });

    test('las opciones de un enum se leen como una lista en castellano', () => {
        expect(listaDeOpciones(['ARS', 'USD'])).toBe('ARS o USD');
        expect(listaDeOpciones(['activa', 'convertida_en_venta', 'vencida'])).toBe('activa, convertida en venta o vencida');
        expect(listaDeOpciones(['referido', 'otro'])).toBe('referido u otro');
        expect(elegiUnaOpcion('La moneda', ['ARS', 'USD'])).toBe('Elegí una moneda válida: ARS o USD');
        expect(elegiUnaOpcion('El estado', ['abierta', 'cerrada'])).toBe('Elegí un estado válido: abierta o cerrada');
    });

    test('la etiqueta sale del último tramo del path; sin etiqueta, en palabras', () => {
        expect(etiquetaDe(['items', 0, 'vehiculoId'])).toBe('El vehículo');
        expect(etiquetaDe(['fechaRaraDeAlgo'])).toBe('El campo «fecha rara de algo»');
        expect(etiquetaDe([])).toBe('Los datos enviados');
    });

    test('el mapa de errores cubre lo que el schema no trae', () => {
        const schema = z.object({
            sucursalId: z.number(),
            moneda: z.enum(['ARS', 'USD']),
            nombre: z.string().min(1),
            monto: z.number().positive(),
            km: z.number().int().nonnegative(),
            dominio: z.string().max(3),
        });
        const r = schema.safeParse({ moneda: 'EUR', nombre: '', monto: 0, km: -1.5, dominio: 'ABCDEF' }, { error: mapaDeErrores });
        expect(r.success).toBe(false);
        const porCampo = Object.fromEntries(r.error!.issues.map((i) => [i.path.join('.'), i.message]));
        expect(porCampo).toMatchObject({
            sucursalId: 'La sucursal es obligatoria',
            moneda: 'Elegí una moneda válida: ARS o USD',
            nombre: 'El nombre es obligatorio',
            monto: 'El monto tiene que ser mayor a 0',
            dominio: 'El dominio no puede superar los 3 caracteres',
        });
        expect(porCampo.km).toMatch(/^El kilometraje (tiene que ser un número entero|no puede ser negativo)$/);
    });

    test('un mensaje propio del schema gana sobre el mapa', () => {
        const r = z.object({ x: z.string({ error: 'Propio' }) }).safeParse({}, { error: mapaDeErrores });
        expect(r.error!.issues[0].message).toBe('Propio');
    });
});
