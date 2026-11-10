-- APP-11: vencimiento ABSOLUTO de la sesión.
--
-- Cada /auth/refresh rota el token y emite otro de 7 días, así que una sesión que
-- se renovaba seguido vivía para siempre. Para poder cortarla a los
-- SESION_MAX_DIAS (30 por defecto) desde el login, cada refresh guarda cuándo
-- empezó SU sesión (`sesion_iniciada_at`) y a qué sesión pertenece (`familia`);
-- las dos cosas se heredan tal cual en cada rotación.
--
-- Tokens que ya existían (no se sabe cuándo fue su login real):
--  - `sesion_iniciada_at` = su `created_at`, el momento de su última rotación (o
--    del login, si nunca rotó). Es la fecha MÁS VIEJA que se conoce de esa sesión
--    sin inventar nada: una sesión que venía rotando desde hace meses vive, como
--    mucho, SESION_MAX_DIAS desde su última rotación y ahí se corta. No se usa
--    now() a propósito: eso le regalaría a todas las sesiones abiertas un plazo
--    entero contado desde el deploy.
--  - `familia` = 'legado-<id>': no hay forma de reconstruir qué filas eran de la
--    misma cadena, así que cada una queda como su propia sesión. Sólo importa la
--    fila viva (la que se va a rotar), y sus sucesoras heredan ese valor. La
--    detección de reuso no depende de la familia (sigue cortando todas las
--    sesiones del usuario).
--
-- Defaults: la app siempre pasa las dos columnas. Los defaults de la base son
-- para un INSERT a mano (scripts de operación, tests): sin `familia` el token es
-- su propia sesión (uuid nuevo) y sin inicio, la sesión empieza en ese momento.
--
-- Orden: columnas nulables → backfill → NOT NULL, para no fallar con la tabla
-- con datos (el ADD COLUMN ... NOT NULL que genera Prisma sin default no se
-- puede aplicar si hay filas).

-- AlterTable
ALTER TABLE "refresh_tokens" ADD COLUMN "familia" TEXT,
ADD COLUMN "sesion_iniciada_at" TIMESTAMP(3);

-- Backfill de los tokens existentes (criterio de arriba).
UPDATE "refresh_tokens" SET "familia" = 'legado-' || "id" WHERE "familia" IS NULL;
UPDATE "refresh_tokens" SET "sesion_iniciada_at" = "created_at" WHERE "sesion_iniciada_at" IS NULL;

ALTER TABLE "refresh_tokens" ALTER COLUMN "familia" SET NOT NULL,
ALTER COLUMN "familia" SET DEFAULT (gen_random_uuid())::text,
ALTER COLUMN "sesion_iniciada_at" SET NOT NULL,
ALTER COLUMN "sesion_iniciada_at" SET DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "refresh_tokens_familia_idx" ON "refresh_tokens"("familia");
