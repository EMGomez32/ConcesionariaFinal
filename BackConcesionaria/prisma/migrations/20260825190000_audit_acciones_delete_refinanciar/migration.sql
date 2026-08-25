-- Faltaban dos valores que el tipo AccionAudit de TypeScript
-- (src/infrastructure/security/audit.ts) ya declaraba y que siete controllers
-- venían usando: 'delete' (baja FÍSICA, distinta de la lógica 'delete_soft') y
-- 'refinanciar'. Prisma rechazaba el INSERT con "Invalid value for argument
-- `accion`" y audit() se traga el error a propósito —nunca puede romper la
-- operación que audita—, así que esas bajas quedaban sin rastro y en silencio.
--
-- Aditiva y sin backfill: ninguna fila existente cambia. En Postgres un valor de
-- enum no se puede borrar, así que estos dos ya no se van.
ALTER TYPE "AccionAudit" ADD VALUE IF NOT EXISTS 'delete';
ALTER TYPE "AccionAudit" ADD VALUE IF NOT EXISTS 'refinanciar';
