-- CreateEnum
CREATE TYPE "EstadoPublicacionMl" AS ENUM ('borrador', 'activa', 'pausada', 'cerrada', 'error');

-- CreateEnum
CREATE TYPE "EstadoPreguntaMl" AS ENUM ('sin_responder', 'respondida', 'eliminada');

-- AlterEnum
ALTER TYPE "OrigenLead" ADD VALUE 'mercadolibre';

-- CreateTable
CREATE TABLE "mercadolibre_cuentas" (
    "id" SERIAL NOT NULL,
    "concesionaria_id" INTEGER NOT NULL,
    "ml_user_id" TEXT NOT NULL,
    "nickname" TEXT,
    "site_id" TEXT NOT NULL DEFAULT 'MLA',
    "access_token" TEXT NOT NULL,
    "refresh_token" TEXT NOT NULL,
    "expira_en" TIMESTAMP(3) NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "ultimo_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "mercadolibre_cuentas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "publicaciones_ml" (
    "id" SERIAL NOT NULL,
    "concesionaria_id" INTEGER NOT NULL,
    "cuenta_id" INTEGER NOT NULL,
    "vehiculo_id" INTEGER NOT NULL,
    "item_id" TEXT,
    "permalink" TEXT,
    "estado" "EstadoPublicacionMl" NOT NULL DEFAULT 'borrador',
    "listing_type_id" TEXT NOT NULL DEFAULT 'gold_special',
    "categoria_id" TEXT,
    "titulo" TEXT NOT NULL,
    "precio_publicado" DECIMAL(14,2),
    "moneda_publicada" TEXT,
    "ultimo_error" TEXT,
    "ultima_sync_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "publicaciones_ml_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "preguntas_ml" (
    "id" SERIAL NOT NULL,
    "concesionaria_id" INTEGER NOT NULL,
    "cuenta_id" INTEGER NOT NULL,
    "publicacion_id" INTEGER,
    "ml_question_id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "ml_from_user_id" TEXT,
    "nombre_contacto" TEXT,
    "texto" TEXT NOT NULL,
    "respuesta" TEXT,
    "estado" "EstadoPreguntaMl" NOT NULL DEFAULT 'sin_responder',
    "asignado_a_id" INTEGER,
    "cliente_id" INTEGER,
    "preguntada_en" TIMESTAMP(3) NOT NULL,
    "respondida_en" TIMESTAMP(3),
    "respondida_por_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "preguntas_ml_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "mercadolibre_cuentas_concesionaria_id_idx" ON "mercadolibre_cuentas"("concesionaria_id");

-- CreateIndex
CREATE UNIQUE INDEX "mercadolibre_cuentas_concesionaria_id_ml_user_id_key" ON "mercadolibre_cuentas"("concesionaria_id", "ml_user_id");

-- CreateIndex
CREATE INDEX "publicaciones_ml_concesionaria_id_estado_idx" ON "publicaciones_ml"("concesionaria_id", "estado");

-- CreateIndex
CREATE INDEX "publicaciones_ml_vehiculo_id_idx" ON "publicaciones_ml"("vehiculo_id");

-- CreateIndex
CREATE UNIQUE INDEX "publicaciones_ml_item_id_key" ON "publicaciones_ml"("item_id");

-- CreateIndex
CREATE INDEX "preguntas_ml_concesionaria_id_estado_preguntada_en_idx" ON "preguntas_ml"("concesionaria_id", "estado", "preguntada_en");

-- CreateIndex
CREATE INDEX "preguntas_ml_publicacion_id_idx" ON "preguntas_ml"("publicacion_id");

-- CreateIndex
CREATE UNIQUE INDEX "preguntas_ml_ml_question_id_key" ON "preguntas_ml"("ml_question_id");

-- AddForeignKey
ALTER TABLE "mercadolibre_cuentas" ADD CONSTRAINT "mercadolibre_cuentas_concesionaria_id_fkey" FOREIGN KEY ("concesionaria_id") REFERENCES "concesionarias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publicaciones_ml" ADD CONSTRAINT "publicaciones_ml_concesionaria_id_fkey" FOREIGN KEY ("concesionaria_id") REFERENCES "concesionarias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publicaciones_ml" ADD CONSTRAINT "publicaciones_ml_cuenta_id_fkey" FOREIGN KEY ("cuenta_id") REFERENCES "mercadolibre_cuentas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publicaciones_ml" ADD CONSTRAINT "publicaciones_ml_vehiculo_id_fkey" FOREIGN KEY ("vehiculo_id") REFERENCES "vehiculos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "preguntas_ml" ADD CONSTRAINT "preguntas_ml_concesionaria_id_fkey" FOREIGN KEY ("concesionaria_id") REFERENCES "concesionarias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "preguntas_ml" ADD CONSTRAINT "preguntas_ml_cuenta_id_fkey" FOREIGN KEY ("cuenta_id") REFERENCES "mercadolibre_cuentas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "preguntas_ml" ADD CONSTRAINT "preguntas_ml_publicacion_id_fkey" FOREIGN KEY ("publicacion_id") REFERENCES "publicaciones_ml"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "preguntas_ml" ADD CONSTRAINT "preguntas_ml_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "preguntas_ml" ADD CONSTRAINT "preguntas_ml_asignado_a_id_fkey" FOREIGN KEY ("asignado_a_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "preguntas_ml" ADD CONSTRAINT "preguntas_ml_respondida_por_id_fkey" FOREIGN KEY ("respondida_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
