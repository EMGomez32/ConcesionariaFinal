-- PROC-34: marca de la venta que se cerró por debajo del precio mínimo de la ficha
-- (con autorización vigente o por un admin). Las ventas anteriores quedan en false:
-- antes de este cambio el piso no se controlaba al vender y no hay forma honesta de
-- reconstruirlo.

-- AlterTable
ALTER TABLE "ventas" ADD COLUMN     "bajo_piso" BOOLEAN NOT NULL DEFAULT false;
