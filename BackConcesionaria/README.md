# BackConcesionaria — API de AUTENZA

API REST de AUTENZA: Node 22, Express 5, Prisma 7 y PostgreSQL 16. Cómo levantar
todo el monorepo y correr los tests: [README de la raíz](../README.md).
Arquitectura: [docs/operacion/arquitectura.md](../docs/operacion/arquitectura.md).

## Estructura

```
src/
  domain/           entidades, excepciones, servicios puros (máquinas de estado, cobro de cuota)
  application/      casos de uso (use-cases/) y servicios de aplicación (services/)
  infrastructure/   Prisma y repositorios, seguridad, email, integraciones, workers, storage
  interface/        rutas, controllers, middlewares (auth, authorize, rate limit) y schemas Zod
  config/env.ts     validación de variables de entorno (el arranque falla si falta algo)
prisma/
  schema.prisma     modelo de datos
  migrations/       migraciones versionadas (fuente de verdad del schema)
  init-rls.ts       policies de RLS y triggers (idempotente, corre en cada arranque)
  setup-app-role.ts crea o actualiza el rol de runtime app_rw (idempotente)
  seed.ts           admin inicial (una sola vez, por variables SEED_*)
  seed-ci.ts        bootstrap mínimo para los tests de integración (se niega a correr en prod
                    y no va en la imagen de producción)
  seed-demo.ts      datos de demostración
scripts/            utilidades de operación (ver abajo)
tests/unit          unitarios puros (sin base)
tests/integration   integración por HTTP contra un backend real y un Postgres descartable
dist/               salida de `tsc` (src/); la corre `npm start`
dist-ops/           prisma/*.ts y scripts/*.ts compilados (tsconfig.ops.json); los corre la imagen
```

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor con recarga (`ts-node-dev`). No recarga al editar `.env`: reiniciá a mano. |
| `npm run build` | Compila `src/` a `dist/` y los scripts de operación a `dist-ops/`. |
| `npm start` | Corre `dist/server.js`. |
| `npm run test:unit` | Unitarios. |
| `npm run test:integration` | Integración (necesita el backend levantado con `NODE_ENV=test`). |
| `npm run init-rls` | Aplica RLS y triggers. |
| `npm run setup-app-role` | Crea o actualiza el rol `app_rw` (requiere `APP_DB_PASSWORD`). |
| `npm run seed` / `seed-ci` / `seed-demo` | Seeds (ver arriba). |
| `npm run retencion` | Política de retención; simula salvo `-- --apply`. |
| `npm run sync:infoauto` | Sincroniza el catálogo de marcas y modelos. |

`init-rls`, `setup-app-role`, `seed*`, `retencion` y `sync:infoauto` corren el JS
compilado, igual que dentro de la imagen de producción (que no trae ts-node ni
typescript): necesitan un `npm run build` antes. En desarrollo, sin compilar,
cada uno tiene su variante con ts-node: `npm run init-rls:dev`, `seed:dev`,
`seed-demo:dev`, `retencion:dev`, etc.

## Cambios de schema

El schema cambia **solo con migraciones**. No se usa `prisma db push`.

1. Editá `prisma/schema.prisma`.
2. `npx prisma migrate dev --name <descripcion>` contra tu base local.
3. Commiteá la carpeta nueva de `prisma/migrations/` junto con el cambio.
4. Producción la aplica en el arranque con `prisma migrate deploy`.

El CI tiene un *drift guard* que falla si el schema cambió sin migración. Si
agregás una tabla con datos de un tenant, sumala a `TENANT_TABLES` en
`prisma/init-rls.ts`: las migraciones no crean RLS. Más reglas en
[docs/operacion/runbook-deploy.md](../docs/operacion/runbook-deploy.md).

## Reglas que no se negocian

- Toda ruta que muta lleva `authorize(...)`. El test centinela
  `tests/integration/permisos-mutaciones.test.ts` falla si falta.
- Todo body se valida con un schema Zod (`src/interface/validation/`).
- Los caminos con `rawPrisma` o `$queryRaw` no pasan por la extensión de tenant:
  usá `withTenantTransaction` o, solo para credenciales y plataforma,
  `withAuthBypass` (`src/infrastructure/database/unitOfWork.ts`), y filtrá el
  tenant explícito.
- Una variable de entorno nueva se agrega en dos lugares: el bloque
  `environment:` del `docker-compose.yml` y el `.env.example` de la raíz. El
  contenedor no ve `BackConcesionaria/.env`.

## Scripts de operación

En producción se corren compilados, dentro del contenedor:
`docker compose exec -T backend node dist-ops/scripts/<script>.js ... </dev/null`.
En local, sin compilar: `npx ts-node scripts/<script>.ts ...`.

| Script | Uso |
|---|---|
| `scripts/reset-2fa.ts` | Apaga el 2FA de una cuenta (escape de emergencia; deja constancia en `security_events`). `node dist-ops/scripts/reset-2fa.js <email>` |
| `scripts/set-password.ts` | Cambia la contraseña o desactiva un usuario (`USER_EMAIL`, `USER_PASSWORD` o `USER_DEACTIVATE=true` por entorno). `node dist-ops/scripts/set-password.js` |
| `scripts/auditar-uploads.ts` | Revisa, en solo lectura, que los archivos subidos sean lo que dicen ser. `node dist-ops/scripts/auditar-uploads.js [directorio]` |
| `scripts/migrar-documentos-vehiculos.ts` | Mueve los documentos de vehículos a la zona privada (simula salvo `--aplicar`). `node dist-ops/scripts/migrar-documentos-vehiculos.js` |
| `scripts/debug/` | Diagnóstico local. No correr contra producción (no se compila ni va a la imagen). |

Las colecciones de Postman y `__legacy_tests__/` son históricas y no se mantienen.
