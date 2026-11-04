# Onboarding de desarrollo

Para una persona nueva en el código (colaborador, equipo de un licenciatario o
comprador). Primero firmá el NDA y recibí tus accesos según [personas](../seguridad/personas.md).

## Día 1: entorno

1. **Equipo:** disco cifrado, sistema actualizado, bloqueo de pantalla, gestor
   de contraseñas y 2FA en GitHub. El repo va **fuera** de carpetas sincronizadas.
2. **Herramientas:** Node 22, npm, Docker, Git. En Windows, Git Bash para los
   scripts de shell.
3. **Levantá el monorepo** con el [README de la raíz](../../README.md): base
   descartable, backend, frontend y, si vas a tocar la app, la app móvil
   apuntando a tu backend local.
4. **Corré los tests** de integración con la receta del README. Si pasan en tu
   máquina, tu entorno está bien.

Nunca vas a necesitar datos de producción para desarrollar. Si creés que sí,
pedí un dataset sintético.

## Día 2: el código

Leé, en este orden:

1. [Arquitectura](arquitectura.md): capas, multi-tenant, autenticación, workers.
2. [PRODUCT.md](../../PRODUCT.md): roles y flujo del negocio.
3. `BackConcesionaria/src/infrastructure/database/prisma.extension.ts` y
   `prisma/init-rls.ts`: cómo se aísla cada concesionaria.
4. `BackConcesionaria/src/interface/middlewares/authorize.middleware.ts` y
   `tests/integration/permisos-mutaciones.test.ts`: quién puede qué.
5. Un caso de uso de plata de punta a punta, por ejemplo el cobro de cuota
   (`src/application/use-cases/financiaciones/` y `src/domain/services/pagoCuota.ts`).
6. [Desarrollo seguro](../seguridad/desarrollo-seguro.md) y
   [gestión de cambios](../seguridad/gestion-de-cambios.md).

## Cómo se trabaja

- Rama por cambio desde `main` (`feat/...`, `fix/...`, `docs/...`).
- Commits convencionales en castellano: `fix(ventas): ...`, `docs(seguridad): ...`.
- PR con la plantilla completa. Nada entra a `main` sin PR y sin el CI en verde.
- Schema: solo con `prisma migrate dev` y la migración commiteada. Nunca `db push`.
- Rutas nuevas: `authorize(...)` y schema Zod siempre. Tablas nuevas con datos de
  un tenant: `TENANT_TABLES` en `prisma/init-rls.ts`.
- UI: tokens y componentes de [DESIGN.md](../../DESIGN.md); textos en castellano
  rioplatense; no romper los atributos `data-tour`.
- Asistentes de IA: permitidos con las reglas de
  [uso aceptable e IA](../seguridad/uso-aceptable-y-ia.md). Nunca les pegues
  secretos ni datos personales reales.

## Gotchas del entorno local

- **Rate limit en tests:** el backend tiene que correr con `NODE_ENV=test` o la
  suite empieza a recibir 429.
- **`ts-node-dev` no relee el `.env`:** reiniciá el proceso a mano después de editarlo.
- **Procesos zombi en Windows:** matar el shell no mata `node.exe`. Si el puerto
  queda tomado, `netstat -ano` para ver el PID y `taskkill //PID <pid> //F`.
  Usá un puerto nuevo por corrida si dudás.
- **Drift guard:** la forma correcta es
  `npx prisma migrate diff --from-schema prisma/schema.prisma --to-config-datasource --exit-code`.
  Variantes con flags viejos imprimen la ayuda y salen con 0: un falso verde.
- **Nunca** `migrate diff --from-migrations` sin una shadow DB descartable: resetea la base apuntada.
- **Contenedores viejos** de otros proyectos con `restart: always` pueden tomar
  los puertos 80, 3000 o 5432 al arrancar Docker. Usá puertos propios.
- `docker-compose.yml` es el stack de **producción**: no publica el backend y no
  sirve para los tests de integración.

## Accesos que vas a recibir

| Acceso | Cuándo |
|---|---|
| Repositorio (escritura por PR) | Día 1 |
| Tenant de demostración (usuario por rol) | Día 1 |
| CI (lectura de corridas) | Día 1 |
| Producción | Solo si tu rol lo requiere, por escrito, con llave SSH propia y revisión trimestral |

Al irte, todos se revocan el mismo día ([personas](../seguridad/personas.md)).
