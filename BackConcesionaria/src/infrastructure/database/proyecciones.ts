/**
 * Proyecciones compartidas para los `include` de Prisma.
 *
 * POR QUÉ EXISTE ESTE ARCHIVO: `include: { vehiculo: true }` devuelve la fila
 * ENTERA de Vehiculo, y Vehiculo es un modelo ancho — lleva `precioCompra`,
 * `fechaCompra`, `proveedorCompraId` y `formaPagoCompra`. Como los controllers
 * hacen `res.json(result)` sin transformar, ese `true` publicaba el costo de cada
 * unidad en el listado de ventas, reservas, ingresos y movimientos: cualquier
 * usuario autenticado (el perfil `lectura` incluido) restaba `precioVenta -
 * precioCompra` y reconstruía el margen que `/reportes/rentabilidad` reserva a
 * admin. El candado del reporte no protege nada si la materia prima viaja abierta.
 *
 * El proyecto ya trataba ese dato como sensible en otros lados —
 * PrismaVehiculoRepository.mapToEntity no lo expone, el CSV de vehículos pide
 * admin/vendedor, PrismaSolicitudFinanciacionRepository usa `select` con este
 * mismo argumento escrito — pero el criterio estaba repartido en comentarios en
 * vez de en una constante. Ahora está acá, en un solo lugar.
 *
 * REGLA: en cualquier `include` de un vehículo anidado, usar esto y no `true`.
 * Si una pantalla necesita un campo que falta, agregarlo acá — pero `precioCompra`
 * y los demás datos de compra NO entran: quien los necesite tiene que pedirlos por
 * un endpoint gateado que decida a quién se los muestra.
 */
export const VEHICULO_PUBLICO = {
    id: true,
    marca: true,
    modelo: true,
    version: true,
    anio: true,
    dominio: true,
    color: true,
    estado: true,
    tipo: true,
    kmIngreso: true,
    precioLista: true,
    moneda: true,
} as const;

/**
 * `Vehiculo.precioMinimo` NO entra en VEHICULO_PUBLICO, y tampoco en ningún
 * `select` de conveniencia: el dueño decidió que el piso de venta "requiere
 * autorización por sistema", así que no puede viajar junto al precio de lista ni
 * siquiera para el admin en un include anidado (si el admin lo necesita, lo tiene
 * en la ficha del vehículo, que es la ruta que sabe a quién se lo muestra).
 * El único camino por el que ese número llega a un vendedor es una
 * SolicitudPrecioMinimo autorizada y vigente — ver precioAutorizacion.ts.
 */

/**
 * Proyección pública de un Usuario para los `include` anidados.
 *
 * POR QUÉ: `include: { vendedor: true }` / `{ creadaPor: true }` /
 * `{ registradoPor: true }` devuelven la fila ENTERA de Usuario — con
 * `passwordHash`, `email` y **`comisionPorcentaje`**. `sanitizeUsuario` de
 * UsuarioController tapa exactamente esos campos, pero sólo mira las rutas
 * `/usuarios`: el mismo dato salía entero por `GET /ventas/:id`,
 * `GET /reservas/:id` y `GET /presupuestos/:id`, ninguna de las cuales lleva
 * `authorize`. La comisión del vendedor es dato de remuneración y el hash es una
 * credencial: ninguno de los dos tiene nada que hacer en el detalle de una venta.
 *
 * `email` tampoco entra: para mostrar "quién lo hizo" alcanza el nombre, y el
 * padrón de mails del equipo es dato personal que no necesita viajar en cada fila.
 *
 * REGLA: en cualquier `include` de un usuario anidado, usar esto y no `true`.
 */
export const USUARIO_PUBLICO = {
    id: true,
    nombre: true,
} as const;

/**
 * Proyección pública de un Proveedor para los `include` anidados.
 *
 * El padrón de proveedores es dato comercial (a quién se le compra, a qué taller
 * se manda) y la especificación del módulo del vendedor lo pone explícitamente en
 * la lista de lo que el vendedor NO VE. Donde la pantalla necesita mostrar un
 * destino o un origen alcanza con el nombre; el resto (email, teléfono, tipo,
 * dirección) es la agenda de compras y sale sólo por `/proveedores`, que está
 * gateada.
 */
export const PROVEEDOR_PUBLICO = {
    id: true,
    nombre: true,
} as const;
