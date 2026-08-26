import fs from 'fs';
import path from 'path';
import { api, login, loginAsAdmin, authHeaders, unique, tryDelete } from './helpers';

/**
 * Regresión del agujero de permisos: 26 rutas que MUTAN datos corrían sin
 * `authorize(...)`.
 *
 * `src/routes/index.ts` hace `router.use(authenticate)`, así que toda la API exigía
 * sesión — pero NO exigía rol. Los controllers tampoco chequean rol (verificado en
 * VentaController, ReservaController y FinanciacionController: no mencionan roles).
 * Resultado: cualquier usuario del tenant, incluido el perfil `lectura` que el
 * producto vende como "consulta sin editar", podía crear y ANULAR ventas, señas,
 * financiaciones, ingresos, movimientos y archivos. Lo único que lo frenaba era que
 * el menú del front no le mostraba el botón; con curl o pegándole a la URL, pasaba.
 *
 * Este archivo tiene DOS mitades, a propósito:
 *
 *   1. Los tests HTTP (primer describe) prueban el candado como lo ve un atacante:
 *      request real contra el stack. Exigen el stack docker arriba.
 *
 *   2. El CENTINELA (segundo describe) es un chequeo ESTÁTICO sobre los archivos de
 *      rutas: no hace ni una request, y por eso vive en su propio describe sin
 *      `beforeAll` — corre en CI sin base ni docker (`npx jest -t centinela`).
 *      Los tests HTTP cubren las rutas de HOY; el centinela cubre la PRÓXIMA ruta,
 *      que es donde el agujero vuelve: `authorize` es una línea que se olvida.
 *
 * POR QUÉ USAMOS IDS INEXISTENTES (999999999) en todas las requests: `authorize()`
 * es un middleware que corre ANTES del controller, así que rechaza sin haber tocado
 * la base. El 403 no depende de que la venta, la reserva o el archivo existan. Eso
 * hace al test rápido (cero fixtures que crear y limpiar) y robusto (no se rompe
 * porque cambió un invariante de negocio ajeno al permiso).
 *
 * POR QUÉ EXIGIMOS 403 EXACTO Y NO "algo >= 400": un 400 significaría que la request
 * PASÓ el gate y murió validando el body — o sea, que el candado NO está. Un 404
 * significaría que el controller ya salió a buscar el recurso. Sólo el 403 prueba
 * que `authorize()` cortó antes.
 */

type Metodo = 'post' | 'patch' | 'delete';

/** Id que no existe en ninguna tabla: el gate corta antes de que a alguien le importe. */
const ID_FANTASMA = 999999999;

/** Mínimo que acepta `createUsuarioSchema` (min 6). */
const PASSWORD = 'secret123';

/** Los 4 roles que el seed NO trae y este test tiene que fabricar por API. */
const ROLES_A_FABRICAR = ['lectura', 'vendedor', 'cobrador', 'postventa'] as const;
type RolFabricado = (typeof ROLES_A_FABRICAR)[number];

/**
 * Las 26 rutas del agujero + `PATCH /financiaciones/cuotas/:cuotaId/pagar`, que el
 * briefing marcaba como "verificar" y que ya estaba gateada (la incluimos igual: si
 * alguien le saca el authorize, este test lo caza).
 *
 * `POST /financiaciones/simular` NO está en la lista a propósito: es cálculo puro
 * (`FinanciacionController.simular` llama a `planDeCuotas()` y devuelve JSON, sin
 * tocar Prisma). Es POST por el tamaño del body, no porque persista nada, y por eso
 * debe quedar abierta a `lectura` — cotizar es justamente consultar.
 */
const RUTAS_MUTANTES: ReadonlyArray<readonly [Metodo, string]> = [
    // ── venta.routes.ts (11) ─────────────────────────────────────────────────
    ['post', '/api/ventas'],
    ['patch', `/api/ventas/${ID_FANTASMA}`],
    ['patch', `/api/ventas/${ID_FANTASMA}/estado-entrega`],
    ['delete', `/api/ventas/${ID_FANTASMA}`],
    ['post', `/api/ventas/${ID_FANTASMA}/pagos`],
    ['delete', `/api/ventas/${ID_FANTASMA}/pagos/${ID_FANTASMA}`],
    ['post', `/api/ventas/${ID_FANTASMA}/extras`],
    ['delete', `/api/ventas/${ID_FANTASMA}/extras/${ID_FANTASMA}`],
    ['post', `/api/ventas/${ID_FANTASMA}/canjes`],
    ['delete', `/api/ventas/${ID_FANTASMA}/canjes/${ID_FANTASMA}`],
    ['post', `/api/ventas/${ID_FANTASMA}/factura`],

    // ── reserva.routes.ts (3) ────────────────────────────────────────────────
    ['post', '/api/reservas'],
    ['patch', `/api/reservas/${ID_FANTASMA}`],
    ['delete', `/api/reservas/${ID_FANTASMA}`],

    // ── financiacion.routes.ts (5) ───────────────────────────────────────────
    ['post', '/api/financiaciones'],
    ['post', `/api/financiaciones/${ID_FANTASMA}/refinanciar`],
    ['patch', `/api/financiaciones/${ID_FANTASMA}`],
    ['delete', `/api/financiaciones/${ID_FANTASMA}`],
    ['patch', `/api/financiaciones/cuotas/${ID_FANTASMA}/pagar`],

    // ── ingreso-vehiculo.routes.ts (2) ───────────────────────────────────────
    ['post', '/api/vehiculo-ingresos'],
    ['delete', `/api/vehiculo-ingresos/${ID_FANTASMA}`],

    // ── vehiculo-movimiento.routes.ts (2) ────────────────────────────────────
    ['post', '/api/vehiculo-movimientos'],
    ['patch', `/api/vehiculo-movimientos/${ID_FANTASMA}/retorno`],

    // ── vehiculo-archivo.routes.ts (4) ───────────────────────────────────────
    ['post', '/api/vehiculo-archivos'],
    // OJO: `/upload` lleva multer (`uploadSingle`) delante del controller. Que este
    // caso dé 403 y no 400 prueba que `authorize` quedó ANTES de multer — si se
    // colara después, `lectura` conseguiría que el server le parsee un upload.
    ['post', '/api/vehiculo-archivos/upload'],
    ['patch', `/api/vehiculo-archivos/${ID_FANTASMA}/principal`],
    ['delete', `/api/vehiculo-archivos/${ID_FANTASMA}`],
] as const;

/** Dispara la request con el token dado. Body vacío: el gate corta antes de validarlo. */
async function pegar(metodo: Metodo, ruta: string, token: string, body: unknown = {}) {
    if (metodo === 'delete') return api.delete(ruta, authHeaders(token));
    if (metodo === 'patch') return api.patch(ruta, body, authHeaders(token));
    return api.post(ruta, body, authHeaders(token));
}

/**
 * Statuses que prueban que el gate DEJÓ PASAR: la request llegó al controller y
 * murió (o vivió) por razones de datos, no de permiso. Se usa en los casos
 * positivos de la matriz. Deliberadamente NO aceptamos 401 (sesión rota) ni 403.
 */
const PASO_EL_GATE = [200, 201, 204, 400, 404, 409, 422];

describe('Permisos de mutación — el gate de rol por HTTP', () => {
    let adminToken: string;
    /** token + id de cada rol fabricado, indexado por nombre de rol. */
    const sesiones: Record<string, { id: number; token: string }> = {};

    beforeAll(async () => {
        const ad = await loginAsAdmin();
        adminToken = ad.token;

        // Los ids de rol son autoincrementales y NO deterministas (el seed hace
        // upsert por nombre), así que hay que resolverlos por API. `GET /api/roles`
        // no pide rol; con el token de admin devuelve los 5 no-super.
        const rolesRes = await api.get('/api/roles', authHeaders(adminToken));
        expect(rolesRes.status).toBe(200);
        const idDeRol = (nombre: string): number => {
            const fila = (rolesRes.data as Array<{ id: number; nombre: string }>).find(r => r.nombre === nombre);
            if (!fila) {
                throw new Error(`El seed no tiene el rol '${nombre}'. Revisá prisma/seed-ci.ts.`);
            }
            return fila.id;
        };

        // `seed-ci.ts` sólo crea superadmin@demo.com y admin@demo.com: no hay usuario
        // lectura, vendedor, cobrador ni postventa. Los fabricamos acá.
        //
        // Emails con `unique()` en vez de fijos: `Usuario.email` es @unique GLOBAL y el
        // DELETE de usuarios es SOFT — un email fijo sobreviviría al cleanup y la
        // segunda corrida chocaría con 400 CONFLICT. Con sufijo único, la suite es
        // idempotente: se puede correr dos veces seguidas sin limpiar nada a mano.
        for (const rol of ROLES_A_FABRICAR) {
            const email = `${unique(`perm-${rol}`)}@demo.com`;
            // El admin crea en SU propio tenant (el controller inyecta su
            // concesionariaId; el body no la trae) y `assertRolesAsignables` le
            // permite asignar los 5 roles no-super.
            const res = await api.post(
                '/api/usuarios',
                { nombre: unique(rol), email, password: PASSWORD, roleIds: [idDeRol(rol)] },
                authHeaders(adminToken)
            );
            expect(res.status).toBe(201);

            const sesion = await login(email, PASSWORD);
            // Si el rol no viajó en el token, todos los 403 de abajo serían falsos
            // positivos (un usuario SIN rol también recibe 403). Afirmarlo acá es lo
            // que le da valor a la suite entera.
            expect(sesion.user.roles).toContain(rol);
            sesiones[rol] = { id: res.data.id, token: sesion.token };
        }
    });

    afterAll(async () => {
        for (const rol of ROLES_A_FABRICAR) {
            if (sesiones[rol]) {
                await tryDelete(`/api/usuarios/${sesiones[rol].id}`, adminToken);
            }
        }
    });

    const token = (rol: RolFabricado) => sesiones[rol].token;

    // ─────────────────────────────────────────────────────────────────────────
    // EL CORAZÓN: `lectura` no puede mutar NADA.
    // ─────────────────────────────────────────────────────────────────────────
    describe('el perfil `lectura` recibe 403 en toda ruta que muta', () => {
        for (const [metodo, ruta] of RUTAS_MUTANTES) {
            test(`${metodo.toUpperCase()} ${ruta.replace(new RegExp(String(ID_FANTASMA), 'g'), ':id')}`, async () => {
                const res = await pegar(metodo, ruta, token('lectura'));

                // 403 EXACTO. Un 201/200 sería el agujero abierto de par en par; un
                // 400 sería el agujero disimulado (pasó el gate, lo frenó el schema);
                // un 404 sería el agujero disimulado por un id que no existe.
                expect(res.status).toBe(403);
                expect(res.data?.error).toBe('FORBIDDEN');
            });
        }
    });

    // ─────────────────────────────────────────────────────────────────────────
    // LOS LÍMITES DE LA MATRIZ QUE IMPORTAN AL NEGOCIO.
    // El principio: quien HACE el trabajo puede registrarlo; ANULAR es del admin,
    // porque borrar una venta o una seña es la operación con la que se tapa un desvío.
    // ─────────────────────────────────────────────────────────────────────────
    describe('límites de la matriz (quién NO puede)', () => {
        test('vendedor NO puede anular una venta (DELETE /ventas/:id)', async () => {
            const res = await pegar('delete', `/api/ventas/${ID_FANTASMA}`, token('vendedor'));
            expect(res.status).toBe(403);
        });

        test('vendedor NO puede anular una reserva (DELETE /reservas/:id)', async () => {
            // Anular una seña devuelve plata y libera la unidad: es del administrador.
            const res = await pegar('delete', `/api/reservas/${ID_FANTASMA}`, token('vendedor'));
            expect(res.status).toBe(403);
        });

        test('cobrador NO puede cerrar una venta (POST /ventas)', async () => {
            // El cobrador cobra (POST /ventas/:id/pagos), no vende.
            const res = await pegar('post', '/api/ventas', token('cobrador'));
            expect(res.status).toBe(403);
        });

        test('postventa NO puede tomar una reserva (POST /reservas)', async () => {
            // Postventa atiende casos de posventa; señar una unidad es del vendedor.
            const res = await pegar('post', '/api/reservas', token('postventa'));
            expect(res.status).toBe(403);
        });

        test('vendedor NO puede sacar el usado tomado en canje (DELETE /ventas/:id/canjes/:canjeId)', async () => {
            // El canje es el renglón que BAJA el total de la venta: un usado tomado a
            // $8.000.000 se descuenta de lo que el cliente debe. Como updateVentaSchema
            // no acepta `precioVenta`, borrar el canje y recargarlo con otro valor era
            // el único camino que le quedaba al vendedor para mover el neto de una
            // operación cerrada. El DELETE de extras SÍ sigue abierto (ver la ruta): un
            // extra de $30.000 mal tipeado no es lo mismo que un auto.
            const res = await pegar('delete', `/api/ventas/${ID_FANTASMA}/canjes/${ID_FANTASMA}`, token('vendedor'));
            expect(res.status).toBe(403);
        });

        test('postventa NO puede anular una venta por estado-entrega (PATCH con estadoEntrega=cancelada)', async () => {
            // `cancelada` es terminal (stateMachine no le da salida) y NO revierte el
            // stock: la unidad queda 'vendido' y la venta sigue sumando en los reportes.
            // El authorize de la ruta no puede frenarlo —evalúa antes de ver el body y
            // postventa necesita `entregada`—, así que el destino se acota por rol en
            // el controller. Este test prueba justo esa costura.
            const res = await pegar('patch', `/api/ventas/${ID_FANTASMA}/estado-entrega`, token('postventa'), {
                estadoEntrega: 'cancelada',
            });
            expect(res.status).toBe(403);
        });

        test('vendedor NO puede anular una venta por estado-entrega (PATCH con estadoEntrega=cancelada)', async () => {
            const res = await pegar('patch', `/api/ventas/${ID_FANTASMA}/estado-entrega`, token('vendedor'), {
                estadoEntrega: 'cancelada',
            });
            expect(res.status).toBe(403);
        });

        test('admin NO puede escribir el catálogo de planes del SaaS (POST /billing/planes)', async () => {
            // `Plan` es un modelo GLOBAL: no lleva concesionariaId, la extensión de
            // Prisma no lo filtra por tenant y la tabla no tiene policy de RLS. Un
            // update pega en la fila que comparten TODAS las concesionarias. El montaje
            // de /billing decía authorize('admin') mientras el @openapi de esta ruta
            // decía "super_admin only": el guard era más flojo que el contrato.
            const res = await pegar('post', '/api/billing/planes', adminToken, { nombre: 'x', precio: 1 });
            expect(res.status).toBe(403);
        });

        test('lectura NO lee la bitácora de seguimiento de un cliente (GET /cliente-seguimientos/cliente/:id)', async () => {
            // No es un dato de ficha: es la nota libre del vendedor sobre la negociación
            // ("regatea", "está viendo en la competencia"). El POST/PATCH/DELETE ya eran
            // admin+vendedor; el GET había quedado abierto y `lectura` —el contador
            // externo, el socio— la leía entera desde la pestaña Seguimiento.
            const res = await api.get(`/api/cliente-seguimientos/cliente/${ID_FANTASMA}`, authHeaders(token('lectura')));
            expect(res.status).toBe(403);
        });
    });

    describe('límites de la matriz (quién SÍ puede)', () => {
        // En los casos positivos NO afirmamos 201: con body vacío e ids fantasma el
        // controller va a rebotar por datos. Lo que se prueba es que el rechazo NO
        // es de permiso. Que la ruta EXISTE ya lo probó el bloque de `lectura`
        // (si no existiera, ahí habría dado 404 en vez de 403).

        test('vendedor SÍ puede tomar una reserva (POST /reservas)', async () => {
            const res = await pegar('post', '/api/reservas', token('vendedor'));
            expect(res.status).not.toBe(403);
            expect(PASO_EL_GATE).toContain(res.status);
        });

        test('cobrador SÍ puede cobrar una cuota (PATCH /financiaciones/cuotas/:id/pagar)', async () => {
            const res = await pegar('patch', `/api/financiaciones/cuotas/${ID_FANTASMA}/pagar`, token('cobrador'));
            expect(res.status).not.toBe(403);
            expect(PASO_EL_GATE).toContain(res.status);
        });

        test('postventa SÍ puede borrar un archivo del vehículo (DELETE /vehiculo-archivos/:id)', async () => {
            // Postventa es el único rol con permiso de SUBIR (POST / y POST /upload) —
            // documentar con fotos la unidad que pasó por el taller es su trabajo, y sus
            // propios routers no tienen upload. Quedaba pudiendo crear y no pudiendo
            // corregir: subía la foto movida y tenía que pedirle a un vendedor que se la
            // borre. Marcar la PORTADA sigue siendo admin+vendedor (decisión de venta).
            const res = await pegar('delete', `/api/vehiculo-archivos/${ID_FANTASMA}`, token('postventa'));
            expect(res.status).not.toBe(403);
            expect(PASO_EL_GATE).toContain(res.status);
        });

        test('postventa SÍ puede avanzar la entrega de una venta (PATCH estado-entrega = entregada)', async () => {
            // La contracara del test de `cancelada`: acotar el destino por rol no puede
            // haberle roto el flujo por el que se le dio el permiso.
            const res = await pegar('patch', `/api/ventas/${ID_FANTASMA}/estado-entrega`, token('postventa'), {
                estadoEntrega: 'entregada',
            });
            expect(res.status).not.toBe(403);
            expect(PASO_EL_GATE).toContain(res.status);
        });

        // DECISIÓN TOMADA sobre `POST /financiaciones/:id/refinanciar`: queda en
        // admin+vendedor+cobrador. Antes de la tanda de endurecimiento era
        // admin+vendedor (o sea que a `cobrador` se lo ENSANCHÓ, no se lo cerró: es la
        // única línea de esa tanda donde eso pasó). Se sostiene porque PRODUCT.md le
        // asigna al cobrador "la financiación propia, las cuotas y las cobranzas", el
        // monto no lo declara él (sale del saldo impago real) y el mismo rol ya podía
        // dar cuotas por pagadas, que es la palanca más peligrosa de las dos.
        test('cobrador SÍ puede refinanciar un saldo (POST /financiaciones/:id/refinanciar)', async () => {
            const res = await pegar('post', `/api/financiaciones/${ID_FANTASMA}/refinanciar`, token('cobrador'));
            expect(res.status).not.toBe(403);
            expect(PASO_EL_GATE).toContain(res.status);
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // CAMPOS SENSIBLES DENTRO DE UN BODY PERMITIDO.
    //
    // Los bloques de arriba prueban el gate de RUTA: quién puede pegarle a qué
    // endpoint. Este prueba el hueco que un gate de ruta NO puede tapar: la ruta
    // está bien abierta al vendedor (editar el teléfono de un cliente en el
    // mostrador es su trabajo) y el agujero está en UN CAMPO del body.
    //
    // `vendedorAsignadoId` es la llave de la cartera: quien lo escribe decide de
    // quién es el cliente, y con eso decide quién lo ve en el listado, en el
    // export CSV (DNI, teléfono, email, dirección), en el buscador global y en el
    // historial completo de atenciones. "La reasignación la autoriza un
    // supervisor, NUNCA el vendedor" es una decisión del dueño, y hasta acá vivía
    // sólo en `PATCH /atenciones/:id/reasignar-cliente`; `PATCH /clientes/:id` la
    // salteaba entera.
    // ─────────────────────────────────────────────────────────────────────────
    describe('campos sensibles: la reasignación de cartera es del supervisor', () => {
        let clienteId: number;

        beforeAll(async () => {
            const res = await api.post(
                '/api/clientes',
                { nombre: unique('cartera'), telefono: `261${Date.now() % 10000000}` },
                authHeaders(adminToken),
            );
            expect(res.status).toBe(201);
            clienteId = res.data.id;
        });

        afterAll(async () => {
            if (clienteId) await tryDelete(`/api/clientes/${clienteId}`, adminToken);
        });

        test('vendedor NO se puede autoasignar un cliente (PATCH /clientes/:id)', async () => {
            const res = await api.patch(
                `/api/clientes/${clienteId}`,
                { vendedorAsignadoId: sesiones.vendedor.id },
                authHeaders(token('vendedor')),
            );
            // 403 EXACTO: un 200 sería la cartera abierta de par en par. Se comprueba
            // además que NO quedó escrito, porque un 403 devuelto después de haber
            // persistido sería el mismo agujero con mejor cara.
            expect(res.status).toBe(403);
            const ficha = await api.get(`/api/clientes/${clienteId}`, authHeaders(adminToken));
            expect(ficha.data.vendedorAsignadoId ?? null).toBeNull();
        });

        test('vendedor NO puede desasignar un cliente tampoco', async () => {
            // Desasignar es el otro lado de la misma moneda: deja al cliente sin dueño
            // y por lo tanto visible para todo el salón (rama 2 del filtro de cartera).
            await api.patch(
                `/api/clientes/${clienteId}`,
                { vendedorAsignadoId: sesiones.vendedor.id },
                authHeaders(adminToken),
            );
            const res = await api.patch(
                `/api/clientes/${clienteId}`,
                { vendedorAsignadoId: null },
                authHeaders(token('vendedor')),
            );
            expect(res.status).toBe(403);
        });

        test('el vendedor SÍ sigue pudiendo editar el resto de la ficha', async () => {
            // La contracara: el candado es sobre UN campo, no sobre la ruta. Si esto
            // se rompe, el vendedor no puede corregir un teléfono en el mostrador.
            const res = await api.patch(
                `/api/clientes/${clienteId}`,
                { telefono: '2615550000' },
                authHeaders(token('vendedor')),
            );
            expect(res.status).toBe(200);
            expect(res.data.telefono).toBe('2615550000');
        });

        test('reenviar el MISMO vendedor asignado no es una reasignación', async () => {
            // El formulario manda el campo siempre, con el valor que ya estaba. Si eso
            // contara como reasignación, el vendedor no podría guardar ningún cambio.
            const actual = await api.get(`/api/clientes/${clienteId}`, authHeaders(adminToken));
            const res = await api.patch(
                `/api/clientes/${clienteId}`,
                { vendedorAsignadoId: actual.data.vendedorAsignadoId, direccion: 'San Martín 100' },
                authHeaders(token('vendedor')),
            );
            expect(res.status).toBe(200);
        });

        test('el admin SÍ reasigna, y la FECHA de asignación se mueve con ella', async () => {
            // `vendedorAsignadoEn` es contra lo que se mide la retención cuando no hay
            // interacción posterior. Si no se estampa, la ficha dice "es de Pérez desde
            // el 3 de marzo" después de habérsela pasado a González, y el plazo del
            // nuevo dueño arranca corrido (o vencido).
            const antes = await api.get(`/api/clientes/${clienteId}`, authHeaders(adminToken));
            const fechaAntes = antes.data.vendedorAsignadoEn ?? null;

            const res = await api.patch(
                `/api/clientes/${clienteId}`,
                { vendedorAsignadoId: sesiones.cobrador.id },
                authHeaders(adminToken),
            );
            expect(res.status).toBe(200);

            const despues = await api.get(`/api/clientes/${clienteId}`, authHeaders(adminToken));
            expect(despues.data.vendedorAsignadoId).toBe(sesiones.cobrador.id);
            expect(despues.data.vendedorAsignadoEn).toBeTruthy();
            if (fechaAntes) {
                expect(new Date(despues.data.vendedorAsignadoEn).getTime())
                    .toBeGreaterThanOrEqual(new Date(fechaAntes).getTime());
            }
        });
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// CENTINELA — el que ataja la PRÓXIMA ruta.
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Verbos HTTP que mutan — los únicos que el centinela escanea. GET y HEAD no entran:
 * leer no rompe nada, y el aislamiento de lectura lo da la RLS por tenant, no el rol.
 * `put` se incluye aunque hoy no se use en ningún router: es la forma en que el
 * agujero volvería sin que nadie lo note.
 */
const METODOS_ESCANEADOS = ['post', 'put', 'patch', 'delete'] as const;

const DIR_RUTAS = path.resolve(__dirname, '../../src/interface/routes');
/** Los dos archivos donde se montan routers y donde puede vivir un guard de montaje. */
const ARCHIVOS_DE_MONTAJE = [
    path.resolve(__dirname, '../../src/routes/index.ts'),
    path.resolve(__dirname, '../../src/app.ts'),
];

const RE_REGISTRO_RUTA = new RegExp(`^\\s*router\\.(${METODOS_ESCANEADOS.join('|')})\\(\\s*(['"\`])([^'"\`]*)\\2(.*)$`);
/**
 * Cualquier `algo.post(`, `algo.delete(`… al principio de la línea. Es MÁS ANCHO que
 * RE_REGISTRO_RUTA a propósito: todo lo que caiga acá y no caiga allá es una forma de
 * registrar que el parser no entiende, y tiene que gritar en vez de pasar de largo.
 * Cubre sub-routers con otro nombre de variable (`publico.post(...)`), paths que no
 * son literales (`router.post(RUTAS.crear, h)`) y arrays de paths.
 */
const RE_REGISTRO_SOSPECHOSO = new RegExp(`^\\s*[A-Za-z_$][\\w$]*\\.(${METODOS_ESCANEADOS.join('|')})\\(`);
const RE_GUARD_DE_ROUTER = /^\s*router\.use\(\s*authorize\(/;
const RE_IMPORT_DE_RUTAS = /^\s*import\s+(\w+)\s+from\s+'[^']*interface\/routes\/([\w.-]+)'/;
const RE_MONTAJE = /\.use\(\s*'[^']+'\s*,\s*(.+)\)\s*;/;

/**
 * `authorize` como ARGUMENTO REAL del registro, no como palabra suelta.
 *
 * El chequeo anterior era `resto.includes('authorize(')` sobre todo lo que sigue al
 * path — comentario de línea incluido. O sea que
 *   `router.delete('/:id', Ctrl.x); // TODO: authorize('admin')`
 * contaba como GATEADA: la anotación con la que un dev se recuerda que le falta el
 * candado era justo la que apagaba el candado. Ahora el comentario se recorta antes
 * (ver `recortarComentario`) y se exige la coma que sólo aparece si es un middleware
 * de verdad.
 */
const RE_ARGUMENTO_AUTHORIZE = /,\s*authorize\(/;

/**
 * Recorta `//` y `/*` del final de la línea, respetando strings.
 *
 * Necesario porque el path puede tener barras (`'/vehiculo-archivos/upload'`) y
 * porque un comentario puede mencionar `authorize(` sin que haya ninguno. No es un
 * parser de TS: alcanza con no confundir una barra dentro de comillas con el inicio
 * de un comentario, que es el único caso que se da en estos archivos.
 */
function recortarComentario(resto: string): string {
    let comilla: string | null = null;
    for (let i = 0; i < resto.length; i++) {
        const c = resto[i];
        if (comilla) {
            if (c === '\\') { i++; continue; }
            if (c === comilla) comilla = null;
            continue;
        }
        if (c === "'" || c === '"' || c === '`') { comilla = c; continue; }
        if (c === '/' && (resto[i + 1] === '/' || resto[i + 1] === '*')) return resto.slice(0, i);
    }
    return resto;
}

interface Excepcion {
    archivo: string;
    /** Sin `metodo`/`ruta`, la excepción cubre el archivo entero. */
    metodo?: string;
    ruta?: string;
    motivo: string;
}

/**
 * Excepciones LEGÍTIMAS: rutas que mutan y NO llevan `authorize`, con el motivo al
 * lado. Todo lo que no esté acá y no tenga guard explícito es un hallazgo.
 *
 * Las excepciones POR ARCHIVO son las peligrosas: cubren también la ruta que todavía
 * no se escribió, con un motivo que se redactó para otra cosa. Sólo se usan cuando el
 * motivo vale para el archivo entero POR CONSTRUCCIÓN (auth es público antes de
 * `authenticate`; debug no existe en producción). Cuando el motivo es distinto para
 * cada ruta —como en webhooks— van entradas separadas con `metodo` + `ruta`.
 */
const EXCEPCIONES: readonly Excepcion[] = [
    {
        archivo: 'auth.routes.ts',
        motivo:
            'Router público entero (login, refresh, logout, forgot/reset-password). Se monta ANTES ' +
            'de `authenticate` (src/routes/index.ts). No hay rol que exigir: el usuario todavía no ' +
            'tiene sesión. El abuso lo frena `loginLimiter`, no un rol.',
    },
    {
        archivo: 'webhook.routes.ts',
        metodo: 'post',
        ruta: '/meta/:integracionId',
        motivo:
            'Webhook entrante de Meta. Se monta fuera del router con JWT (src/app.ts: ' +
            'app.use("/api/webhooks", ...)) porque el que llama es una plataforma, no un usuario. ' +
            'Se autentica por FIRMA del body: `validarFirmaMeta` compara el HMAC de ' +
            'X-Hub-Signature-256 contra el app secret y devuelve 403 si falta o no coincide.',
    },
    {
        archivo: 'webhook.routes.ts',
        metodo: 'post',
        ruta: '/mercadolibre',
        motivo:
            'Webhook entrante de Mercado Libre. OJO: acá NO hay firma — ML no firma el cuerpo, así ' +
            'que el filtro por `application_id` NO es autenticación (el client_id viaja en la URL ' +
            'de OAuth, no es un secreto): sólo descarta ruido dirigido a otra app. Lo que contiene ' +
            'el abuso es otra cosa y hay que nombrarla: `webhookLimiter` delante, que el handler ' +
            'sólo procesa recursos de cuentas YA vinculadas (buscarCuentaPorMlUserId), el tope por ' +
            'cuenta de `hayPresupuesto()`, y que `ingestarPreguntaPorResource` descarta toda ' +
            'pregunta cuyo seller_id no sea el de la cuenta. Un tercero no escribe en la bandeja ' +
            'de nadie; el daño máximo es ruido y consumo.',
    },
    {
        archivo: 'debug.routes.ts',
        motivo:
            'Sólo se monta si NODE_ENV === "development" (src/routes/index.ts). No existe en ' +
            'producción, así que no hay superficie que gatear.',
    },
    {
        archivo: 'usuario.routes.ts',
        metodo: 'patch',
        ruta: '/me',
        motivo:
            'Self-service: cada usuario edita SUS propios datos. Exigir un rol acá rompería a ' +
            '`lectura`, que legítimamente corrige su nombre. El candado es que el controller usa ' +
            'el id del token, nunca uno del path.',
    },
    {
        archivo: 'usuario.routes.ts',
        metodo: 'post',
        ruta: '/me/password',
        motivo:
            'Self-service: cambiar la PROPIA contraseña. Mismo razonamiento que PATCH /me; además ' +
            'exige la contraseña actual en el body.',
    },
    {
        archivo: 'financiacion.routes.ts',
        metodo: 'post',
        ruta: '/simular',
        motivo:
            'Cálculo puro: FinanciacionController.simular llama a la función pura planDeCuotas() y ' +
            'devuelve el plan. Cero Prisma, cero persistencia — es POST por el tamaño del body, no ' +
            'porque mute. Cotizar es consultar: tiene que quedar abierta a `lectura`.',
    },
];

/**
 * Routers gateados ENTEROS en el montaje (`router.use('/x', authorize(...), xRoutes)`).
 *
 * Tienen que estar declarados acá CON MOTIVO. Un guard de montaje exime al archivo
 * completo, así que si se dedujera en silencio bastaría con montar un router con
 * `authorize('admin')` para que ninguna de sus rutas volviera a mirarse — y ahí es
 * donde estuvo el problema de `/billing`: el montaje decía 'admin' mientras tres de
 * sus rutas documentaban en su propio @openapi "super_admin only", y el centinela no
 * podía verlo porque eximía el archivo entero. La regla que queda: un guard de
 * montaje sólo vale cuando TODAS las rutas del archivo comparten el mismo rol.
 */
const GATEADOS_EN_MONTAJE_ESPERADOS: Readonly<Record<string, string>> = {
    'audit-log.routes.ts':
        'authorize("admin") en src/routes/index.ts. El archivo es de SÓLO LECTURA (3 GET: listado, ' +
        'export CSV, detalle) y las tres tienen la misma sensibilidad: el log expone IP, user-agent ' +
        'y el detalle de cada operación de todos los usuarios del tenant. Un solo rol para todo el ' +
        'archivo es exactamente el caso en que un guard de montaje es correcto.',
};

describe('Centinela: ninguna ruta que muta puede quedar sin authorize', () => {
    /** archivo de rutas → cómo quedó gateado el router entero (o null). */
    function guardsDeMontaje(): Map<string, string> {
        const gateados = new Map<string, string>();
        for (const archivoMontaje of ARCHIVOS_DE_MONTAJE) {
            const lineas = fs.readFileSync(archivoMontaje, 'utf8').split(/\r?\n/);

            // varName → archivo, leyendo los imports (`import ventaRoutes from
            // '../interface/routes/venta.routes'`).
            const varAArchivo = new Map<string, string>();
            for (const linea of lineas) {
                const m = RE_IMPORT_DE_RUTAS.exec(linea);
                if (m) varAArchivo.set(m[1], m[2].endsWith('.ts') ? m[2] : `${m[2]}.ts`);
            }

            // Montajes con authorize en el medio: `router.use('/billing',
            // authorize('admin'), billingRoutes)`.
            for (const linea of lineas) {
                const m = RE_MONTAJE.exec(linea);
                if (!m || !m[1].includes('authorize(')) continue;
                for (const [nombreVar, archivo] of varAArchivo) {
                    if (new RegExp(`\\b${nombreVar}\\b`).test(m[1])) {
                        gateados.set(archivo, `${path.basename(archivoMontaje)}: ${linea.trim()}`);
                    }
                }
            }
        }
        return gateados;
    }

    /** Todos los archivos de rutas que index.ts o app.ts importan, sin importar cómo se llamen. */
    function archivosImportados(): Set<string> {
        const importados = new Set<string>();
        for (const archivoMontaje of ARCHIVOS_DE_MONTAJE) {
            for (const linea of fs.readFileSync(archivoMontaje, 'utf8').split(/\r?\n/)) {
                const m = RE_IMPORT_DE_RUTAS.exec(linea);
                if (m) importados.add(m[2].endsWith('.ts') ? m[2] : `${m[2]}.ts`);
            }
        }
        return importados;
    }

    function esExcepcion(archivo: string, metodo: string, ruta: string): Excepcion | undefined {
        return EXCEPCIONES.find(
            e =>
                e.archivo === archivo &&
                (e.metodo === undefined || e.metodo === metodo) &&
                (e.ruta === undefined || e.ruta === ruta)
        );
    }

    /**
     * `*.ts` y no `*.routes.ts`. El filtro por sufijo era un agujero silencioso: un
     * `src/interface/routes/factura.ts` importado desde index.ts no se abría siquiera,
     * y como los 41 archivos de hoy sí terminan en `.routes.ts`, el piso del
     * auto-chequeo seguía en verde. El centinela existe para la ruta que todavía no
     * se escribió, y esa ruta la escribe alguien que no leyó esta convención.
     */
    const archivosDeRutas = fs.readdirSync(DIR_RUTAS).filter(f => f.endsWith('.ts') && !f.endsWith('.d.ts'));
    const gateadosEnMontaje = guardsDeMontaje();

    /** Devuelve las líneas del archivo de rutas. */
    const lineasDe = (archivo: string) => fs.readFileSync(path.join(DIR_RUTAS, archivo), 'utf8').split(/\r?\n/);

    test('el centinela sabe leer los archivos de rutas (auto-chequeo)', () => {
        // Sin esto, un cambio de estilo que rompa el regex haría que el centinela
        // pase encontrando cero rutas — el peor final posible para un test como éste.
        expect(archivosDeRutas.length).toBeGreaterThan(30);

        let registros = 0;
        const formasQueNoSéLeer: string[] = [];
        for (const archivo of archivosDeRutas) {
            lineasDe(archivo).forEach((linea, i) => {
                if (RE_REGISTRO_RUTA.test(linea)) {
                    registros++;
                    return;
                }
                // Formas de registrar rutas que este parser NO entiende. Si alguien
                // las introduce, el centinela tiene que gritar en vez de mirar para
                // otro lado: una ruta que no lee es una ruta que no protege.
                if (RE_REGISTRO_SOSPECHOSO.test(linea)) {
                    formasQueNoSéLeer.push(
                        `${archivo}:${i + 1} registro que no sé leer (¿sub-router con otro nombre, ` +
                            `path que no es literal, o array de paths?): ${linea.trim()}`
                    );
                }
                if (/router\.route\(/.test(linea)) {
                    formasQueNoSéLeer.push(`${archivo}:${i + 1} router.route(...) encadenado`);
                }
                if (new RegExp(`router\\.(${METODOS_ESCANEADOS.join('|')})\\(\\s*$`).test(linea)) {
                    formasQueNoSéLeer.push(`${archivo}:${i + 1} registro partido en varias líneas`);
                }
            });
        }

        // Hoy hay ~136 registros que mutan repartidos en 41 archivos. El piso está
        // holgado a propósito: no queremos un test que falle cada vez que se borra
        // una ruta, sino uno que falle si el parser deja de parsear.
        expect(registros).toBeGreaterThan(100);
        expect(formasQueNoSéLeer).toEqual([]);
    });

    /**
     * Los dos fail-open que el centinela tuvo y que no se pueden perder en el próximo
     * refactor del regex. Son líneas SINTÉTICAS: no viven en ningún archivo, se
     * evalúan acá para afirmar que el parser las clasifica como corresponde.
     */
    test('el centinela no se deja engañar por un authorize de adorno (auto-chequeo)', () => {
        /** Reproduce la decisión del test de abajo para UNA línea suelta. */
        const estaGateada = (linea: string): boolean => {
            const m = RE_REGISTRO_RUTA.exec(linea);
            if (!m) return false;
            return RE_ARGUMENTO_AUTHORIZE.test(recortarComentario(m[4]));
        };

        // Gateadas de verdad.
        expect(estaGateada(`router.delete('/:id', authorize('admin'), Ctrl.delete);`)).toBe(true);
        expect(estaGateada(`router.post('/upload', authorize('admin', 'vendedor'), upload, Ctrl.up);`)).toBe(true);
        // Un path con barras no puede confundirse con un comentario.
        expect(estaGateada(`router.post('/a/b/c', authorize('admin'), Ctrl.x);`)).toBe(true);

        // `authorize` SÓLO en un comentario: es un hueco, no un candado. Éste es el
        // caso que el `includes('authorize(')` daba por bueno — y es exactamente la
        // forma en que un dev anota lo que le falta mientras arma el PR.
        expect(estaGateada(`router.post('/:id/reabrir', Ctrl.x); // TODO: authorize('admin')`)).toBe(false);
        expect(estaGateada(`router.delete('/:id', Ctrl.x); // authorize('admin') pendiente`)).toBe(false);
        expect(estaGateada(`router.patch('/:id', Ctrl.x); /* ver authorize(...) en el header */`)).toBe(false);
        // Sin nada: hueco de manual.
        expect(estaGateada(`router.post('/x', Ctrl.x);`)).toBe(false);

        // Formas de registrar que el parser NO entiende: tienen que caer en
        // formasQueNoSéLeer (y hacer fallar el auto-chequeo de arriba), nunca pasar
        // en silencio. Antes daban NO MATCH y no las gritaba nadie.
        const noLeibles = [
            `publico.post('/x', Ctrl.x);`,
            `ventaRouter.post('/x', Ctrl.x);`,
            `router.post(RUTAS.crear, h);`,
            `router.post(['/a', '/b'], h);`,
        ];
        for (const linea of noLeibles) {
            expect(RE_REGISTRO_SOSPECHOSO.test(linea)).toBe(true);
            expect(RE_REGISTRO_RUTA.test(linea) && RE_ARGUMENTO_AUTHORIZE.test(recortarComentario(RE_REGISTRO_RUTA.exec(linea)![4]))).toBe(false);
        }
    });

    test('todo archivo del directorio de rutas se monta desde index.ts o app.ts', () => {
        // Un archivo de rutas que nadie importa es, en el mejor caso, código muerto; y
        // en el peor, un router montado desde otro lado que este centinela no mira. El
        // dato ya estaba recolectado (RE_IMPORT_DE_RUTAS) y sólo se usaba para deducir
        // guards de montaje: cruzarlo contra el directorio cuesta tres líneas y cierra
        // la variante más probable del agujero (un `factura.ts` que nadie revisa).
        const importados = archivosImportados();
        const huérfanos = archivosDeRutas.filter(a => !importados.has(a));

        expect({ huérfanos }).toEqual({ huérfanos: [] });
    });

    test('los routers gateados enteros siguen teniendo su guard', () => {
        const contenido = (a: string) => fs.readFileSync(path.join(DIR_RUTAS, a), 'utf8');

        // Concesionaria: modelo GLOBAL, esquiva el filtro RLS de tenant. Sin este
        // guard, cualquier admin lista, crea y borra las concesionarias de todos.
        expect(contenido('concesionaria.routes.ts')).toMatch(/router\.use\(authorize\('super_admin'\)\)/);
        // Integracion: `config` guarda credenciales de canales (app secret de Meta,
        // password IMAP).
        expect(contenido('integracion.routes.ts')).toMatch(/router\.use\(authorize\('admin'\)\)/);

        // Un guard de MONTAJE exime al archivo entero, así que no puede aparecer uno
        // nuevo sin que alguien lo declare con su motivo. Este assert es el que impide
        // que montar con `authorize('admin')` se vuelva la forma barata de sacarle un
        // router de encima al centinela.
        const declarados = Object.keys(GATEADOS_EN_MONTAJE_ESPERADOS).sort();
        expect([...gateadosEnMontaje.keys()].sort()).toEqual(declarados);
    });

    /**
     * `/billing` es el caso que enseñó por qué un guard de montaje no alcanza: se
     * montaba con `authorize('admin')` mientras tres de sus rutas documentaban
     * "super_admin only" en su propio @openapi, y `Plan` es un modelo GLOBAL (sin
     * concesionariaId), así que el update pegaba en la fila compartida por todos los
     * tenants. Cualquier admin de cualquier concesionaria podía reescribir el catálogo
     * de planes del SaaS. Ahora el gating es por-ruta; esto lo afirma para que no se
     * deshaga sin querer.
     */
    test('billing: escribir el catálogo de planes es de super_admin, no de admin', () => {
        const lineas = lineasDe('billing.routes.ts');
        const rolesDe = (metodo: string, ruta: string): string | null => {
            for (const linea of lineas) {
                const m = RE_REGISTRO_RUTA.exec(linea) ?? /^\s*router\.(get)\(\s*'([^']*)'(.*)$/.exec(linea);
                if (!m) continue;
                const [mMetodo, mRuta, resto] = m.length === 5 ? [m[1], m[3], m[4]] : [m[1], m[2], m[3]];
                if (mMetodo !== metodo || mRuta !== ruta) continue;
                const arg = /authorize\(([^)]*)\)/.exec(recortarComentario(resto));
                return arg ? arg[1].replace(/['"\s]/g, '') : null;
            }
            return null;
        };

        expect(rolesDe('post', '/planes')).toBe('super_admin');
        expect(rolesDe('patch', '/planes/:id')).toBe('super_admin');
        expect(rolesDe('patch', '/concesionarias/:id/subscription')).toBe('super_admin');
        expect(rolesDe('post', '/invoices')).toBe('super_admin');
        // Las lecturas del propio tenant sí son del admin: mira su plan y sus facturas.
        expect(rolesDe('get', '/subscription')).toBe('admin');
        expect(rolesDe('get', '/invoices')).toBe('admin');
    });

    test('ninguna ruta que muta quedó sin authorize', () => {
        const huecos: string[] = [];

        for (const archivo of archivosDeRutas) {
            const lineas = lineasDe(archivo);

            // Un `router.use(authorize(...))` sólo cubre lo que se registra DESPUÉS.
            // No es un detalle: concesionaria.routes.ts declara /me/logo con su propio
            // authorize ARRIBA del guard de super_admin, y tratarlo como "cubre todo
            // el archivo" haría al centinela ciego a las rutas de la mitad de arriba.
            const idxGuard = lineas.findIndex(linea => RE_GUARD_DE_ROUTER.test(linea));
            const lineaDelGuard = idxGuard >= 0 ? idxGuard + 1 : null;

            lineas.forEach((linea, i) => {
                const m = RE_REGISTRO_RUTA.exec(linea);
                if (!m) return;

                const metodo = m[1];
                const ruta = m[3] || '/';
                // Sin el comentario de la línea: `authorize` mencionado en un `// TODO`
                // no es un candado, es el recordatorio de que falta ponerlo.
                const resto = recortarComentario(m[4]);
                const nroLinea = i + 1;

                if (RE_ARGUMENTO_AUTHORIZE.test(resto)) return;
                if (lineaDelGuard !== null && nroLinea > lineaDelGuard) return;
                if (gateadosEnMontaje.has(archivo)) return;
                if (esExcepcion(archivo, metodo, ruta)) return;

                huecos.push(`  ${archivo}:${nroLinea}  ${metodo.toUpperCase()} ${ruta}`);
            });
        }

        if (huecos.length > 0) {
            throw new Error(
                `Hay ${huecos.length} ruta(s) que MUTAN datos sin control de rol.\n` +
                    `Cualquier usuario del tenant (incluido el perfil \`lectura\`) puede ejecutarlas:\n\n` +
                    huecos.join('\n') +
                    `\n\nArreglo: agregar \`authorize('rol', ...)\` ANTES de validateBody y del controller,\n` +
                    `y sumar \`403: { $ref: '#/components/responses/Forbidden' }\` al bloque @openapi.\n` +
                    `Si la ruta NO muta de verdad (cálculo puro) o es self-service, agregala a\n` +
                    `EXCEPCIONES en este archivo CON EL MOTIVO ESCRITO — nunca sin motivo.\n` +
                    `OJO: un \`// authorize(...)\` en un comentario NO cuenta como candado.`
            );
        }
    });
});
