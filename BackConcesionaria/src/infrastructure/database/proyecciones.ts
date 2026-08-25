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
