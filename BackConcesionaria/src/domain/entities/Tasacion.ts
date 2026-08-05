export class Tasacion {
    constructor(
        public readonly id: number,
        public readonly concesionariaId: number,
        /** Cliente que trae el auto (opcional: puede ser un interesado sin ficha). */
        public readonly clienteId: number | null,
        /** Quién tasó: se estampa del usuario logueado (no del body). */
        public readonly tasadorId: number | null,
        public readonly marca: string,
        public readonly modelo: string,
        public readonly anio: number | null,
        public readonly km: number | null,
        public readonly dominio: string | null,
        public readonly condicion: string,
        public readonly valorEstimado: number | null,
        public readonly moneda: string,
        public readonly fecha: Date,
        public readonly observaciones: string | null,
        public readonly createdAt: Date,
        public readonly updatedAt: Date,
        public readonly deletedAt: Date | null,
        /** Datos del cliente / tasador ya resueltos, cuando se incluyen. */
        public readonly cliente?: any,
        public readonly tasador?: any,
    ) { }
}
