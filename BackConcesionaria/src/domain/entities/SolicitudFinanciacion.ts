export class SolicitudFinanciacion {
    constructor(
        public readonly id: number,
        public readonly concesionariaId: number,
        public readonly sucursalId: number | null,
        public readonly ventaId: number | null,
        public readonly presupuestoId: number | null,
        /** Qué unidad se financia. Null en pre-aprobaciones (todavía sin auto elegido). */
        public readonly vehiculoId: number | null,
        public readonly clienteId: number,
        public readonly financieraId: number,
        public readonly estado: string,
        /** Lo que se pide. Decimal en Prisma: llega como string, se expone Number. */
        public readonly montoSolicitado: number | null,
        public readonly plazoCuotas: number | null,
        public readonly tasaEstimada: number | null,
        public readonly fechaEnvio: Date | null,
        public readonly fechaRespuesta: Date | null,
        /** Lo que la financiera terminó aprobando (puede diferir de lo pedido). */
        public readonly montoAprobado: number | null,
        public readonly tasaFinal: number | null,
        public readonly observaciones: string | null,
        public readonly createdAt: Date,
        public readonly updatedAt: Date,
        public readonly deletedAt: Date | null,
        public readonly cliente?: any,
        public readonly financiera?: any,
        public readonly sucursal?: any,
        public readonly venta?: any,
        public readonly presupuesto?: any,
        public readonly archivos?: any[],
        // Va al final a propósito: insertarlo entre los opcionales correría a
        // `archivos` una posición y el constructor es posicional (los tipos
        // vecinos son `any`, así que TypeScript no avisaría).
        public readonly vehiculo?: any
    ) { }
}
