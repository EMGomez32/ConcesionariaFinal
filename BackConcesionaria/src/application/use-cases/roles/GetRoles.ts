import { IRolRepository } from '../../../domain/repositories/IRolRepository';

export class GetRoles {
    constructor(private readonly rolRepository: IRolRepository) { }

    async execute() {
        return this.rolRepository.findAll();
    }
}
