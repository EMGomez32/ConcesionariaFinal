-- 2FA (TOTP) para los usuarios: columnas en usuarios (secreto cifrado, estado, último paso usado para
-- evitar replay) y tabla de códigos de recuperación de un solo uso (sólo el hash).
-- Aditiva: ninguna fila existente cambia; todos los usuarios quedan con totp_enabled = false.
-- AlterTable
ALTER TABLE "usuarios" ADD COLUMN     "totp_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "totp_enabled_at" TIMESTAMP(3),
ADD COLUMN     "totp_last_step" INTEGER,
ADD COLUMN     "totp_secret" TEXT;

-- CreateTable
CREATE TABLE "recovery_codes" (
    "id" SERIAL NOT NULL,
    "usuario_id" INTEGER NOT NULL,
    "code_hash" TEXT NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recovery_codes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "recovery_codes_code_hash_key" ON "recovery_codes"("code_hash");

-- CreateIndex
CREATE INDEX "recovery_codes_usuario_id_idx" ON "recovery_codes"("usuario_id");

