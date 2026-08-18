import type { EntornoAfip } from '@prisma/client';
import type { IAfipService } from '../../domain/services/afip/IAfipService';
import { MockAfipService } from './MockAfipService';

/**
 * Devuelve la implementación de AFIP según el entorno del tenant.
 *
 * Corte 1: sólo existe `mock` (CAE simulado). `homologacion`/`produccion` todavía
 * NO tienen adapter real (WSAA + WSFEv1 llegan en el Corte 2), así que por ahora
 * también caen al mock — pero el use-case corta ANTES si el entorno no es `mock`
 * sin certificado cargado, para no emitir un "CAE" falso creyendo que es real.
 * Cuando exista WsfeAfipService, se enchufa acá sin tocar el use-case.
 */
export function afipServiceFor(_entorno: EntornoAfip): IAfipService {
    // TODO Corte 2: if (_entorno === 'homologacion' || _entorno === 'produccion') return new WsfeAfipService(...)
    return new MockAfipService();
}
