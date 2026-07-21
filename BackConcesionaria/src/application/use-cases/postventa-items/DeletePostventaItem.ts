import { IPostventaItemRepository } from '../../../domain/repositories/IPostventaItemRepository';
import { NotFoundException } from '../../../domain/exceptions/BaseException';

export class DeletePostventaItem {
    constructor(private readonly repository: IPostventaItemRepository) { }

    async execute(id: number) {
        const exists = await this.repository.findById(id);
        if (!exists) throw new NotFoundException('Item de postventa');
        return this.repository.delete(id);
    }
}
