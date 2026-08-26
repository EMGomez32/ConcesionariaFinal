import { Request, Response, NextFunction } from 'express';
import * as atencionService from '../../application/services/atencionService';

/**
 * Atención presencial — el módulo del vendedor.
 *
 * El controller es DELIBERADAMENTE fino: parsea, delega y responde. Todas las
 * reglas (el aviso de asignación, el enriquecimiento progresivo, el recálculo del
 * presupuesto real, la exigencia de resultado y de próximo contacto, el recorte
 * por vendedor) viven en `application/services/atencionService`, porque tienen que
 * seguir valiendo cuando las llame el barrido de fin de día o una pantalla nueva,
 * no sólo cuando entren por esta ruta.
 *
 * El gating de rol está en `atencion.routes.ts` (`authorize`). Los dos candados
 * que NO puede poner un middleware —"un vendedor puro sólo opera lo suyo" y "la
 * reasignación la autoriza un admin"— están en el service, que es el que ve el
 * dato.
 */
export class AtencionController {
    /** PASO 1a — dedupe + ficha + historial + aviso de asignación. No persiste nada. */
    static async identificar(req: Request, res: Response, next: NextFunction) {
        try {
            res.json(await atencionService.identificarCliente(req.body));
        } catch (error) {
            next(error);
        }
    }

    /** PASO 1b — abre la visita con lo mínimo. 409 si el cliente es de otro vendedor y no se confirmó. */
    static async abrir(req: Request, res: Response, next: NextFunction) {
        try {
            res.status(201).json(await atencionService.abrirAtencion(req.body));
        } catch (error) {
            next(error);
        }
    }

    static async listar(req: Request, res: Response, next: NextFunction) {
        try {
            const { estado, clienteId, vendedorId, desde, hasta, page, limit } = req.query as Record<string, string>;
            res.json(await atencionService.listarAtenciones({
                estado: estado as 'abierta' | 'cerrada' | undefined,
                clienteId: clienteId ? Number(clienteId) : undefined,
                vendedorId: vendedorId ? Number(vendedorId) : undefined,
                desde,
                hasta,
                page: page ? Number(page) : undefined,
                limit: limit ? Number(limit) : undefined,
            }));
        } catch (error) {
            next(error);
        }
    }

    /**
     * Alerta de atenciones sin cerrar. Va ANTES de `/:id` en el router: si no,
     * Express matchea "alertas" como id y responde un 400 por un parseInt fallido.
     */
    static async alertas(_req: Request, res: Response, next: NextFunction) {
        try {
            res.json(await atencionService.alertaAtenciones());
        } catch (error) {
            next(error);
        }
    }

    static async detalle(req: Request, res: Response, next: NextFunction) {
        try {
            res.json(await atencionService.obtenerAtencion(parseInt(req.params.id as string, 10)));
        } catch (error) {
            next(error);
        }
    }

    /** Historial completo del cliente: atenciones, unidades ya vistas y quién lo atendió. */
    static async historialCliente(req: Request, res: Response, next: NextFunction) {
        try {
            res.json(await atencionService.historialDeCliente(parseInt(req.params.clienteId as string, 10)));
        } catch (error) {
            next(error);
        }
    }

    /** PASO 2 — enriquecimiento progresivo (DNI, email, domicilio, consentimiento). */
    static async completarCliente(req: Request, res: Response, next: NextFunction) {
        try {
            res.json(await atencionService.completarCliente(parseInt(req.params.id as string, 10), req.body));
        } catch (error) {
            next(error);
        }
    }

    /** PASOS 3 y 4 — relevamiento + búsqueda + hasta 3 alternativas con su motivo. */
    static async buscar(req: Request, res: Response, next: NextFunction) {
        try {
            res.json(await atencionService.buscarUnidades(parseInt(req.params.id as string, 10), req.body));
        } catch (error) {
            next(error);
        }
    }

    /** PASO 5 — registro de lo mostrado (buscada|sugerida, acción, motivo). */
    static async registrarVehiculo(req: Request, res: Response, next: NextFunction) {
        try {
            res.status(201).json(await atencionService.registrarVehiculoMostrado(parseInt(req.params.id as string, 10), req.body));
        } catch (error) {
            next(error);
        }
    }

    /** Permuta de la visita: se materializa como una Tasación vinculada a la atención. */
    static async registrarPermuta(req: Request, res: Response, next: NextFunction) {
        try {
            res.status(201).json(await atencionService.registrarPermuta(parseInt(req.params.id as string, 10), req.body));
        } catch (error) {
            next(error);
        }
    }

    /** PASO 6 — cierre. Exige resultado, y próximo contacto si el resultado no es definitivo. */
    static async cerrar(req: Request, res: Response, next: NextFunction) {
        try {
            res.json(await atencionService.cerrarAtencion(parseInt(req.params.id as string, 10), req.body));
        } catch (error) {
            next(error);
        }
    }

    /** Reasignación del cliente. Sólo admin (el service lo vuelve a exigir). */
    static async reasignar(req: Request, res: Response, next: NextFunction) {
        try {
            res.json(await atencionService.reasignarClienteDeAtencion(parseInt(req.params.id as string, 10), req.body));
        } catch (error) {
            next(error);
        }
    }
}
