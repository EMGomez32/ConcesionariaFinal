export class Rol {
    constructor(
        public readonly id: number,
        public readonly nombre: string,
        public readonly descripcion: string | null,
        public readonly createdAt: Date,
        public readonly updatedAt: Date
    ) { }
}
