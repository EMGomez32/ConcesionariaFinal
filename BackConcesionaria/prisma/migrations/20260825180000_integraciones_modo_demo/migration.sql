-- CreateEnum
CREATE TYPE "ModoIntegracion" AS ENUM ('real', 'demo');

-- AlterTable
ALTER TABLE "integraciones_canal" ADD COLUMN     "modo" "ModoIntegracion" NOT NULL DEFAULT 'real';

-- Backfill EXPLÍCITO de lo que ya existe. El DEFAULT de la columna ya deja a las
-- filas viejas en 'real', pero se escribe igual para dejar ASENTADO acá que
-- ninguna integración ya conectada se vuelve simulada por esta migración: el
-- modo demostración se enciende SÓLO a mano desde Ajustes. Sobre datos
-- existentes no toca ninguna fila.
UPDATE "integraciones_canal" SET "modo" = 'real' WHERE "modo" <> 'real';
