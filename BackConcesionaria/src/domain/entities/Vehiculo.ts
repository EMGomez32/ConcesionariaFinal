export class Vehiculo {
    constructor(
        public readonly id: number,
        public readonly concesionariaId: number,
        public readonly sucursalId: number,
        public readonly marca: string,
        public readonly modelo: string,
        public readonly version: string | null,
        public readonly anio: number | null,
        public readonly dominio: string | null,
        public readonly vin: string | null,
        public readonly kmIngreso: number | null,
        public readonly color: string | null,
        public readonly estado: string,
        public readonly fechaIngreso: Date,
        public readonly precioLista: number | null,
        public readonly createdAt: Date,
        public readonly updatedAt: Date,
        public readonly deletedAt: Date | null,
        public readonly sucursal?: any,
        public readonly archivos?: any[],
        public readonly moneda: string = 'ARS',
        /** Vencimiento de la VTV y del seguro (documentación del vehículo). */
        public readonly vencimientoVtv: Date | null = null,
        public readonly vencimientoSeguro: Date | null = null,
        /**
         * Datos de compra. Se persistían pero NO estaban acá, así que
         * `mapToEntity` los perdía y nunca volvían en un GET: el precio de compra
         * quedaba guardado e invisible hasta para el admin, y la ficha mostraba
         * dos renglones muertos.
         *
         * `precioCompra` es DATO SENSIBLE —es el número del que sale el margen—
         * así que la entidad los mapea siempre y quien decide si salen al cliente
         * es `VehiculoController`, que se los recorta a todo el que no sea admin
         * (mismo criterio que `sanitizarVehiculosComprados` en la ficha del
         * proveedor). Ojo: la proyección VEHICULO_PUBLICO sigue SIN incluirlos, y
         * así tiene que quedar — es la que se usa en los `include` anidados.
         */
        public readonly precioCompra: number | null = null,
        public readonly fechaCompra: Date | null = null,
        /**
         * A quién se le compró la unidad.
         *
         * CORREGIDO: antes esto NO se recortaba por rol, con el argumento de que
         * "la lista de proveedores la ve todo el equipo". La especificación del
         * módulo del vendedor dice lo contrario y en forma explícita — "El vendedor
         * NO VE: precio de compra, costo de preparación, margen, PROVEEDOR" — y
         * entre una decisión escrita en un comentario y un criterio de aceptación,
         * manda el criterio. `sanitizarDatosDeCompra` ahora lo recorta junto con
         * `proveedorCompraId` y `formaPagoCompra`: el vínculo unidad→proveedor es
         * media cadena de compra, y con la ficha del proveedor abierta se
         * reconstruye la otra media.
         *
         * Lo que sigue abierto al vendedor es el PADRÓN (`GET /proveedores`), que
         * necesita para mandar una unidad al taller. La ficha del proveedor
         * (`GET /proveedores/:id`) pasó a admin+postventa.
         */
        public readonly proveedorCompra?: { id: number; nombre: string } | null,
        /**
         * PISO DE VENTA AUTORIZADO. Se mapea para que el ADMIN lo vea en la ficha
         * (si no, la columna quedaría guardada e invisible, el mismo bug que tuvo
         * `precioCompra`), pero es el dato más restringido del modelo: el dueño
         * decidió que "requiere autorización por sistema".
         *
         * Quién lo puede ver: `VehiculoController.sanitizarDatosDeCompra` se lo
         * recorta a TODO el que no sea admin, y la única forma de que llegue a un
         * vendedor es `application/services/precioAutorizacion.ts` — una solicitud
         * suya, para esa unidad, autorizada y no vencida. NO está en
         * VEHICULO_PUBLICO y no puede entrar: ningún include anidado lo lleva.
         */
        public readonly precioMinimo: number | null = null,
        /**
         * Segmento comercial (texto libre: "sedán", "SUV compacta", "pick-up"). Lo
         * consume el motor de sugerencias para los criterios "mismo segmento y
         * ±15%" y "competencia directa del segmento". Sin mapearlo, la columna se
         * cargaba y el motor la leía siempre en null, degradando a banda de precio.
         */
        public readonly segmento: string | null = null
    ) { }

    public isAvailable(): boolean {
        return this.estado === 'publicado' || this.estado === 'preparacion';
    }
}
