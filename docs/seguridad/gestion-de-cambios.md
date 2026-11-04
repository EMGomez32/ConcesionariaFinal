# Gestión de cambios

Versión 1.0 · Responsable: Responsable de seguridad · Revisión: anual.

## Objetivo

Que todo cambio a producción (código, configuración, infraestructura o datos)
sea planificado, probado, revisado, trazable y reversible.

## Alcance

Código de los tres paquetes, `docker-compose.yml`, Dockerfiles, `nginx.conf`,
`scripts/`, workflows de CI, migraciones, configuración del host y de las
cuentas SaaS, y cambios de datos en producción.

## Tipos de cambio

| Tipo | Ejemplos | Requisitos |
|---|---|---|
| **Estándar** | Funcionalidad, UI, textos, documentación | PR + checks en verde |
| **Riesgo alto** | Toca autenticación, autorización, aislamiento de tenant o RLS, plata, datos personales, un tercero, migraciones, CI, compose, nginx, scripts o el host. Coincide con las rutas de `.github/CODEOWNERS`. | PR + checks + checklist de seguridad completa + segunda lectura diferida + plan de rollback escrito |
| **Emergencia** (*break-glass*) | Producción caída o incidente de seguridad activo, y el camino normal no está disponible o es demasiado lento | Procedimiento de abajo |

## Reglas

1. **Nada entra a `main` sin pull request.** Push directo y force push están
   bloqueados por la protección de rama, también para administradores.
2. **Checks obligatorios** para mergear: todos los jobs de
   `.github/workflows/ci.yml` (build y unitarios del back, integración,
   integración bajo `app_rw`, verificación de RLS, lógica de backups, front con
   lint y tests, typecheck de la app, `npm audit`, escaneo de secretos) y CodeQL
   (`.github/workflows/codeql.yml`). Un check que se agregue al CI se suma a la
   protección de rama en el mismo PR o el siguiente.
   > Pendiente de decisión del dueño: configurar en GitHub la lista de checks requeridos y `enforce_admins`.
3. **La plantilla de PR** (`.github/pull_request_template.md`) se completa
   entera: qué cambia, cómo se probó, checklist de riesgo, migración, docs y rollback.
4. **Segunda lectura diferida** en cambios de riesgo alto: el autor vuelve a
   leer el diff completo **al menos 12 horas después** de su última
   modificación y lo deja anotado en el PR ("Segunda lectura: OK" o los
   cambios que surgieron). Mientras no haya un segundo revisor humano, esta es
   la revisión. La revisión hecha por un asistente de IA no la reemplaza.
5. **Schema:** solo por migración versionada (`prisma migrate dev`, carpeta
   commiteada). El drift guard del CI lo verifica. Nunca `db push`.
6. **Datos en producción:** solo por un script o SQL versionado, revisado en un
   PR, con backup previo y registrado en el log de deploys.
7. **Configuración del host y de cuentas SaaS:** se documenta en el PR que la
   motiva o, si no hay código, en el log de cambios de infraestructura del
   archivo privado (qué, por qué, cuándo, cómo se revierte).
8. **PR chicos.** Un PR de más de ~1.000 líneas de código no generado se parte,
   salvo motivo escrito en el PR.

## Deploy y versiones

- Producción se actualiza **solo** con `scripts/deploy.sh` desde el host (backup
  previo, smoke, rollback automático y log de deploys). Pasos y verificación:
  [runbook de deploy](../operacion/runbook-deploy.md).
- **Cada deploy corresponde a un tag anotado** en `main` con versión
  `vMAYOR.MENOR.PARCHE`: MAYOR si rompe compatibilidad para el cliente o exige
  pasos manuales; MENOR si agrega funcionalidad; PARCHE si corrige.
- El log de deploys guarda: fecha y hora, versión, operador, resultado, y si
  hubo rollback.
- Los cambios visibles para el cliente se comunican a las concesionarias antes
  o junto con el deploy.

## Cambio de emergencia (*break-glass*)

Solo si: producción está caída o degradada para los clientes, o hay un
incidente de seguridad activo, **y** el camino normal no está disponible
(por ejemplo, GitHub Actions caído) o la demora agrava el daño.

1. **Registrar el inicio** en el registro de incidentes: hora, motivo, qué se
   va a hacer.
2. **Backup previo** de la base (aunque sea el `pg_dump` manual del runbook).
3. **Cambio mínimo** que resuelve la urgencia. Nada de "ya que estoy".
4. **Smoke** completo y guardar su salida.
5. **PR retroactivo en menos de 24 horas** con la etiqueta `break-glass`:
   motivo, comandos exactos ejecutados, hora, salida del smoke y enlace al
   incidente. El CI tiene que pasar sobre ese PR; si falla, se corrige hacia
   adelante.
6. **Tag** de la versión resultante y entrada en el log de deploys.
7. **Revisión** en el post-mortem: por qué hizo falta y cómo evitarlo.

Un cambio por fuera del camino normal sin este registro es una no conformidad.

## Responsable

El autor del cambio cumple las reglas. El Responsable de seguridad revisa
mensualmente el log de deploys contra los PR y los tags.

## Evidencia que se guarda

Historial de PR (cuerpo, checks, comentarios de segunda lectura); tags; log de
deploys; PR `break-glass` con su incidente; log de cambios de infraestructura.

## Frecuencia de revisión

Política: anual. Cumplimiento: mensual (log de deploys contra PR y tags).

## Controles que cubre

ISO 27001:2022 6.3, A.8.32, A.8.9, A.8.31, A.5.37 · SOC 2 CC8.1, CC5.2, CC7.1.
