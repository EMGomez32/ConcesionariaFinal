import { IVehiculoRepository } from '../../../domain/repositories/IVehiculoRepository';
import { NotFoundException, ValidationException } from '../../../domain/exceptions/BaseException';
import { MOTIVO_MIN, motivoSuficiente } from '../../../domain/services/motivo';
import { assertValidTransition } from '../../../domain/services/stateMachine';
import { assertMismoTenant } from '../../../infrastructure/security/tenantGuard';
import { recordPrecioVehiculo } from '../../../infrastructure/pricing/recordPrecioVehiculo';
import { sincronizarEnSegundoPlano } from '../../services/meliPublicacion';

export class UpdateVehiculo {
    constructor(private readonly vehiculoRepository: IVehiculoRepository) { }

    async execute(id: number, data: any) {
        const exists: any = await this.vehiculoRepository.findById(id);
        if (!exists) {
            throw new NotFoundException('Vehículo');
        }

        if (data.estado && data.estado !== exists.estado) {
            assertValidTransition('vehiculo', exists.estado, data.estado);
        }

        // El body de update llega crudo (vehiculo.validation es express-validator y
        // no strippea claves): sucursalId/proveedorCompraId son sobreescribibles y
        // hay que confinarlos al tenant del vehículo.
        const tenantId = exists.concesionariaId;
        await assertMismoTenant('sucursal', data.sucursalId, tenantId);
        await assertMismoTenant('proveedor', data.proveedorCompraId, tenantId);

        // clienteOrigenId es dato del ingreso, no del vehículo: se descarta.
        // motivoCambioPrecio tampoco es columna: va al historial de precios, más abajo.
        const { clienteOrigenId, motivoCambioPrecio, ...vehiculoData } = data;

        // BAJAR el precio de lista exige motivo (PROC-34). Es la otra punta del piso de
        // venta: si el precio de lista se puede bajar sin decir por qué, el descuento
        // se hace en la ficha y la venta ya sale "al precio". Subirlo o cargarlo por
        // primera vez no lo pide. Se valida ANTES de escribir nada.
        // (Borrar el precio para después cargar uno más bajo "desde cero" no es un
        // atajo: el schema convierte ''/null en "no lo toca", así que un precio ya
        // cargado no se puede vaciar por PATCH.)
        if (vehiculoData.precioLista !== undefined && vehiculoData.precioLista !== null && vehiculoData.precioLista !== '') {
            const anterior = exists.precioLista == null ? null : Number(exists.precioLista);
            const nuevo = Number(vehiculoData.precioLista);
            if (anterior !== null && !Number.isNaN(nuevo) && nuevo < anterior && !motivoSuficiente(motivoCambioPrecio)) {
                const mensaje = `Contá por qué baja el precio de lista (al menos ${MOTIVO_MIN} caracteres): queda en el historial de precios.`;
                throw new ValidationException([{ campo: 'motivoCambioPrecio', mensaje }], mensaje);
            }
        }

        // Los inputs type="date" mandan "YYYY-MM-DD" y los selects strings.
        if (vehiculoData.fechaIngreso) vehiculoData.fechaIngreso = new Date(vehiculoData.fechaIngreso);
        if (vehiculoData.fechaCompra) vehiculoData.fechaCompra = new Date(vehiculoData.fechaCompra);
        // Fechas opcionales: presente (incluido '') ⇒ coerce, '' ⇒ null (borra la fecha
        // sin reventar Prisma); ausente ⇒ no se toca (un PATCH parcial no la borra).
        if (vehiculoData.vencimientoVtv !== undefined) {
            vehiculoData.vencimientoVtv = vehiculoData.vencimientoVtv ? new Date(vehiculoData.vencimientoVtv) : null;
        }
        if (vehiculoData.vencimientoSeguro !== undefined) {
            vehiculoData.vencimientoSeguro = vehiculoData.vencimientoSeguro ? new Date(vehiculoData.vencimientoSeguro) : null;
        }
        if (vehiculoData.proveedorCompraId !== undefined) {
            vehiculoData.proveedorCompraId = vehiculoData.proveedorCompraId ? Number(vehiculoData.proveedorCompraId) : null;
        }
        void clienteOrigenId;

        const updated: any = await this.vehiculoRepository.update(id, vehiculoData);

        // Si cambió el precio de lista, lo registramos en el historial (log
        // append-only, best-effort). Sólo cuando el body trae precioLista con un
        // valor numérico distinto al actual: un PATCH que no lo toca no registra
        // nada, y limpiarlo a null tampoco es "un precio nuevo".
        let cambioPrecio = false;
        if (vehiculoData.precioLista !== undefined) {
            const anterior = exists.precioLista == null ? null : Number(exists.precioLista);
            const nuevo =
                vehiculoData.precioLista === '' || vehiculoData.precioLista === null
                    ? null
                    : Number(vehiculoData.precioLista);
            if (nuevo != null && !Number.isNaN(nuevo) && nuevo !== anterior) {
                cambioPrecio = true;
                await recordPrecioVehiculo({
                    concesionariaId: exists.concesionariaId,
                    vehiculoId: id,
                    precioAnterior: anterior,
                    precioNuevo: nuevo,
                    moneda: updated?.moneda ?? exists.moneda,
                    motivo: typeof motivoCambioPrecio === 'string' && motivoCambioPrecio.trim() ? motivoCambioPrecio.trim() : null,
                });
            }
        }

        // Espejo en Mercado Libre: precio nuevo ⇒ se actualiza el item;
        // reservado ⇒ se pausa; vendido ⇒ se cierra; vuelta a publicado ⇒ se
        // reactiva. Va DESPUÉS del commit (el repositorio ya cerró su
        // transacción). Lo que se pierda acá lo repara el worker de
        // reconciliación (meliSyncWorker), que reintenta el empuje.
        const cambioEstado = !!updated && updated.estado !== exists.estado;
        if (cambioPrecio || cambioEstado) {
            sincronizarEnSegundoPlano(id);
        }

        return updated;
    }
}
