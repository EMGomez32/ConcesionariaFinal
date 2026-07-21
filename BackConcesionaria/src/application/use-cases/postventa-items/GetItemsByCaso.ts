import { IPostventaItemRepository } from '../../../domain/repositories/IPostventaItemRepository';

export class GetItemsByCaso {
    constructor(private readonly repository: IPostventaItemRepository) { }

    async execute(casoId: number) {
        return this.repository.findByCaso(casoId);
    }
}
