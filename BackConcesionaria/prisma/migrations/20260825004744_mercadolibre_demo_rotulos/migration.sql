-- AlterTable
ALTER TABLE "clientes" ADD COLUMN     "origen_simulado" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "publicaciones_ml" ADD COLUMN     "pausada_manualmente_en" TIMESTAMP(3);
