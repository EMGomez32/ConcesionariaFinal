# Criptografía y secretos

Versión 1.0 · Responsable: Custodio de secretos · Revisión: anual.

## Objetivo

Proteger con criptografía adecuada los datos en tránsito, los datos sensibles
en reposo y los backups, y manejar los secretos de forma que una filtración se
detecte y se contenga.

## Alcance

Secretos de producción, de CI y de cuentas SaaS; algoritmos usados por la
aplicación; cifrado de backups y de equipos.

## Algoritmos y usos

| Uso | Mecanismo | Dónde |
|---|---|---|
| Tránsito público | TLS en el borde de Cloudflare; HSTS de un año | `FrontConcesionaria/nginx.conf` |
| Contraseñas de usuarios | bcrypt | `BackConcesionaria/src/application/use-cases/auth/Login.ts`, `use-cases/usuarios/` |
| Tokens de sesión | JWT HS256 con algoritmo fijado | `BackConcesionaria/src/infrastructure/security/jwtOptions.ts` |
| Refresh, reset y códigos de recuperación | Se guarda solo el hash | Repositorios de auth |
| Secretos de integraciones y secretos TOTP | AES-256-GCM, IV aleatorio, formato versionado | `BackConcesionaria/src/infrastructure/security/secretBox.ts` |
| Claves derivadas (MFA, URL firmada, `state` de OAuth) | HMAC con etiqueta de propósito | `mfaToken.ts`, `urlFirmada.ts`, `mlOauthState.ts` |
| Webhooks de Meta | HMAC-SHA256 sobre el body, comparación en tiempo constante | `BackConcesionaria/src/infrastructure/integraciones/metaWebhook.ts` |
| Backups | `age` (clave pública en el host, privada fuera) | `scripts/backup.sh`, [BACKUPS.md](../../scripts/BACKUPS.md) |

Reglas: no se inventa criptografía; no se usan MD5, SHA-1 ni modos sin
autenticación para proteger datos; los números aleatorios salen de
`crypto.randomBytes` o equivalente.

## Dónde viven los secretos

| Secreto | Dónde | Copia de resguardo |
|---|---|---|
| `JWT_SECRET`, `JWT_REFRESH_SECRET` | `.env` de la raíz en el host | Gestor de contraseñas |
| `POSTGRES_PASSWORD`, `APP_DB_PASSWORD` / `APP_DATABASE_URL` | `.env` | Gestor |
| `INTEGRACIONES_SECRET_KEY` | `.env` | Gestor (sin ella no se descifran integraciones ni 2FA de un dump) |
| `SMTP_PASS`, `ML_CLIENT_SECRET` | `.env` | Gestor y panel del proveedor |
| Credenciales del offsite | `.env` | Gestor |
| `SECURITY_ALERT_WEBHOOK_URL`, `BACKUP_ALERT_CMD` | `.env` | Gestor |
| Clave privada de `age` | **Solo** gestor de contraseñas (y una segunda clave de respaldo de otra persona o dispositivo) | — |
| Credenciales del túnel | Host (servicio del túnel) | Se pueden regenerar desde Cloudflare |
| Llaves SSH privadas | Equipo de cada persona, con passphrase | No se copian |
| Códigos de recuperación de 2FA (app y SaaS) | Gestor de contraseñas | — |
| Secrets del CI | Solo valores de prueba, en `.github/workflows/ci.yml`; ningún secreto de producción | — |

**Reglas**

1. El `.env` de producción tiene permisos `600` y nunca sale del host salvo a
   la copia del gestor. Nunca se versiona (`.gitignore`), nunca se pega en un
   chat, issue, PR, ticket o asistente de IA, y nunca va a una carpeta sincronizada.
2. `.env.example` lleva los nombres y placeholders, jamás valores reales.
3. Los secretos se generan en el host o en el gestor (`openssl rand`) y no se
   muestran en pantalla más de lo necesario.
4. En producción, el arranque falla si faltan los secretos obligatorios o si
   tienen valores de desarrollo conocidos (`BackConcesionaria/src/config/env.ts`).
5. Los backups del `.env` que dejan las rotaciones (`.env.bak.*`) se borran una
   vez verificado el cambio.

## Rotación

| Secreto | Frecuencia | Además, siempre que |
|---|---|---|
| JWT | Anual (`scripts/rotate-secrets.sh`) | Haya sospecha de robo de sesiones |
| Contraseñas de base | Anual | Salga una persona con acceso al host |
| SMTP, Mercado Libre, offsite, alertas | Anual | El proveedor avise de un incidente |
| `INTEGRACIONES_SECRET_KEY` | Solo ante compromiso (rotarla exige re-vincular integraciones y reconfigurar el 2FA) | — |
| Clave de `age` | Cada 2 años | Se sospeche de la privada |
| Llaves SSH | Al cambiar de equipo | Se pierda o se comparta un equipo |
| Tokens de cuentas SaaS | Con vencimiento de 1 año como máximo | — |

Pasos para cada secreto: [runbook de incidentes](../operacion/runbook-incidentes.md), sección C.

## Ante una filtración

1. Un secreto que estuvo fuera de su lugar **se considera comprometido**,
   aunque se haya borrado (chat, commit, log, captura, carpeta sincronizada).
2. Se rota en origen enseguida y se redeploya.
3. Se revisa si se usó: logs del proveedor, `audit_log`, `security_events`.
4. Si estuvo en git: se rota igual; reescribir el historial es opcional y no
   reemplaza la rotación.
5. Se registra como incidente.

## Equipos y medios

- Disco cifrado en los equipos de desarrollo y en todo medio con datos de
  producción o backups.
- Backups siempre cifrados antes de salir del host; el offsite solo recibe
  archivos `.age`.

## Responsable

Custodio de secretos.

## Evidencia que se guarda

Registro de rotaciones (secreto, fecha, motivo, sin valores); incidentes de
filtración; checklist trimestral de accesos.

## Frecuencia de revisión

Anual.

## Controles que cubre

ISO 27001:2022 A.8.24, A.5.17, A.8.5, A.5.33, A.8.13 · ISO 27701 6.7.1.1 · SOC 2 CC6.1, CC6.7, C1.1.
