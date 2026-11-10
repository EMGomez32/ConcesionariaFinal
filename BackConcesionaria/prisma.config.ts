// Config del CLI de Prisma 7 (lo generó `prisma init`). Usa `prisma` y `dotenv`, que están
// en `dependencies`: la imagen de producción corre `prisma migrate deploy` en el arranque y
// no trae devDependencies. El CLI carga este .ts con jiti (dependencia del propio CLI), no
// con ts-node ni typescript.
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    // `prisma db seed` corre el MISMO seed que `npm run seed` (JS compilado en dist-ops/,
    // anda dentro del contenedor). En desarrollo, sin compilar: `npm run seed:dev`.
    seed: "npm run seed",
  },
  datasource: {
    url: process.env["DATABASE_URL"],
  },
});
