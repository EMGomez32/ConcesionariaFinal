# AUTENZA

ERP SaaS multi-tenant para concesionarias de autos de Argentina. Cubre el ciclo
completo de la unidad y del negocio: ingreso y publicación de stock, atención en
el salón, clientes y consultas, presupuestos, reservas, ventas, financiación
propia y cobranza, tasaciones, postventa, gastos, reportes, auditoría y
facturación (AFIP en modo simulado por ahora).

Cada concesionaria es un *tenant* aislado: la extensión de Prisma filtra por
`concesionariaId` y, además, la Row-Level Security de Postgres filtra con un rol
de base de datos sin privilegios de superusuario (`app_rw`). El detalle está en
[docs/operacion/arquitectura.md](docs/operacion/arquitectura.md).

Producto y usuarios: [PRODUCT.md](PRODUCT.md). Sistema visual: [DESIGN.md](DESIGN.md).

## Mapa del monorepo

| Carpeta / archivo | Qué es |
|---|---|
| `BackConcesionaria/` | API REST: Node 22, Express 5, Prisma 7, PostgreSQL 16. Arquitectura hexagonal. |
| `FrontConcesionaria/` | Web: React 19, Vite, TypeScript. Se sirve con nginx (`nginx.conf`). |
| `AppConcesionaria/` | App móvil iOS/Android (Expo). Roles vendedor y tasador. Usa la misma API. |
| `scripts/` | Operación: backups (`backup.sh`, `restore*.sh`, [BACKUPS.md](scripts/BACKUPS.md)), rotación de secretos, verificación de RLS. |
| `docs/seguridad/` | SGSI: alcance, política y políticas (ISO 27001 / SOC 2). |
| `docs/privacidad/` | PIMS: registro de tratamientos, retención, derechos de los titulares (ISO 27701 / Ley 25.326). |
| `docs/operacion/` | Runbooks de deploy, incidentes, restauración, alta de concesionaria, onboarding y arquitectura. |
| `docker-compose.yml` | Stack de producción: `db`, `backend`, `frontend`, `db-backup` y `prisma-studio` (perfil `debug`). |
| `.env.example` | Variables de producción, sin valores reales. El `.env` nunca se versiona. |
| `marca-autenza/` | Assets de marca. |

## Levantar en local

Requisitos: Node 22, npm, Docker y Git. En Windows, usá Git Bash para los
comandos de shell. Cloná el repo **fuera** de carpetas sincronizadas (OneDrive,
Dropbox, Google Drive): ahí terminarían los `.env` y los datos de prueba.

### 1. Base de datos descartable

```bash
docker run -d --name autenza-pg-dev -e POSTGRES_PASSWORD=devpg \
  -e POSTGRES_DB=concesionaria_dev -p 127.0.0.1:5434:5432 postgres:16-alpine
```

### 2. Backend

```bash
cd BackConcesionaria
cp .env.example .env
```

En `.env` poné, como mínimo:

```
NODE_ENV=development
PORT=3001
DATABASE_URL=postgresql://postgres:devpg@localhost:5434/concesionaria_dev?sslmode=disable
JWT_SECRET=<un valor largo cualquiera>
JWT_REFRESH_SECRET=<otro valor largo distinto>
```

```bash
npm ci
npx prisma generate
npx prisma migrate deploy      # aplica las migraciones versionadas
npm run init-rls:dev           # policies de RLS y triggers
# Admin inicial: definí SEED_ADMIN_EMAIL y SEED_ADMIN_PASSWORD (10+ caracteres) en el .env
npm run seed:dev
npm run dev                    # http://localhost:3001
```

Datos de demostración (opcional, solo en local): `npm run seed-demo:dev`. Los
`:dev` corren el `.ts` con ts-node; sin el sufijo corren el JS compilado (lo que
usa la imagen de producción) y necesitan `npm run build` antes.

### 3. Frontend

```bash
cd FrontConcesionaria
npm ci --legacy-peer-deps
npm run dev                    # http://localhost:5173
```

`.env.development` apunta la web a `http://localhost:3001/api`.

### 4. App móvil

```bash
cd AppConcesionaria
npm install
EXPO_PUBLIC_API_BASE_URL=http://<ip-de-tu-pc-en-la-lan>:3001/api npm start
```

Siempre definí `EXPO_PUBLIC_API_BASE_URL` en desarrollo: sin esa variable la
app apunta a producción. Más detalle en [AppConcesionaria/README.md](AppConcesionaria/README.md).

## Tests

| Qué | Comando | Dónde corre |
|---|---|---|
| Unitarios del back | `cd BackConcesionaria && npm run test:unit` | CI y local |
| Integración del back | receta de abajo | CI (dos veces: superusuario y `app_rw`) |
| Verificación de RLS | `bash scripts/verify-rls-role.sh` (levanta su propio Postgres) | CI y local |
| Lógica de backups | `sh scripts/tests/backup.test.sh` | CI y local |
| Front | `cd FrontConcesionaria && npx vitest --run && npm run lint` | local |
| App | `cd AppConcesionaria && npx tsc --noEmit` | local |

### Integración con Postgres descartable

Los tests de `BackConcesionaria/tests/integration` le pegan por HTTP a un
backend real levantado contra una base de prueba. No se mockea Prisma.

```bash
docker run -d --name autenza-int-test -e POSTGRES_PASSWORD=testpg \
  -e POSTGRES_DB=concesionaria_test -p 127.0.0.1:5477:5432 postgres:16-alpine

cd BackConcesionaria
export DATABASE_URL=postgresql://postgres:testpg@localhost:5477/concesionaria_test?sslmode=disable
export JWT_SECRET=test_jwt_secret_local_1234567890
export JWT_REFRESH_SECRET=test_jwt_refresh_secret_local_0987654321
npm run build                  # src/ y scripts de operación (init-rls y seed-ci corren el JS)
npx prisma migrate deploy
npx prisma migrate diff --from-schema prisma/schema.prisma --to-config-datasource --exit-code  # drift guard
npm run init-rls
SEED_CI_FORCE=true npm run seed-ci
NODE_ENV=test PORT=3077 node dist/server.js &
API_BASE_URL=http://localhost:3077 npm run test:integration
```

- `NODE_ENV=test` es obligatorio: los rate limiters solo se apagan en test.
- `seed-ci` se niega a correr contra algo que no parezca una base de prueba.
- Para correr bajo RLS real (como el job `integration-rls` del CI), definí
  `APP_DB_PASSWORD` y `APP_DATABASE_URL` (rol `app_rw`) y corré
  `npm run setup-app-role` antes del seed.
- En Windows, matar el proceso de Git Bash no siempre mata `node.exe`. Si el
  puerto queda tomado, buscá el PID con `netstat -ano` y cerralo con
  `taskkill //PID <pid> //F`.

## Deploy

Producción se actualiza por git en el servidor con `scripts/deploy.sh` (backup
previo, smoke y rollback). Todo está en
[docs/operacion/runbook-deploy.md](docs/operacion/runbook-deploy.md). Los cambios
entran a `main` solo por pull request ([gestión de cambios](docs/seguridad/gestion-de-cambios.md)).

## Seguridad y privacidad

- Reportar una vulnerabilidad: [SECURITY.md](SECURITY.md).
- SGSI: [docs/seguridad/](docs/seguridad/README.md).
- PIMS y Ley 25.326: [docs/privacidad/](docs/privacidad/README.md).
- Runbooks: [docs/operacion/](docs/operacion/).

## Licencia

Software propietario. Ver [LICENSE](LICENSE).
