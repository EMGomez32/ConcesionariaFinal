import { IFinanciacionRepository } from '../../../domain/repositories/IFinanciacionRepository';
import { BaseException } from '../../../domain/exceptions/BaseException';

/**
 * Refinancia el saldo pendiente de un contrato en uno nuevo.
 *
 * El contrato original queda en estado 'refinanciada' y sus cuotas impagas
 * pasan a 'refinanciada' con saldo 0: la deuda se muda, no se cobra. El nuevo
 * contrato apunta al viejo por `refinanciaAId`, así la ficha puede ofrecer el
 * link entre ambos.
 *
 * El monto no se recibe del cliente: se calcula del saldo real de las cuotas.
 */
export class RefinanciarFinanciacion {
    constructor(private readonly financiacionRepository: IFinanciacionRepository) { }

    async execute(id: number, data: any) {
        const cuotas = Number(data?.cuotas);
        if (!Number.isInteger(cuotas) || cuotas < 1) {
            throw new BaseException(400, 'Indicá en cuántas cuotas se refinancia (mínimo 1)', 'VALIDATION_ERROR');
        }

        if (data?.tasaMensual !== undefined && data.tasaMensual !== null && data.tasaMensual !== '') {
            const tasa = Number(data.tasaMensual);
            if (Number.isNaN(tasa) || tasa < 0) {
                throw new BaseException(400, 'La tasa mensual debe ser un número positivo', 'VALIDATION_ERROR');
            }
        }

        if (data?.diaVencimiento !== undefined && data.diaVencimiento !== null && data.diaVencimiento !== '') {
            const dia = Number(data.diaVencimiento);
            if (!Number.isInteger(dia) || dia < 1 || dia > 31) {
                throw new BaseException(400, 'El día de vencimiento debe estar entre 1 y 31', 'VALIDATION_ERROR');
            }
        }

        return this.financiacionRepository.refinanciar(id, data);
    }
}
