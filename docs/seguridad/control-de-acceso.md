# Control de acceso

Versión 1.0 · Responsable: Responsable de seguridad · Revisión: anual; accesos cada trimestre.

## Objetivo

Que cada persona, proceso y token tenga solo el acceso que necesita, que se
pueda atribuir cada acción a alguien y que los accesos que sobran se detecten
y se quiten.

## Alcance

Cuentas de la aplicación, infraestructura de producción, repositorio y CI,
cuentas SaaS y gestor de contraseñas.

## Reglas generales

1. **Una persona, una cuenta.** No hay cuentas compartidas ni genéricas con
   privilegios. Toda cuenta privilegiada es nominal.
2. **2FA en todo lo que lo permita.** Preferencia: llave física o app TOTP. SMS
   solo si no hay otra opción.
3. **Alta con pedido y baja el mismo día** en que termina la necesidad ([personas](personas.md)).
4. **Mínimo privilegio** y por tiempo acotado cuando el acceso es excepcional.
5. **Credenciales en el gestor de contraseñas**, nunca en archivos sueltos,
   chats ni carpetas sincronizadas.

## Aplicación AUTENZA

**Autenticación**

- Contraseñas de 10+ caracteres con lista de contraseñas comunes
  (`BackConcesionaria/src/interface/validation/password.ts`), guardadas con bcrypt.
- Bloqueo por intentos fallidos por IP+cuenta y por cuenta
  (`BackConcesionaria/src/interface/middlewares/rateLimiters.ts`).
- **2FA obligatorio** para `admin` y `super_admin`. Los roles exigidos los fija
  `MFA_REQUIRED_ROLES` (`BackConcesionaria/src/infrastructure/security/mfaPolicy.ts`).
  `MFA_REQUIRED_ROLES=none` es un escape de emergencia: se usa minutos, se
  registra como incidente y se revierte.
- Sesión: access token de 15 minutos; refresh de 7 días con rotación y
  detección de reuso. Además, cada sesión vence a los `SESION_MAX_DIAS` (30 por
  defecto) desde el login aunque se renueve todos los días. En la web el refresh
  vive sólo en la cookie httpOnly: nunca llega al JavaScript de la página. Cambiar
  la contraseña o el email, o desactivar la cuenta, cierra las demás sesiones.

**Autorización por rol**

Criterio: quien hace el trabajo lo registra; **anular y cancelar es del administrador**.

| Rol | Puede |
|---|---|
| `super_admin` | Cuenta de **plataforma**: alta y mantenimiento de concesionarias, sucursales y usuarios. Cruza tenants. |
| `admin` | Todo dentro de su concesionaria, incluidas anulaciones, usuarios, integraciones y auditoría. |
| `vendedor` | Su cartera, atenciones, presupuestos, reservas, ventas, tasaciones y bandejas de consultas. |
| `cobrador` | Financiación propia: cuotas, cobranzas y refinanciación. |
| `postventa` | Casos de postventa y movimientos de unidades. |
| `tasador` | Solo tasaciones. |
| `lectura` | Consulta; no modifica nada. |

- La matriz exacta es la del código: `authorize(...)` en
  `BackConcesionaria/src/interface/routes/`. El test centinela
  `tests/integration/permisos-mutaciones.test.ts` falla si aparece una ruta que
  modifica datos sin `authorize`. El menú del front es comodidad, no control.
- Nadie puede asignarse ni asignar `super_admin` desde un tenant
  (`BackConcesionaria/src/infrastructure/security/usuarioPolicy.ts`).
- El tenant de un usuario nuevo sale de la sesión, nunca del body.

**Acceso de AUTENZA a los datos de una concesionaria**

- `super_admin` entra a datos de una concesionaria **solo** para atender un
  pedido de soporte de esa concesionaria, por el tiempo que haga falta. El
  pedido (quién, qué, cuándo) se guarda con el registro de soporte.
- Sus escrituras quedan en `security_events`.
- El número de cuentas `super_admin` es el mínimo: una por persona de AUTENZA
  que la necesite.

**Cuentas de demostración**

- Viven en un tenant de demostración, nunca en el de un cliente.
- Contraseña aleatoria y fuera del repo; se desactivan entre demos.
- En un entorno al que llega un cliente real, no hay cuentas demo activas con
  contraseñas publicadas.

## Infraestructura

- **SSH solo con llave**, sin login por contraseña ni de `root`. Una llave por
  persona y por equipo, con un comentario que identifique a quién pertenece.
- El acceso administrativo al host entra solo por la red de administración. Sus
  ACL limitan qué equipos llegan al host.
- `sudo` pide contraseña. La cuenta del operador no se comparte.
- Llaves de herramientas automatizadas o de asistentes de IA: solo con
  restricción de comando o de origen, inventariadas, revisadas cada trimestre y
  revocables sin tocar las del humano.
- La base y Prisma Studio solo escuchan en loopback; se llega por túnel SSH.
- Endurecimiento y evidencia del host: `scripts/hardening/pi-host-hardening.sh` y
  `scripts/hardening/verify-host.sh` ([seguridad del host](seguridad-fisica-y-del-host.md)).

## Repositorio y CI

- Rama `main` protegida: sin push directo, sin force push, checks requeridos,
  reglas aplicadas también a administradores ([gestión de cambios](gestion-de-cambios.md)).
- Secret scanning y push protection activados.
- El token de Actions tiene `contents: read` por defecto (`.github/workflows/ci.yml`).
- Tokens personales con vencimiento y permisos mínimos.

## Revisión trimestral de accesos

En enero, abril, julio y octubre. Se completa esta checklist, se firma y se
guarda en el archivo privado de evidencias. Cada hallazgo se corrige o se
registra como riesgo.

- [ ] **GitHub:** colaboradores y sus permisos; llaves de deploy; apps OAuth y
      GitHub Apps instaladas; tokens personales vigentes; secrets de Actions;
      protección de `main`; 2FA obligatorio.
- [ ] **Cloudflare:** miembros de la cuenta y sus roles; tokens de API; túneles y
      sus rutas publicadas (cada ruta tiene un propósito vigente y ninguna expone
      un panel de administración); tokens del bucket de backups; 2FA.
- [ ] **Red de administración:** dispositivos autorizados; ACL; vencimiento de las
      llaves de nodo (que no venza la del servidor sin aviso); 2FA.
- [ ] **Llaves SSH:** `authorized_keys` del host contra el inventario; borrar las
      que no tienen dueño o propósito vigente.
- [ ] **Cuentas del host:** usuarios con shell, miembros de `sudo` y de `docker`.
- [ ] **`super_admin` de la app:** lista completa, cada una nominal y con 2FA activo.
- [ ] **`admin` de cada concesionaria:** activos y con 2FA; pedir a cada
      concesionaria que confirme su lista de usuarios activos.
- [ ] **Cuentas demo:** solo en el tenant de demostración, desactivadas o con
      contraseña rotada, ninguna con una contraseña que figure en el repo.
- [ ] **SMTP, Mercado Libre, Meta, Expo, registrador del dominio, servicio de
      alertas, asistentes de IA:** miembros, claves de API vigentes, 2FA.
- [ ] **Gestor de contraseñas:** quién tiene acceso a la bóveda de AUTENZA; acceso
      de emergencia configurado y probado.
- [ ] **Segundo camino de acceso** al host probado en el trimestre.

## Responsable

Responsable de seguridad. La Dirección firma la checklist.

## Evidencia que se guarda

Checklist trimestral firmada con fecha, hallazgos y acciones; exportes o
capturas de las listas de miembros; registro de pedidos de soporte con acceso
a datos de una concesionaria.

## Frecuencia de revisión

Política: anual. Accesos: trimestral y ante cada baja de una persona.

## Controles que cubre

ISO 27001:2022 A.5.15, A.5.16, A.5.17, A.5.18, A.8.2, A.8.3, A.8.4, A.8.5 ·
ISO 27701 6.6.2.1, 6.6.2.2, 6.6.4.2, B.8.2.2 · SOC 2 CC6.1, CC6.2, CC6.3, CC6.6.
