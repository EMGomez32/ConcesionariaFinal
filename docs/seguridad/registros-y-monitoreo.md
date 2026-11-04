# Registros y monitoreo

Versión 1.0 · Responsable: Responsable de seguridad · Revisión: anual.

## Objetivo

Registrar lo necesario para detectar abusos, investigar incidentes y demostrar
quién hizo qué, sin acumular datos personales de más; y enterarse a tiempo
cuando algo falla.

## Alcance

Aplicación, base de datos, contenedores, host, backups, CI y cuentas SaaS.

## Qué se registra

| Registro | Contenido | Dónde | Protección |
|---|---|---|---|
| `audit_log` | Acciones de negocio por tenant: alta, modificación, anulación, borrado, refinanciación, login, logout, login fallido, recuperación de contraseña; usuario, IP, user-agent | Base de datos | Append-only para `app_rw` (`BackConcesionaria/prisma/setup-app-role.ts`) |
| `security_events` | Lo que no tiene tenant: escrituras de `super_admin`, rachas de login fallido, escapes de emergencia (`scripts/reset-2fa.ts`); el email se guarda como hash | Base de datos | Append-only para `app_rw` |
| Log de la aplicación | JSON con correlationId; requests con la query redactada (`requestLogger.middleware.ts`); errores | stdout del contenedor → Docker | Rotación por tamaño (`docker-compose.yml`, 5 × 10 MB por servicio) |
| Log de nginx | Accesos al front y a la API | stdout del contenedor | Igual |
| Backups | Resultado de cada corrida; marca del último backup completo | Logs de `db-backup`, healthcheck | Volumen `backups` |
| Simulacros de restore | Fecha y resultado | `scripts/restore-drill.log` (fuera de git) → archivo privado | — |
| Deploys | Fecha, versión, operador, resultado, rollback | Log de deploys de `scripts/deploy.sh` | Host → archivo privado |
| Host | Accesos SSH, `sudo`, bloqueos de fail2ban, actualizaciones | journal y logs del sistema | Solo lectura para el operador |
| CI y repositorio | Corridas, cambios de configuración, alertas de seguridad | GitHub | Retención de GitHub |
| Cuentas SaaS | Logs de auditoría de cada proveedor | Paneles de Cloudflare, GitHub, red de administración | Retención del proveedor |

**Reglas de contenido**

1. No se registran contraseñas, tokens, secretos, códigos 2FA ni el contenido de
   documentos. Los emails en logs van enmascarados.
2. Los datos personales en registros se minimizan: preferir ids a nombres.
3. Los relojes se sincronizan por NTP y el host usa la zona horaria de
   Argentina, para que los registros se puedan correlacionar.
4. Nadie puede borrar ni modificar `audit_log` o `security_events` desde la aplicación.

## Retención

| Registro | Plazo |
|---|---|
| `audit_log` | > Pendiente de decisión del dueño: propuesta 5 años (necesidad probatoria de operaciones de plata), con la IP truncada pasados 12 meses |
| `security_events` | > Pendiente de decisión del dueño: propuesta 2 años |
| Logs de contenedores | Objetivo: 30 días por tiempo, además del límite por tamaño |
| Log de deploys, simulacros, revisiones | 5 años en el archivo privado |

La purga de registros de la base sigue la [política de retención](../privacidad/politica-de-retencion.md).

## Alertas

| Qué | Cómo avisa | Quién la atiende |
|---|---|---|
| Eventos de seguridad (fuerza bruta, acciones sensibles de `super_admin`, escapes de emergencia) | Webhook `SECURITY_ALERT_WEBHOOK_URL` | Responsable de seguridad |
| Fallo de backup | `BACKUP_ALERT_CMD`; además `db-backup` queda `unhealthy` si el último backup completo tiene más de 26 h | Operador |
| Caída del servicio | Monitor externo de `/api/health` (`.github/workflows/uptime.yml`) | Operador |
| Dependencias y código vulnerable | Dependabot y CodeQL (notificaciones de GitHub) | Responsable de seguridad |
| Secreto commiteado | Push protection y escaneo de secretos | Responsable de seguridad |

**Reglas**

1. Toda alerta llega a un canal que el dueño mira a diario.
2. Una alerta de seguridad se mira el mismo día; si indica un incidente, se
   abre el registro ([gestión de incidentes](gestion-de-incidentes.md)).
3. Una alerta que se dispara sin motivo se corrige, no se silencia.
4. Cada trimestre se prueba que las alertas llegan (backup forzado a fallar,
   evento de prueba).

## Revisión

- **Mensual (15 min):** `security_events` del mes (logins fallidos, acciones de
  plataforma, escapes) y anulaciones en `audit_log`. Se anota qué se vio.
- **En cada incidente:** exportar los registros relevantes con hash al archivo
  privado antes de que roten.

## Responsable

Responsable de seguridad.

## Evidencia que se guarda

Notas de la revisión mensual; pruebas trimestrales de alertas; exportes de
registros por incidente.

## Frecuencia de revisión

Anual.

## Controles que cubre

ISO 27001:2022 A.8.15, A.8.16, A.8.17, A.5.28, A.8.12 · ISO 27701 6.9.4.1, 6.9.4.2 ·
SOC 2 CC7.2, CC7.3, CC4.1, A1.1.
