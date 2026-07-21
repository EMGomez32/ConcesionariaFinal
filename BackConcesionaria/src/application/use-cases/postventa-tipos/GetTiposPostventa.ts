import { ITipoPostventaRepository } from '../../../domain/repositories/ITipoPostventaRepository';

export class GetTiposPostventa {
    constructor(private readonly repository: ITipoPostventaRepository) { }

    async execute(concesionariaId: number) {
        return this.repository.findAll(concesionariaId);
    }
}
