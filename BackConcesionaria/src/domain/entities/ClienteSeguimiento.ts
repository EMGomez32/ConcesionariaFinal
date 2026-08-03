export class ClienteSeguimiento {
    constructor(
        public readonly id: number,
        public readonly concesionariaId: number,
        public readonly clienteId: number,
        public readonly usuarioId: number,
        public readonly tipo: string,
        public readonly fecha: Date,
        public readonly nota: string,
        /** Fecha del próximo contacto a coordinar (o null). */
        public readonly proximoContacto: Date | null,
        /** El próximo contacto ya se realizó (sale de la agenda). */
        public readonly proximoContactoHecho: boolean,
        public readonly createdAt: Date,
        public readonly updatedAt: Date,
        public readonly deletedAt: Date | null,
        /** Datos del usuario que registró el contacto (id, nombre), cuando se incluyen. */
        public readonly usuario?: any,
    ) { }
}
