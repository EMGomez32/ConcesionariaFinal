import fs from 'fs';
import path from 'path';

/**
 * CENTINELA DE LECTURAS — criterio de aceptación 7.
 *
 * "El vendedor no accede a costos ni márgenes POR NINGUNA VÍA, INCLUIDA LA API."
 *
 * El centinela que ya existe (`tests/integration/permisos-mutaciones.test.ts`)
 * escanea sólo `post|put|patch|delete`, con el argumento —correcto para lo suyo—
 * de que "leer no rompe nada". Pero el criterio 7 es EXACTAMENTE un problema de
 * lectura: todos los agujeros que este módulo tuvo que cerrar eran GET, y todos
 * pasaban aquel centinela en verde.
 *
 * Este archivo es la otra mitad. Es ESTÁTICO a propósito —lee los fuentes con
 * `fs`, no importa nada de `src/`— por dos razones:
 *
 *   1. Corre en el job de UNIT TESTS, que define sólo un DATABASE_URL dummy. Un
 *      test que importara un repositorio arrastraría prisma → env y mataría el
 *      proceso en el import. Al no importar nada, corre en cada PR sin stack.
 *   2. Un test de integración prueba las rutas que EXISTEN HOY. Este prueba la
 *      forma del código, así que también atrapa la ruta que todavía no se
 *      escribió — que es para lo que sirve un centinela.
 *
 * Regla de oro, igual que en el centinela de mutaciones: toda excepción va
 * declarada CON MOTIVO ESCRITO. Una lista de excepciones sin motivos es una
 * lista de agujeros.
 */

const RAIZ = path.resolve(__dirname, '..', '..', 'src');
const DIR_REPOS = path.join(RAIZ, 'infrastructure', 'database', 'repositories');
const DIR_CONTROLLERS = path.join(RAIZ, 'interface', 'controllers');
const DIR_RUTAS = path.join(RAIZ, 'interface', 'routes');

/**
 * Relaciones cuyo `include: { x: true }` publica una fila ancha con datos que la
 * separación vendedor/administración prohíbe.
 *
 * - `vehiculo`   → `precioCompra`, `fechaCompra`, `proveedorCompraId`, `precioMinimo`
 * - `vendedor` / `creadaPor` / `registradoPor` / `usuario` / `solicitante`
 *                → `passwordHash`, `email`, `comisionPorcentaje`
 * - `proveedor*` → el padrón de compras (a quién se le compra, a qué taller se manda)
 */
const RELACIONES_ANCHAS = [
    'vehiculo',
    'vendedor',
    'creadaPor',
    'registradoPor',
    'proveedor',
    'proveedorOrigen',
    'proveedorDestino',
    'proveedorCompra',
    'solicitante',
    'resueltaPor',
];

interface Excepcion {
    archivo: string;
    relacion?: string;
    motivo: string;
}

/**
 * Excepciones LEGÍTIMAS al recorte de includes.
 *
 * Todas son generadores de PDF: el objeto ancho se consume dentro del proceso
 * para imprimir campos elegidos a mano y NUNCA se serializa al cliente. El
 * `res.json(result)` que convierte un include en fuga no existe en ese camino.
 * Quedan declaradas —en vez de excluir el archivo en silencio— porque si alguien
 * agrega un renglón con el costo al PDF, el motivo escrito acá es lo que le va a
 * decir por qué no puede.
 */
const EXCEPCIONES: readonly Excepcion[] = [
    {
        archivo: 'ComprobanteController.ts',
        relacion: 'vehiculo',
        motivo:
            'Generadores de PDF (comprobante de venta, presupuesto, recibo de cuota, orden de ' +
            'taller). El objeto se pasa a pdfkit y se imprimen campos elegidos uno por uno; nunca ' +
            'sale por res.json. Si algún día se imprime un importe de compra, esta excepción hay ' +
            'que sacarla y usar VEHICULO_PUBLICO.',
    },
    {
        archivo: 'FacturaController.ts',
        relacion: 'vehiculo',
        motivo:
            'Mismo caso: la factura AFIP arma la descripción del ítem con marca/modelo/dominio del ' +
            'vehículo y no serializa el objeto. El PDF no lleva ningún dato de compra.',
    },
];

const archivosTs = (dir: string): string[] =>
    fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.ts') && !f.endsWith('.d.ts')) : [];

const leer = (dir: string, archivo: string): string => fs.readFileSync(path.join(dir, archivo), 'utf8');

/** Quita comentarios de línea y de bloque para no cazar ejemplos escritos en la documentación. */
function sinComentarios(fuente: string): string {
    return fuente.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const esExcepcion = (archivo: string, relacion: string): Excepcion | undefined =>
    EXCEPCIONES.find((e) => e.archivo === archivo && (e.relacion === undefined || e.relacion === relacion));

describe('Centinela de lecturas: los datos de administración no salen por un include', () => {
    test('el centinela sabe leer los fuentes (auto-chequeo)', () => {
        // Sin esto, un cambio de layout dejaría al centinela pasando sobre cero
        // archivos: el peor final posible para un test como éste.
        expect(archivosTs(DIR_REPOS).length).toBeGreaterThan(20);
        expect(archivosTs(DIR_CONTROLLERS).length).toBeGreaterThan(20);
        expect(archivosTs(DIR_RUTAS).length).toBeGreaterThan(30);

        // Y que el detector detecte: línea sintética, no vive en ningún archivo.
        const sintetica = 'include: { cliente: true, vehiculo: true },';
        const re = new RegExp(`\\bvehiculo\\s*:\\s*true\\b`);
        expect(re.test(sintetica)).toBe(true);
        expect(re.test('include: { vehiculo: { select: VEHICULO_PUBLICO } },')).toBe(false);
    });

    test('ningún repositorio ni controller expone una relación ancha con `: true`', () => {
        const huecos: string[] = [];

        for (const [dir, etiqueta] of [[DIR_REPOS, 'repositories'], [DIR_CONTROLLERS, 'controllers']] as const) {
            for (const archivo of archivosTs(dir)) {
                const fuente = sinComentarios(leer(dir, archivo));
                fuente.split(/\r?\n/).forEach((linea, i) => {
                    for (const relacion of RELACIONES_ANCHAS) {
                        // `vehiculo: true` pero no `vehiculoId: true` ni `vehiculo: { select: ... }`.
                        if (!new RegExp(`\\b${relacion}\\s*:\\s*true\\b`).test(linea)) continue;
                        if (esExcepcion(archivo, relacion)) continue;
                        huecos.push(`  ${etiqueta}/${archivo}:${i + 1}  ${relacion}: true`);
                    }
                });
            }
        }

        if (huecos.length > 0) {
            throw new Error(
                `Hay ${huecos.length} include(s) que devuelven la fila ENTERA de una entidad ancha.\n` +
                    `Por ahí salen precioCompra / precioMinimo / comisionPorcentaje / passwordHash a\n` +
                    `rutas de LECTURA que en su mayoría no llevan authorize:\n\n` +
                    huecos.join('\n') +
                    `\n\nArreglo: usar la proyección de src/infrastructure/database/proyecciones.ts\n` +
                    `(VEHICULO_PUBLICO / USUARIO_PUBLICO / PROVEEDOR_PUBLICO) con \`select\`, no \`true\`.\n` +
                    `Si el objeto NO se serializa al cliente (un PDF), agregalo a EXCEPCIONES\n` +
                    `en este archivo CON EL MOTIVO ESCRITO.`
            );
        }
    });

    test('las proyecciones públicas no llevan ningún dato de administración', () => {
        const fuente = fs.readFileSync(path.join(RAIZ, 'infrastructure', 'database', 'proyecciones.ts'), 'utf8');
        const bloque = (nombre: string): string => {
            const m = new RegExp(`export const ${nombre} = \\{([\\s\\S]*?)\\} as const;`).exec(fuente);
            if (!m) throw new Error(`No encontré la proyección ${nombre} en proyecciones.ts`);
            return m[1];
        };

        // El costo, el piso de venta y la cadena de compra NUNCA viajan anidados.
        for (const prohibido of ['precioCompra', 'precioMinimo', 'fechaCompra', 'proveedorCompraId', 'formaPagoCompra']) {
            expect(bloque('VEHICULO_PUBLICO')).not.toContain(prohibido);
        }
        // Credencial, dato personal y remuneración.
        for (const prohibido of ['passwordHash', 'comisionPorcentaje', 'email']) {
            expect(bloque('USUARIO_PUBLICO')).not.toContain(prohibido);
        }
        // Y que sigan sirviendo para algo: una proyección vacía pasaría todo lo de arriba.
        expect(bloque('VEHICULO_PUBLICO')).toContain('precioLista');
        expect(bloque('USUARIO_PUBLICO')).toContain('nombre');
    });

    /**
     * Rutas de LECTURA cuya respuesta lleva costo, margen o el padrón de compras.
     * Tienen que estar gateadas y el vendedor no puede estar en la lista.
     */
    const LECTURAS_SIN_VENDEDOR: ReadonlyArray<{ archivo: string; ruta: string; motivo: string }> = [
        { archivo: 'gasto.routes.ts', ruta: '/', motivo: 'gasto.monto ES el costo de preparación de la unidad' },
        { archivo: 'gasto.routes.ts', ruta: '/total', motivo: 'el agregado del mismo costo' },
        { archivo: 'gasto.routes.ts', ruta: '/:id', motivo: 'el costo de un gasto puntual + su proveedor' },
        { archivo: 'gasto-fijo.routes.ts', ruta: '/', motivo: 'estructura de costos operativos del tenant' },
        { archivo: 'gasto-fijo.routes.ts', ruta: '/total', motivo: 'el agregado de los costos fijos' },
        { archivo: 'gasto-fijo.routes.ts', ruta: '/:id', motivo: 'un costo fijo puntual + su proveedor' },
        { archivo: 'postventa-item.routes.ts', ruta: '/caso/:casoId', motivo: 'item.monto = lo que se le pagó al proveedor' },
        { archivo: 'postventa-caso.routes.ts', ruta: '/:id/total', motivo: 'costo acumulado y facturado del caso' },
        { archivo: 'proveedor.routes.ts', ruta: '/:id', motivo: 'la ficha trae vehiculosCompra + montos pagados' },
        { archivo: 'reporte.routes.ts', ruta: '/caja', motivo: 'egresos.gastosVehiculos + gastosFijos, con CSV' },
        { archivo: 'reporte.routes.ts', ruta: '/postventa', motivo: 'costo, facturado, margen y margenTotal por caso' },
        { archivo: 'reporte.routes.ts', ruta: '/rentabilidad', motivo: 'el margen, literalmente' },
        { archivo: 'reporte.routes.ts', ruta: '/stock-antiguedad', motivo: 'capital inmovilizado por unidad' },
        { archivo: 'reporte.routes.ts', ruta: '/ranking-vendedores', motivo: 'performance comparada del equipo' },
        { archivo: 'reporte.routes.ts', ruta: '/comisiones', motivo: 'remuneración del equipo' },
    ];

    test.each(LECTURAS_SIN_VENDEDOR)(
        'GET $ruta ($archivo) está gateada y sin vendedor — $motivo',
        ({ archivo, ruta }) => {
            const fuente = sinComentarios(leer(DIR_RUTAS, archivo));
            // `router.get('<ruta>', ...)` en una sola línea (misma convención que exige
            // el centinela de mutaciones).
            const escapada = ruta.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const m = new RegExp(`router\\.get\\(\\s*'${escapada}'\\s*,([^\\n]*)\\)`).exec(fuente);
            expect(m).not.toBeNull();
            const resto = (m as RegExpExecArray)[1];

            // Tiene candado…
            expect(resto).toMatch(/authorize\(/);
            // …y el vendedor no está adentro.
            expect(resto).not.toMatch(/authorize\([^)]*'vendedor'/);
        },
    );

    test('el precio mínimo no aparece en ningún `select` de conveniencia', () => {
        // El piso de venta sólo puede salir por precioAutorizacion.ts (solicitud
        // autorizada y vigente) y por la ficha del vehículo para admin. Cualquier
        // otro `precioMinimo: true` en un select de repositorio es una fuga.
        const permitidos = new Set(['precioAutorizacion.ts']);
        const huecos: string[] = [];
        for (const [dir, etiqueta] of [[DIR_REPOS, 'repositories'], [DIR_CONTROLLERS, 'controllers']] as const) {
            for (const archivo of archivosTs(dir)) {
                if (permitidos.has(archivo)) continue;
                sinComentarios(leer(dir, archivo)).split(/\r?\n/).forEach((linea, i) => {
                    if (/\bprecioMinimo\s*:\s*true\b/.test(linea)) {
                        huecos.push(`  ${etiqueta}/${archivo}:${i + 1}`);
                    }
                });
            }
        }
        expect(huecos).toEqual([]);
    });
});
