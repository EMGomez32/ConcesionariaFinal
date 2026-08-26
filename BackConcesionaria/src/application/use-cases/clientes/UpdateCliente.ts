import { IClienteRepository } from '../../../domain/repositories/IClienteRepository';
import { ForbiddenException, NotFoundException } from '../../../domain/exceptions/BaseException';
import { assertMismoTenant } from '../../../infrastructure/security/tenantGuard';
import { actorEsAdmin } from '../../../infrastructure/security/roles';

export class UpdateCliente {
    constructor(private readonly clienteRepository: IClienteRepository) { }

    async execute(id: number, data: any) {
        const exists: any = await this.clienteRepository.findById(id);
        if (!exists) {
            throw new NotFoundException('Cliente');
        }

        const actual: number | null = exists.vendedorAsignadoId ?? null;
        const pedido: number | null =
            data?.vendedorAsignadoId === undefined ? actual : (data.vendedorAsignadoId ?? null);
        const cambiaLaAsignacion = pedido !== actual;

        if (cambiaLaAsignacion) {
            /*
             * REASIGNAR CARTERA ES ACTO DE SUPERVISOR, NUNCA DEL VENDEDOR.
             *
             * `PATCH /clientes/:id` está abierto a admin Y vendedor (editar un
             * teléfono en el mostrador es trabajo del vendedor), y
             * `vendedorAsignadoId` es un campo declarado del schema, así que
             * sobrevive al recorte de Zod y el repo lo persiste. Sin este gate, un
             * vendedor se AUTOASIGNABA cualquier cliente del tenant con un solo
             * PATCH — y con eso el cliente entraba a su cartera, o sea al listado,
             * al export CSV (con DNI, teléfono, email y dirección), al buscador
             * global y al historial completo. Un loop sobre los ids cosechaba la
             * cartera entera. Todo el andamiaje de `reasignarClienteDeAtencion`
             * (doble gate de admin + audit con el motivo) se salteaba por una ruta
             * que ya existía.
             *
             * El chequeo va acá, en el caso de uso, y no sólo en la ruta: la regla
             * es del negocio ("la reasignación la autoriza un supervisor"), y tiene
             * que seguir valiendo el día que a esto lo llame otra pantalla, un job
             * o un import. Es el mismo patrón que ya usa
             * `atencionService.reasignarClienteDeAtencion`.
             */
            if (!actorEsAdmin()) {
                throw new ForbiddenException(
                    'La reasignación de un cliente la autoriza un supervisor (admin), no el vendedor.',
                );
            }
            // Sólo se re-valida el tenant cuando se ASIGNA uno nuevo (id no nulo).
            // Desasignar (null) no tiene destino que validar, y si el vendedor se
            // dio de baja DESPUÉS no puede congelar la edición del cliente con un
            // 404 'Usuario' en cualquier cambio (teléfono, etapa…).
            if (pedido !== null) {
                await assertMismoTenant('usuario', pedido, exists.concesionariaId);
            }
            // La fecha de la asignación se mueve CON la asignación. Sin esto la
            // ficha decía "es de Pérez desde el 3 de marzo" después de habérsela
            // pasado a González, y como la retención se mide contra esa fecha
            // (cuando no hay interacción posterior), el plazo arrancaba corrido.
            return this.clienteRepository.update(id, { ...data, vendedorAsignadoEn: new Date() });
        }

        // Reenviar el mismo id (el form lo manda siempre) no re-valida nada ni
        // toca la fecha: no hubo reasignación.
        return this.clienteRepository.update(id, data);
    }
}
