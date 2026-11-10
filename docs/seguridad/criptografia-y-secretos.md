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
| Secretos de integraciones, tokens de Mercado Libre y secretos TOTP | AES-256-GCM, IV aleatorio, formato versionado (`enc:v2`) con AAD que ata cada valor a su fila y campo, e identificador de clave (`kid`) para rotar | `BackConcesionaria/src/infrastructure/security/secretBox.ts` |
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
| `INTEGRACIONES_SECRET_KEY` (y, durante una rotación, `INTEGRACIONES_SECRET_KEYS_ANTERIORES`) | `.env` | Gestor, **también las claves retiradas** mientras haya backups cifrados con ellas (sin la clave con que se cifró no se descifran integraciones ni 2FA de un dump) |
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
| `INTEGRACIONES_SECRET_KEY` | Cada 2 años (procedimiento de abajo; no hace falta re-vincular nada) | Salga una persona con acceso al `.env`, o haya sospecha de que se filtró (en ese caso, además, rotar en origen los secretos que protege: ver el runbook de incidentes) |
| Clave de `age` | Cada 2 años | Se sospeche de la privada |
| Llaves SSH | Al cambiar de equipo | Se pierda o se comparta un equipo |
| Tokens de cuentas SaaS | Con vencimiento de 1 año como máximo | — |

Pasos para cada secreto: [runbook de incidentes](../operacion/runbook-incidentes.md), sección C.

### Rotación de `INTEGRACIONES_SECRET_KEY`

Cómo funciona: cada secreto se guarda como `enc:v2:<kid>:<iv>:<tag>:<ct>`. El
`kid` son los primeros 8 caracteres hex del SHA-256 de la clave: dice con qué
clave se cifró sin revelarla. `INTEGRACIONES_SECRET_KEY` es la clave **actual**,
la única con la que se cifra; `INTEGRACIONES_SECRET_KEYS_ANTERIORES` (lista
separada por comas) son claves viejas que solo sirven para **leer** lo que todavía
no se re-cifró. El backend loguea al arrancar el `kid` de la actual y de las
anteriores (`[cifrado] …`), nunca las claves.

Cada valor está atado a su lugar con datos autenticados (AAD) de la forma
`<tabla>:<id>:<campo>` (`usuarios:<id>:totp_secret`,
`integraciones_canal:<id>:config.<campo>`, `mercadolibre_cuentas:<id>:access_token`
o `refresh_token`): un valor copiado a otra fila u otro campo no se descifra, falla.
Los valores del formato anterior (`enc:v1`, sin AAD) y los que quedaron en claro
se siguen leyendo, y pasan a v2 al volver a guardarse o con el script de abajo.

Pasos (en el host, sin mostrar las claves en pantalla):

1. Generar la clave nueva: `openssl rand -hex 32`. Guardarla en el gestor de
   contraseñas **antes** de tocar el `.env`.
2. En el `.env` de la raíz: la clave actual pasa a
   `INTEGRACIONES_SECRET_KEYS_ANTERIORES` (si ya había otras, se agrega con una
   coma) y la nueva va en `INTEGRACIONES_SECRET_KEY`.
3. Deploy: `docker compose up -d backend`. En el log de arranque tiene que
   aparecer el `kid` nuevo como actual y el viejo como anterior. Desde acá todo lo
   que se guarda sale con la clave nueva y lo viejo se sigue leyendo.
4. Simulación del re-cifrado:
   `docker compose exec -T backend npm run recifrar-secretos </dev/null`.
   Lista cuántos secretos hay por lugar y por versión/`kid`, y los ilegibles. No
   modifica nada ni imprime ningún secreto.
5. Aplicar: `docker compose exec -T backend npm run recifrar-secretos -- --apply </dev/null`.
   Termina con «verificado: todo está en v2 con la clave …» si no quedó nada viejo.
   Es idempotente: se puede repetir.
6. Si la salida dice que hay ilegibles o que quedan secretos a re-cifrar, **no se
   saca ninguna clave**: se revisa el motivo (un ilegible con `kid_desconocido` es
   una clave que falta en `ANTERIORES`) y se repite el paso 5.
7. Con la verificación en cero, sacar la clave vieja de
   `INTEGRACIONES_SECRET_KEYS_ANTERIORES` y volver a hacer `docker compose up -d backend`.
8. **No borrar la clave vieja del gestor** mientras existan backups tomados antes
   de la rotación: esos dumps traen los secretos cifrados con ella (igual que la
   clave de `age`). Anotar en el registro de rotaciones la fecha y los `kid`.

Qué pasa si algo sale mal:

- Si se saca una clave de `ANTERIORES` antes de tiempo, lo cifrado con ella falla
  cerrado (no se manda a Meta, Mercado Libre ni IMAP, y el login con 2FA de esos
  usuarios da error): se vuelve a poner la clave y se repite desde el paso 3. Las
  cuentas de Mercado Libre no se desactivan por esto.
- Volver a una imagen del backend anterior a este formato (rollback) deja
  ilegible todo lo que se haya guardado en v2 desde el deploy: las versiones viejas
  no conocen `enc:v2`. Si hace falta volver atrás, contar con re-vincular las
  integraciones tocadas y con resetear el 2FA de los usuarios que lo configuraron
  en el medio (`scripts/reset-2fa.ts`).

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
