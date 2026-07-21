import { PostventaItem } from '../entities/PostventaItem';

export interface IPostventaItemRepository {
    findByCaso(casoId: number): Promise<PostventaItem[]>;
    findById(id: number): Promise<PostventaItem | null>;
    create(data: any): Promise<PostventaItem>;
    delete(id: number): Promise<void>;
}
