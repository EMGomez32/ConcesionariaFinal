import { Request, Response, NextFunction } from 'express';
import { PrismaClienteRepository } from '../../infrastructure/database/repositories/PrismaClienteRepository';
import { GetClientes } from '../../application/use-cases/clientes/GetClientes';
import { GetClienteById } from '../../application/use-cases/clientes/GetClienteById';
import { CreateCliente } from '../../application/use-cases/clientes/CreateCliente';
import { UpdateCliente } from '../../application/use-cases/clientes/UpdateCliente';
import { DeleteCliente } from '../../application/use-cases/clientes/DeleteCliente';
import { cleanFilters } from '../../utils/cleanFilters';
import parseNumericFields from '../../utils/parseNumericFields';
import { ingestarConsulta } from '../../application/services/consultaIngest';
import { importarClientes } from '../../application/services/clienteImport';
import { audit } from '../../infrastructure/security/audit';
import { resolveConcesionariaId } from '../../infrastructure/security/resolveConcesionariaId';
import { Col, sendCsv } from '../../utils/csv';
import { avisoDeAsignacion } from '../../application/services/carteraCliente';
import { logger } from '../../infrastructure/logging/logger';
import { actorEsVendedorPuro } from '../../infrastructure/security/roles';

const repository = new PrismaClienteRepository();
const getClientesUC = new GetClientes(repository);
const getClienteByIdUC = new GetClienteById(repository);
const createClienteUC = new CreateCliente(repository);
const updateClienteUC = new UpdateCliente(repository);
const deleteClienteUC = new DeleteCliente(repository);

export class ClienteController {
    static async getAll(req: Request, res: Response, next: NextFunction) {
        try {
            const { limit, page, sortBy, sortOrder, ...filters } = req.query;
            // Limpiar filtros vacíos y convertir campos numéricos. Los filtros CRM
            // (origenLead / vendedorAsignadoId) viajan igual que estadoLead: el repo
            // los whitelistea antes de armar el where.
            const cleanedFilters = cleanFilters(filters);
            const parsedFilters = parseNumericFields(cleanedFilters, ['concesionariaId', 'vendedorAsignadoId']);
            const result = await getClientesUC.execute(parsedFilters, { limit, page, sortBy, sortOrder } as any);
            res.json(result);
        } catch (error) {
            next(error);
        }
    }

    // Export CSV de la cartera de clientes con los MISMOS filtros del listado.
    // Tope defensivo de 5000; orden alfabético por nombre. Dato personal, por eso
    // la ruta va con authorize(admin, vendedor).
    static async exportCsv(req: Request, res: Response, next: NextFunction) {
        try {
            const CAP = 5000;
            const { limit, page, sortBy, sortOrder, ...filters } = req.query;
            void limit; void page; void sortBy; void sortOrder;
            const cleanedFilters = cleanFilters(filters);
            const parsedFilters = parseNumericFields(cleanedFilters, ['concesionariaId', 'vendedorAsignadoId']);
            const result: any = await getClientesUC.execute(
                parsedFilters,
                { limit: CAP, page: 1, sortBy: 'nombre', sortOrder: 'asc' } as any,
            );

            // Truncado no-silencioso: si hay más que el tope, avisamos por header + log.
            if (Number(result.totalResults) > CAP) {
                res.setHeader('X-Export-Truncated', String(result.totalResults));
                console.warn(`[export] clientes CSV truncado: ${result.totalResults} > ${CAP}`);
            }

            const toDia = (d: any) =>
                d instanceof Date ? d.toISOString().slice(0, 10) : d ? String(d).slice(0, 10) : '';

            const cols: Col[] = [
                { key: 'nombre', header: 'Nombre' },
                { key: 'dni', header: 'DNI/CUIT' },
                { key: 'telefono', header: 'Teléfono' },
                { key: 'email', header: 'Email' },
                { key: 'direccion', header: 'Dirección' },
                { key: 'estadoLead', header: 'Etapa' },
                { key: 'observaciones', header: 'Observaciones' },
                { key: 'alta', header: 'Fecha alta' },
            ];

            const rows = (result.results as any[]).map((c) => ({
                nombre: c.nombre,
                dni: c.dni,
                telefono: c.telefono,
                email: c.email,
                direccion: c.direccion,
                estadoLead: c.estadoLead,
                observaciones: c.observaciones,
                alta: toDia(c.createdAt),
            }));

            sendCsv(res, 'clientes', cols, rows);
        } catch (error) {
            next(error);
        }
    }

    static async getById(req: Request, res: Response, next: NextFunction) {
        try {
            const id = parseInt(req.params.id as string, 10);
            const result: any = await getClienteByIdUC.execute(id);

            // LA FICHA PUNTUAL NO SE BLOQUEA. El listado y el CSV sí están recortados
            // por cartera (PrismaClienteRepository), pero la especificación pide que,
            // si un cliente de otro vendedor vuelve al salón, el sistema AVISE y deje
            // atender registrando quién lo atendió. Un 403 acá haría imposible ese
            // flujo — y lo que hay que evitar es el barrido de la cartera ajena, no la
            // atención de la persona que está parada en el mostrador.
            const asignacion = await avisoDeAsignacion(result);

            // HUELLA del acceso cruzado. Va al log y NO al audit log: el enum
            // `AccionAudit` de la base no tiene 'read' y agregarle un valor es una
            // migración con `ALTER TYPE`, que no corresponde meter acá. El registro
            // que la especificación pide de verdad —"registra quién lo atendió
            // realmente"— es `Atencion.vendedorId`, que ya existe y es el que va a
            // ver el supervisor. Esto es sólo la señal previa.
            if (asignacion.esDeOtroVendedor && actorEsVendedorPuro()) {
                logger.info(`[cartera] cliente ${id} (de ${asignacion.vendedorAsignado ?? asignacion.vendedorAsignadoId}) abierto por otro vendedor${asignacion.retencionVencida ? ' — retención vencida' : ''}`);
            }

            res.json({ ...result, asignacion });
        } catch (error) {
            next(error);
        }
    }

    // Ingesta de una consulta de venta (lead). Camino común de todos los canales
    // (keystone consultaIngest): dedupe por teléfono/email dentro del tenant,
    // round-robin de vendedor y reapertura de leads ganados/perdidos. Acá el
    // request viene autenticado, así que el contexto de tenant ya está y se llama
    // a ingestarConsulta directo (sin conContextoSistema).
    static async consulta(req: Request, res: Response, next: NextFunction) {
        try {
            const result = await ingestarConsulta(req.body);
            await audit({
                entidad: 'Cliente',
                accion: result.creado ? 'create' : 'update',
                entidadId: result.clienteId,
                detalle: `Consulta por ${req.body.origen} ingresada (cliente ${result.clienteId}${result.creado ? ' nuevo' : ' existente'}${result.reabierto ? ', lead reabierto' : ''})`,
            });
            res.status(201).json(result);
        } catch (error) {
            next(error);
        }
    }

    // Import masivo de clientes (carga de cartera). El servicio procesa el lote
    // en una pasada secuencial y reporta errores POR FILA (índice 0-based dentro
    // del lote): una fila mala no aborta a las demás, por eso siempre es 200.
    static async importar(req: Request, res: Response, next: NextFunction) {
        try {
            const { filas, opciones } = req.body;
            const result = await importarClientes(filas, opciones);
            await audit({
                entidad: 'Cliente',
                accion: 'create',
                detalle: `import masivo: ${result.creados} creados, ${result.actualizados} actualizados`,
            });
            res.json(result);
        } catch (error) {
            next(error);
        }
    }

    static async create(req: Request, res: Response, next: NextFunction) {
        try {
            // Convertir campos numéricos del body
            const data = parseNumericFields(req.body, ['concesionariaId']);
            const concesionariaId = resolveConcesionariaId(data.concesionariaId);
            const result = await createClienteUC.execute({ ...data, concesionariaId });
            await audit({
                entidad: 'Cliente',
                accion: 'create',
                entidadId: (result as any)?.id,
                detalle: `Cliente ${(result as any)?.nombre ?? (result as any)?.id} creado`,
            });
            res.status(201).json(result);
        } catch (error) {
            next(error);
        }
    }

    static async update(req: Request, res: Response, next: NextFunction) {
        try {
            const id = parseInt(req.params.id as string, 10);
            // Convertir campos numéricos del body
            const data = parseNumericFields(req.body, ['concesionariaId']);
            const result = await updateClienteUC.execute(id, data);
            await audit({
                entidad: 'Cliente',
                accion: 'update',
                entidadId: id,
                detalle: `Cliente ${(result as any)?.nombre ?? id} actualizado`,
            });
            res.json(result);
        } catch (error) {
            next(error);
        }
    }

    static async delete(req: Request, res: Response, next: NextFunction) {
        try {
            const id = parseInt(req.params.id as string, 10);
            await deleteClienteUC.execute(id);
            await audit({
                entidad: 'Cliente',
                accion: 'delete_soft',
                entidadId: id,
                detalle: `Cliente ${id} eliminado`,
            });
            res.status(204).send();
        } catch (error) {
            next(error);
        }
    }
}
