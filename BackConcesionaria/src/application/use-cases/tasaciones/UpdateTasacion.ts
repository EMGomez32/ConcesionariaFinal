import { ITasacionRepository } from '../../../domain/repositories/ITasacionRepository';
import { BaseException, NotFoundException } from '../../../domain/exceptions/BaseException';
import { configCartera } from '../../services/carteraCliente';
import { actorEsAdmin, actorEsTasador, actorUserId } from '../../../infrastructure/security/roles';

/**
 * Completar una tasación existente: es lo que hace el TASADOR cuando le pone el
 * valor a una que quedó "sin tasar" (nació de una permuta en el mostrador). NO
 * crea una nueva —esa era la fuente de duplicados—: actualiza la misma fila.
 *
 * Reglas:
 *  - Poner el valor es "tasar". Si la concesionaria tiene `tasacionSoloTasador`,
 *    sólo un admin puede hacerlo (mismo criterio que registrarPermuta en el
 *    mostrador). Cargar/editar el resto de los datos no está restringido.
 *  - El `estado` lo deduce el valor final (con valor ⇒ `tasada`), nunca el body.
 *  - El `tasadorId` se estampa de quien pone el valor, desde el token.
 */
export class UpdateTasacion {
    constructor(private readonly repository: ITasacionRepository) { }

    async execute(id: number, data: any) {
        // findById va scopeado al tenant (extensión/RLS): una tasación de otra
        // concesionaria devuelve null y esto corta con 404, sin fuga.
        const existente = await this.repository.findById(id);
        if (!existente) throw new NotFoundException('Tasación');

        const poneValor = data.valorEstimado !== undefined && data.valorEstimado !== null;
        if (poneValor) {
            const { tasacionSoloTasador } = await configCartera((existente as any).concesionariaId);
            // El tasador SIEMPRE puede poner el valor (es su función). El vendedor
            // sólo cuando la casa no restringe la tasación al tasador.
            const puedeTasar = actorEsAdmin() || actorEsTasador() || !tasacionSoloTasador;
            if (!puedeTasar) {
                throw new BaseException(
                    403,
                    'En esta concesionaria el valor de toma lo carga el tasador.',
                    'TASACION_SOLO_TASADOR',
                );
            }
        }

        // El valor que va a quedar (el nuevo, o el que ya tenía si este PATCH no lo
        // trae). Con valor ⇒ tasada; sin valor ⇒ sin_tasar.
        const valorFinal = poneValor ? Number(data.valorEstimado) : (existente as any).valorEstimado;
        const estado = valorFinal != null ? 'tasada' : 'sin_tasar';
        // El tasador se estampa sólo cuando este PATCH pone el valor; si no, se
        // respeta el que ya estaba.
        const tasadorId = poneValor ? actorUserId() : ((existente as any).tasadorId ?? null);

        return this.repository.update(id, { ...data, estado, tasadorId });
    }
}
