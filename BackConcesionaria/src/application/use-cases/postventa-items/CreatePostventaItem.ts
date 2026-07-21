import { IPostventaItemRepository } from '../../../domain/repositories/IPostventaItemRepository';

export class CreatePostventaItem {
    constructor(private readonly repository: IPostventaItemRepository) { }

    async execute(data: any) {
        return this.repository.create(data);
    }
}
