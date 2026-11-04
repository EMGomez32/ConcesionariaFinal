# Respaldo y continuidad

Versión 1.0 · Responsable: Operador de producción · Revisión: anual; simulacros trimestrales.

## Objetivo

Que una falla, un desastre o un ataque no haga perder más datos ni más tiempo
de servicio que lo definido, y que la recuperación esté probada.

## Alcance

Base de datos, archivos subidos, sesiones de WhatsApp, configuración y
secretos, host de producción, acceso administrativo, cuentas SaaS y el
conocimiento para operar.

## Qué se respalda

Detalle en [scripts/BACKUPS.md](../../scripts/BACKUPS.md).

| Activo | Cómo | Frecuencia | Retención |
|---|---|---|---|
| Base Postgres | `pg_dump` comprimido (`scripts/backup.sh`) | Diaria | 14 días (`BACKUP_RETENTION_DAYS`) |
| `uploads` y `wa-auth` | `tar` | Diaria | 14 días |
| Copia offsite de lo anterior | Solo archivos cifrados con `age` | Diaria | 14 días |
| `.env` y clave privada de `age` | Copia manual en el gestor de contraseñas | En cada cambio | Mientras estén vigentes |
| Código y configuración | GitHub (y clones locales) | Cada push | Indefinida |
| Backup previo a cada deploy | `scripts/deploy.sh` | Cada deploy | La que fije el script; como mínimo, hasta el siguiente deploy exitoso |

**Reglas**

1. Los backups salen cifrados con `age`. La clave privada nunca está en el host.
2. Hay copia **fuera del host** (offsite) además de la local.
3. Un backup que no se restauró no cuenta como probado: simulacro mensual con
   `scripts/restore-drill.sh`.
4. `db-backup` en `unhealthy` (último backup completo de más de 26 h) se atiende
   el mismo día.

## Objetivos de recuperación

| | Hoy | Objetivo |
|---|---|---|
| **RPO** (datos que se pueden perder) | Hasta 24 h (un backup diario) | > Pendiente de decisión del dueño: propuesta ≤ 24 h ahora; ≤ 1 h antes de comprometer un SLA (archivado continuo o backups más frecuentes) |
| **RTO** (tiempo hasta volver a dar servicio) | No medido: se mide en el primer simulacro de reconstrucción | > Pendiente de decisión del dueño: propuesta 8 horas hábiles para reconstruir en otro host |

Ningún objetivo de esta tabla es un compromiso contractual mientras no figure
en un contrato firmado.

## Escenarios

| Escenario | Respuesta | Runbook |
|---|---|---|
| Error de datos (borrado o modificación indebida) | Corregir con un script si es acotado; si no, restaurar el último backup en una base aparte y recuperar solo lo necesario | [Restauración](../operacion/runbook-restauracion.md) §2 |
| Falla del disco | Disco nuevo o host nuevo; restaurar desde el offsite | [Restauración](../operacion/runbook-restauracion.md) §4 |
| Falla, robo o compromiso del host | Reconstruir en otro host desde cero; rotar secretos si hubo compromiso | [Restauración](../operacion/runbook-restauracion.md) §4, [incidentes](../operacion/runbook-incidentes.md) |
| Corte del proveedor de internet o de energía del host | Esperar si se estima corto; si supera el RTO, reconstruir en otro host | [Restauración](../operacion/runbook-restauracion.md) §4 |
| Caída de Cloudflare | Esperar al proveedor; avisar a las concesionarias. No se expone el host directo a internet como atajo | [Incidentes](../operacion/runbook-incidentes.md) §A |
| Pérdida del acceso administrativo (SSH o red de administración) | Segundo camino de acceso y reautenticación desde el host | [Incidentes](../operacion/runbook-incidentes.md) §D |
| Pérdida de credenciales (gestor de contraseñas, clave de `age`, 2FA) | Acceso de emergencia del gestor; segunda clave de `age`; códigos de recuperación | Abajo |
| Ausencia prolongada del operador | Sobre de emergencia (abajo) | Abajo |
| Baneo de un número de WhatsApp o corte de una integración | La concesionaria sigue operando sin el canal; se comunica y se revincula otro número | [Alta de concesionaria](../operacion/runbook-alta-de-concesionaria.md) §4 |

**Credenciales críticas**

- El gestor de contraseñas tiene un **acceso de emergencia** configurado y probado.
- La clave privada de `age` tiene una **segunda clave** (otro dispositivo u otra
  persona de confianza) como destinatario adicional de los backups.
- Los códigos de recuperación del 2FA de las cuentas críticas están en el gestor.

**Sobre de emergencia (continuidad del conocimiento)**

Un documento sellado en poder de una persona de confianza, con: cómo acceder al
gestor de contraseñas en caso de emergencia, a quién avisar (concesionarias,
socios) y dónde están los runbooks (este repo). No contiene secretos en claro.
> Pendiente de decisión del dueño: designar a la persona de confianza.

## Simulacro trimestral

Cada trimestre se elige **un escenario** de la tabla y se ensaya de punta a
punta (al menos una vez por año: la reconstrucción completa en otro host). Se
registra en el archivo privado:

```markdown
### Simulacro <AAAA-MM-DD>: <escenario>
- Participantes:
- Backup usado (fecha) y antigüedad (RPO observado):
- Inicio / fin (RTO observado):
- Pasos ejecutados (enlace al runbook) y desvíos:
- Resultado: OK / parcial / falló
- Lo que no funcionó y PR con la corrección del runbook:
```

## Responsable

Operador de producción. La Dirección revisa los resultados en la revisión por la dirección.

## Evidencia que se guarda

`restore-drill.log` mensual; informes de simulacros trimestrales con RPO y RTO
observados; prueba del acceso de emergencia del gestor.

## Frecuencia de revisión

Anual, y después de cada simulacro fallido o desastre real.

## Controles que cubre

ISO 27001:2022 A.5.29, A.5.30, A.8.13, A.8.14, A.7.11 · ISO 27701 6.9.3.1 · SOC 2 A1.2, A1.3, CC9.1, CC7.5.
