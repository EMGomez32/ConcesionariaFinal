-- CreateEnum
CREATE TYPE "OrigenLead" AS ENUM ('deruedas', 'instagram', 'facebook', 'whatsapp', 'web', 'mostrador', 'referido', 'otro');

-- CreateEnum
CREATE TYPE "TipoIntegracionCanal" AS ENUM ('meta', 'email');

-- AlterTable
ALTER TABLE "clientes" ADD COLUMN     "origen_lead" "OrigenLead";

-- CreateTable
CREATE TABLE "integraciones_canal" (
    "id" SERIAL NOT NULL,
    "concesionaria_id" INTEGER NOT NULL,
    "tipo" "TipoIntegracionCanal" NOT NULL,
    "nombre" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "config" JSONB NOT NULL,
    "ultimo_evento" TIMESTAMP(3),
    "ultimo_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "integraciones_canal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "integraciones_canal_concesionaria_id_idx" ON "integraciones_canal"("concesionaria_id");

-- AddForeignKey
ALTER TABLE "integraciones_canal" ADD CONSTRAINT "integraciones_canal_concesionaria_id_fkey" FOREIGN KEY ("concesionaria_id") REFERENCES "concesionarias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
