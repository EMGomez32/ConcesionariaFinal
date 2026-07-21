import { IPresupuestoRepository } from '../../../domain/repositories/IPresupuestoRepository';
import { BaseException, NotFoundException } from '../../../domain/exceptions/BaseException';
import { assertValidTransition } from '../../../domain/services/stateMachine';

// Campos que SOLO pueden modificarse mientras el presupuesto está en `borrador`
// (HU-57). Cambios de estado puro o de observaciones siempre se permiten.
const BORRADOR_ONLY_FIELDS = [
    'sucursalId', 'clienteId', 'vendedorId', 'moneda', 'fechaCreacion',
    'validoHasta', 'items', 'externos', 'extras', 'canjes', 'canje',
];

export class UpdatePresupuesto {
    constructor(private readonly presupuestoRepository: IPresupuestoRepository) { }

    async execute(id: number, data: any) {
        const exists: any = await this.presupuestoRepository.findById(id);
        if (!exists) throw new NotFoundException('Presupuesto');

        if (data.estado && data.estado !== exists.estado) {
            assertValidTransition('presupuesto', exists.estado, data.estado);
        }

        // HU-57: edición de items/extras/canje solo permitida en estado `borrador`.
        const tocaCamposBloqueados = BORRADOR_ONLY_FIELDS.some((f) => data[f] !== undefined);
        if (tocaCamposBloqueados && exists.estado !== 'borrador') {
            throw new BaseException(
                422,
                `El presupuesto solo puede editarse en estado 'borrador' (actual: '${exists.estado}'). Para cambiar el estado usar PATCH con sólo el campo 'estado'.`,
                'INVALID_STATE'
            );
        }

        return this.presupuestoRepository.update(id, data);
    }
}
