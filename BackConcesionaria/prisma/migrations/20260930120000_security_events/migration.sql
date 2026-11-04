-- Auditoría de seguridad (H5). Dos cosas:
--  1) Tres acciones nuevas en AccionAudit: login_fail (login fallido contra una
--     cuenta que existe: lo ve el admin de su concesionaria), password_reset_request
--     y password_reset_done (recuperación de contraseña).
--  2) security_events: rastro SIN tenant (acciones de super_admin, intentos contra
--     emails inexistentes, alertas de fuerza bruta). audit_log no puede guardarlos
--     porque su concesionaria_id es NOT NULL con FK: hasta ahora audit() los
--     DESCARTABA con un warn.
-- Aditiva: ninguna fila existente cambia. Un valor de enum no se puede borrar.
-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AccionAudit" ADD VALUE 'login_fail';
ALTER TYPE "AccionAudit" ADD VALUE 'password_reset_request';
ALTER TYPE "AccionAudit" ADD VALUE 'password_reset_done';

-- CreateTable
CREATE TABLE "security_events" (
    "id" SERIAL NOT NULL,
    "accion" TEXT NOT NULL,
    "entidad" TEXT,
    "entidad_id" INTEGER,
    "usuario_id" INTEGER,
    "concesionaria_id" INTEGER,
    "email_hash" TEXT,
    "detalle" TEXT,
    "ip" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "security_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "security_events_created_at_idx" ON "security_events"("created_at");

-- CreateIndex
CREATE INDEX "security_events_accion_created_at_idx" ON "security_events"("accion", "created_at");

-- CreateIndex
CREATE INDEX "security_events_email_hash_idx" ON "security_events"("email_hash");

