-- CreateEnum
CREATE TYPE "TipoSolicitudTitular" AS ENUM ('acceso', 'rectificacion', 'supresion', 'bloqueo', 'oposicion');

-- CreateEnum
CREATE TYPE "EstadoSolicitudTitular" AS ENUM ('pendiente', 'en_curso', 'resuelta', 'rechazada');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AccionAudit" ADD VALUE 'export';
ALTER TYPE "AccionAudit" ADD VALUE 'suprimir';
ALTER TYPE "AccionAudit" ADD VALUE 'bloquear';
ALTER TYPE "AccionAudit" ADD VALUE 'desbloquear';
ALTER TYPE "AccionAudit" ADD VALUE 'revocar_consentimiento';
ALTER TYPE "AccionAudit" ADD VALUE 'acceso_soporte';

-- AlterTable
ALTER TABLE "clientes" ADD COLUMN     "bloqueado_en" TIMESTAMP(3),
ADD COLUMN     "bloqueo_motivo" TEXT,
ADD COLUMN     "consentimiento_revocado_en" TIMESTAMP(3),
ADD COLUMN     "consentimiento_version" TEXT,
ADD COLUMN     "suprimido_en" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "solicitudes_titular" (
    "id" SERIAL NOT NULL,
    "concesionaria_id" INTEGER NOT NULL,
    "cliente_id" INTEGER,
    "tipo" "TipoSolicitudTitular" NOT NULL,
    "titular_nombre" TEXT NOT NULL,
    "canal" TEXT,
    "detalle" TEXT,
    "recibida_el" DATE NOT NULL,
    "vence_el" DATE NOT NULL,
    "estado" "EstadoSolicitudTitular" NOT NULL DEFAULT 'pendiente',
    "resolucion" TEXT,
    "resuelta_en" TIMESTAMP(3),
    "registrada_por_id" INTEGER,
    "atendida_por_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "solicitudes_titular_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "solicitudes_titular_concesionaria_id_estado_vence_el_idx" ON "solicitudes_titular"("concesionaria_id", "estado", "vence_el");

-- CreateIndex
CREATE INDEX "solicitudes_titular_cliente_id_idx" ON "solicitudes_titular"("cliente_id");

-- AddForeignKey
ALTER TABLE "solicitudes_titular" ADD CONSTRAINT "solicitudes_titular_concesionaria_id_fkey" FOREIGN KEY ("concesionaria_id") REFERENCES "concesionarias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitudes_titular" ADD CONSTRAINT "solicitudes_titular_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
