# Desarrollo seguro

Versión 1.0 · Responsable: Responsable de seguridad · Revisión: anual.

## Objetivo

Que la seguridad y la privacidad se diseñen y se prueben junto con cada
funcionalidad, y no se descubran en producción.

## Alcance

Todo código de `BackConcesionaria/`, `FrontConcesionaria/`, `AppConcesionaria/`
y `scripts/`, escrito por personas o con asistentes de IA.

## Definición de listo (DoD)

Un cambio está listo para mergear cuando:

1. Hace lo que dice el PR y tiene tests que lo prueban.
2. El CI está en verde, sin checks salteados.
3. Si cambia el schema, trae su migración y, si suma una tabla con datos de un
   tenant, la suma a `TENANT_TABLES` (`BackConcesionaria/prisma/init-rls.ts`).
4. Toda ruta nueva que modifica datos tiene `authorize(...)` y un schema Zod.
5. Si cambia permisos, actualiza `FrontConcesionaria/src/pages/capacitacion/contenido.ts`.
6. Si cambia la operación (variables, volúmenes, pasos de deploy), actualiza el
   [runbook](../operacion/runbook-deploy.md), `.env.example` y el compose.
7. Si trata datos personales nuevos, actualiza el
   [registro de tratamientos](../privacidad/registro-de-actividades-de-tratamiento.md)
   y, si corresponde, la [retención](../privacidad/politica-de-retencion.md).
8. La plantilla de PR está completa, con riesgo y plan de rollback.

## Checklist de seguridad (riesgo alto)

Se responde en el PR cuando el cambio toca alguno de estos temas.

**Autenticación y sesión**
- [ ] ¿Algún camino nuevo emite tokens o cambia credenciales? ¿Cierra las otras sesiones cuando corresponde?
- [ ] ¿Respeta el 2FA pendiente (`mfaPending`)?

**Autorización y tenant**
- [ ] ¿Cada ruta declara sus roles? ¿El centinela lo cubre?
- [ ] ¿El tenant sale de la sesión y no del body? ¿Las FK del body se validan contra el tenant (`BackConcesionaria/src/infrastructure/security/tenantGuard.ts`)?
- [ ] ¿Hay `rawPrisma` o `$queryRaw`? ¿Usa `withTenantTransaction` / `withAuthBypass` y filtra el tenant explícito?
- [ ] ¿Lo probaste bajo `app_rw` (job `integration-rls`)?

**Plata**
- [ ] ¿La operación es atómica (Unit of Work) e idempotente si se puede reintentar?
- [ ] ¿Respeta la máquina de estados (`BackConcesionaria/src/domain/services/stateMachine.ts`)?
- [ ] ¿Anular, cancelar o condonar queda restringido al administrador, con motivo y en la auditoría con el valor anterior y el nuevo?

**Datos personales**
- [ ] ¿Se recolecta solo lo necesario? ¿Qué rol lo ve? ¿Sale en un CSV o PDF?
- [ ] ¿Termina en logs, URLs o mensajes de error?
- [ ] ¿Tiene plazo de conservación y se puede suprimir o anonimizar?

**Entradas y salidas**
- [ ] ¿Toda entrada pasa por Zod? ¿Los archivos se validan por contenido?
- [ ] ¿Hay salidas hacia una URL o host que viene de un dato? Usar `destinoSeguro.ts` o un origen fijo.
- [ ] ¿Algo se interpola en HTML, SQL, CSV o un comando sin escapar?

**Terceros y secretos**
- [ ] ¿Integración o dependencia nueva? Modelo de amenazas (abajo) y alta en el [registro de proveedores](proveedores-y-subencargados.md).
- [ ] ¿Secreto nuevo? Va al `.env`, al compose y al `.env.example` sin valor; nunca al código.

## Modelo de amenazas por integración nueva

Una página en el PR (o enlazada desde él) antes de la primera línea de código
de una integración con un tercero. Plantilla:

```markdown
### Modelo de amenazas: <integración>
- Qué hace y por qué la necesitamos:
- Datos que entran / salen (y de qué titulares):
- Credenciales: cuáles, dónde se guardan, quién las puede revocar:
- Puntos de entrada nuevos (webhooks, OAuth callbacks, workers):
- Amenazas (STRIDE): suplantación / manipulación / repudio / divulgación / denegación / elevación
- Controles para cada amenaza:
- Qué pasa si el tercero cae, cambia términos o nos bloquea:
- Riesgo residual y quién lo acepta:
```

## Tests de controles de seguridad

1. **Con el flujo real.** Un test de un control de seguridad usa el mismo camino
   que el usuario: por ejemplo, subir un archivo por la API y pedirlo por la URL
   que la API devuelve, no por una URL armada a mano en el test.
2. **Que pueda fallar.** Antes de dar por bueno un test de seguridad, rompé el
   control a propósito y confirmá que el test se pone rojo.
3. **Bajo el rol real.** El aislamiento de tenant y los caminos cross-tenant
   (workers, webhooks) se prueban con el backend corriendo como `app_rw`.
4. **Negativos primero.** Para cada permiso, el test del rol que **no** puede.
5. **Centinelas.** Los invariantes globales se protegen con tests que recorren
   el código: `tests/integration/permisos-mutaciones.test.ts`,
   `tests/unit/centinelaLecturas.test.ts`.

## Dependencias y código de terceros

- `npm ci` con lockfile en todo build. Dependencias nuevas: mantenidas, con
  licencia compatible y sin alternativa razonable ya presente.
- Código copiado de otro proyecto: solo con permiso escrito del titular y su
  licencia anotada en el PR.

## Asistentes de IA

El código generado se revisa como el de cualquier otro autor. Las reglas de
datos y de acceso están en [uso aceptable e IA](uso-aceptable-y-ia.md).

## Responsable

El Desarrollador aplica la DoD y la checklist. El Responsable de seguridad
revisa una muestra de PR de riesgo alto en cada auditoría interna.

## Evidencia que se guarda

PR con la checklist respondida y la segunda lectura; modelos de amenazas;
corridas del CI.

## Frecuencia de revisión

Anual, y después de cada incidente causado por un defecto de código.

## Controles que cubre

ISO 27001:2022 A.5.8, A.8.25, A.8.26, A.8.27, A.8.28, A.8.29, A.8.33 ·
ISO 27701 6.11.2.1, 6.11.2.5, 6.11.3.1 · SOC 2 CC8.1, CC3.4, CC5.2.
