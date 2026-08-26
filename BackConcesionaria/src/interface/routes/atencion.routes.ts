import { Router } from 'express';
import { AtencionController } from '../controllers/AtencionController';
import { authorize } from '../middlewares/authorize.middleware';
import { validateBody } from '../middlewares/validate.middleware';
import {
    identificarClienteSchema,
    abrirAtencionSchema,
    completarClienteSchema,
    buscarUnidadesSchema,
    registrarVehiculoSchema,
    registrarPermutaSchema,
    cerrarAtencionSchema,
    reasignarClienteSchema,
} from '../validation/atencion.schema';

/**
 * ATENCIÓN PRESENCIAL — el módulo del vendedor.
 *
 * GATING, y por qué así:
 *  - TODO el router es `admin` + `vendedor`. `lectura`, `cobrador` y `postventa`
 *    no atienden clientes en el salón, y estas rutas escriben en el CRM.
 *  - UNA ruta es SÓLO `admin`: la reasignación de cartera, porque el encargo lo
 *    dice explícito ("la reasignación la autoriza un supervisor, NUNCA el
 *    vendedor").
 *  - Lo que un middleware NO puede decidir queda en el service: un vendedor puro
 *    sólo ve y opera SUS atenciones y las de sus clientes asignados (el recorte
 *    va en el `where`, no en el rol), y la reasignación vuelve a exigir admin ahí
 *    adentro para que la regla siga valiendo si la llama un job o una pantalla
 *    nueva.
 *
 * ORDEN DE REGISTRO: `/alertas` y `/cliente/:clienteId` van ANTES de `/:id`.
 * Express matchea por orden y "alertas" entraría como id.
 *
 * NINGUNA ruta de acá devuelve `precioCompra` ni `precioMinimo`: no se sanitizan
 * después, no se traen de la base (ver `UNIDAD_SELECT` en atencionService).
 */
const router = Router();

/**
 * @openapi
 * /atenciones/identificar:
 *   post:
 *     tags: [Atenciones]
 *     summary: Identificar al cliente antes de abrir la atención (dedupe + historial + aviso de asignación)
 *     description: >
 *       Corre el dedupe compartido (teléfono normalizado → DNI → email) y devuelve la ficha
 *       con su historial de visitas, las unidades ya vistas y quién lo atendió antes. NO persiste
 *       nada. Es POST y no GET a propósito: teléfono y DNI son datos personales y en un GET
 *       viajarían en la query string.
 *     responses:
 *       200: { description: Ficha del cliente (o null), historial y aviso de asignación }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.post('/identificar', authorize('admin', 'vendedor'), validateBody(identificarClienteSchema), AtencionController.identificar);

/**
 * @openapi
 * /atenciones:
 *   post:
 *     tags: [Atenciones]
 *     summary: Abrir una atención presencial (nombre y teléfono alcanzan)
 *     description: >
 *       Crea o recupera el cliente por el camino común de todos los canales (no se duplica al
 *       cliente que ya consultó por redes) y abre la visita. Si el cliente está asignado a otro
 *       vendedor y la asignación sigue vigente, responde 409 con el aviso y NO escribe nada:
 *       para abrir igual hay que reenviar con `confirmaAtenderAjeno: true`, y la atención registra
 *       quién lo atendió realmente.
 *     responses:
 *       201: { description: Atención abierta, con la ficha del cliente y su historial }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       409: { description: El cliente está asignado a otro vendedor (CLIENTE_ASIGNADO_A_OTRO_VENDEDOR) }
 */
router.post('/', authorize('admin', 'vendedor'), validateBody(abrirAtencionSchema), AtencionController.abrir);

// EL CIERRE DE FIN DE DÍA NO TIENE RUTA, a propósito. Lo hace el worker
// `infrastructure/atencion/cierreDiarioWorker` (arranca en server.ts) a la hora de
// corte configurada por env, y es CROSS-TENANT: un endpoint HTTP le daría al admin
// de una concesionaria la posibilidad de cerrar atenciones de otra. Lo que el
// vendedor sí necesita —"cuántas dejé sin cerrar"— es `GET /atenciones/alertas`.

/**
 * @openapi
 * /atenciones/alertas:
 *   get:
 *     tags: [Atenciones]
 *     summary: Atenciones sin cerrar del vendedor (y las que ya cerró el sistema)
 *     responses:
 *       200: { description: Cantidad de abiertas, cuántas cerró el barrido y el detalle }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.get('/alertas', authorize('admin', 'vendedor'), AtencionController.alertas);

/**
 * @openapi
 * /atenciones/cliente/{clienteId}:
 *   get:
 *     tags: [Atenciones]
 *     summary: Historial de atenciones de un cliente (visitas, unidades ya vistas, quién lo atendió)
 *     parameters:
 *       - { name: clienteId, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Ficha e historial. Para un vendedor puro que no es el asignado, sólo el resumen }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get('/cliente/:clienteId', authorize('admin', 'vendedor'), AtencionController.historialCliente);

/**
 * @openapi
 * /atenciones:
 *   get:
 *     tags: [Atenciones]
 *     summary: Listado de atenciones (paginado)
 *     description: Un vendedor puro ve SÓLO sus atenciones y las de sus clientes asignados.
 *     parameters:
 *       - { in: query, name: estado, schema: { type: string, enum: [abierta, cerrada] } }
 *       - { in: query, name: clienteId, schema: { type: integer } }
 *       - { in: query, name: vendedorId, schema: { type: integer } }
 *       - { in: query, name: desde, schema: { type: string, format: date } }
 *       - { in: query, name: hasta, schema: { type: string, format: date } }
 *       - { in: query, name: page, schema: { type: integer } }
 *       - { in: query, name: limit, schema: { type: integer } }
 *     responses:
 *       200: { description: Listado paginado de atenciones }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.get('/', authorize('admin', 'vendedor'), AtencionController.listar);

/**
 * @openapi
 * /atenciones/{id}:
 *   get:
 *     tags: [Atenciones]
 *     summary: Detalle de una atención (unidades mostradas, permuta y seguimientos)
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Atención con sus unidades, tasaciones y seguimientos }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get('/:id', authorize('admin', 'vendedor'), AtencionController.detalle);

/**
 * @openapi
 * /atenciones/{id}/cliente:
 *   patch:
 *     tags: [Atenciones]
 *     summary: Completar los datos del cliente durante la visita (enriquecimiento progresivo)
 *     description: >
 *       DNI, email, domicilio y consentimiento. Ley 25.326: sin consentimiento del titular NO se
 *       guardan datos de contacto nuevos (409 CONSENTIMIENTO_REQUERIDO). Este es el punto de
 *       integración si algún día se valida el DNI contra RENAPER/SID.
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Cliente actualizado }
 *       409: { description: Falta el consentimiento de contacto (CONSENTIMIENTO_REQUERIDO) }
 */
router.patch('/:id/cliente', authorize('admin', 'vendedor'), validateBody(completarClienteSchema), AtencionController.completarCliente);

/**
 * @openapi
 * /atenciones/{id}/buscar:
 *   post:
 *     tags: [Atenciones]
 *     summary: Relevamiento y búsqueda de unidades (por presupuesto, por modelo o por unidad puntual)
 *     description: >
 *       Devuelve el resultado más EXACTAMENTE 3 alternativas (o menos, con aviso explícito), cada
 *       una con el motivo por el que fue sugerida. Sólo unidades disponibles. Si hay permuta o
 *       anticipo, el presupuesto real se recalcula como (valor de permuta + anticipo) y ESE manda
 *       el filtro. El relevamiento queda guardado en la atención.
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Resultado, alternativas con motivo y el relevamiento aplicado }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       409: { description: La atención ya está cerrada (ATENCION_CERRADA) }
 */
router.post('/:id/buscar', authorize('admin', 'vendedor'), validateBody(buscarUnidadesSchema), AtencionController.buscar);

/**
 * @openapi
 * /atenciones/{id}/vehiculos:
 *   post:
 *     tags: [Atenciones]
 *     summary: Registrar una unidad mostrada en esta visita
 *     description: >
 *       Guarda si fue buscada por el cliente o sugerida por el sistema, qué se hizo con ella
 *       (vista, test drive, cotizada, reservada), el nivel de interés y el motivo que mostró el
 *       sistema. Las acciones de interés real (test_drive, cotizada, reservada) exigen DNI, email,
 *       domicilio y consentimiento del cliente.
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       201: { description: Unidad registrada en la atención }
 *       409: { description: Faltan datos del cliente o el consentimiento (DATOS_CLIENTE_REQUERIDOS / CONSENTIMIENTO_REQUERIDO) }
 */
router.post('/:id/vehiculos', authorize('admin', 'vendedor'), validateBody(registrarVehiculoSchema), AtencionController.registrarVehiculo);

/**
 * @openapi
 * /atenciones/{id}/permuta:
 *   post:
 *     tags: [Atenciones]
 *     summary: Registrar la permuta de la visita (se guarda como Tasación vinculada a la atención)
 *     description: >
 *       Configurable por concesionaria: donde `tasacionSoloTasador` está activo, el vendedor carga
 *       el usado pero no le pone valor (queda `sin_tasar`) y el tasador la completa. Rechazar una
 *       permuta es decisión de la casa (admin).
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       201: { description: Permuta registrada o actualizada }
 *       403: { description: En esta concesionaria sólo el tasador pone el valor (TASACION_SOLO_TASADOR) }
 *       409: { description: Faltan datos del cliente o el consentimiento }
 */
router.post('/:id/permuta', authorize('admin', 'vendedor'), validateBody(registrarPermutaSchema), AtencionController.registrarPermuta);

/**
 * @openapi
 * /atenciones/{id}/cierre:
 *   patch:
 *     tags: [Atenciones]
 *     summary: Cerrar la atención (exige resultado; si no es definitivo, exige próximo contacto)
 *     description: >
 *       Ninguna atención queda abierta sin resultado. Si el resultado no es definitivo
 *       (cotizacion, test_drive, permuta_a_tasar, en_analisis, se_retiro) hace falta la fecha y el
 *       medio del próximo contacto: se crea un ClienteSeguimiento vinculado a la atención, que cae
 *       solo en la agenda de seguimientos y en la campanita. Sin eso, 409.
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Atención cerrada, con el seguimiento y los enlaces a reserva/presupuesto }
 *       409: { description: RESULTADO_REQUERIDO, PROXIMO_CONTACTO_REQUERIDO o ATENCION_CERRADA }
 */
router.patch('/:id/cierre', authorize('admin', 'vendedor'), validateBody(cerrarAtencionSchema), AtencionController.cerrar);

/**
 * @openapi
 * /atenciones/{id}/reasignar-cliente:
 *   patch:
 *     tags: [Atenciones]
 *     summary: Reasignar el cliente de la atención a otro vendedor (solo admin)
 *     description: >
 *       La reasignación la autoriza un supervisor, NUNCA el vendedor. Además del `authorize`, el
 *       service vuelve a exigir rol admin: es una regla del negocio, no una decisión de ruteo.
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Cliente reasignado }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.patch('/:id/reasignar-cliente', authorize('admin'), validateBody(reasignarClienteSchema), AtencionController.reasignar);

export default router;
