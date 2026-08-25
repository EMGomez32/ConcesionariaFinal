-- CreateEnum
CREATE TYPE "ModoCuentaMl" AS ENUM ('real', 'demo');

-- AlterTable
ALTER TABLE "mercadolibre_cuentas" ADD COLUMN     "modo" "ModoCuentaMl" NOT NULL DEFAULT 'real';
