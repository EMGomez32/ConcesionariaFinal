-- CreateEnum
CREATE TYPE "EstadoWhatsappCuenta" AS ENUM ('desconectado', 'conectando', 'esperando_qr', 'conectado', 'reconectando', 'error');

-- CreateEnum
CREATE TYPE "ProveedorWhatsapp" AS ENUM ('baileys', 'cloud_api');

-- CreateEnum
CREATE TYPE "SaludNumeroWhatsapp" AS ENUM ('normal', 'ralentizado', 'pausado');

-- CreateEnum
CREATE TYPE "EstadoConversacion" AS ENUM ('abierta', 'cerrada', 'archivada');

-- CreateEnum
CREATE TYPE "DireccionMensaje" AS ENUM ('entrante', 'saliente');

-- CreateEnum
CREATE TYPE "EstadoMensajeWhatsapp" AS ENUM ('pendiente', 'enviando', 'enviado', 'entregado', 'leido', 'fallido', 'recibido');

-- CreateEnum
CREATE TYPE "TipoMensajeWhatsapp" AS ENUM ('texto', 'imagen', 'audio', 'video', 'documento', 'ubicacion', 'contacto', 'sistema');

-- CreateTable
CREATE TABLE "whatsapp_cuentas" (
    "id" SERIAL NOT NULL,
    "concesionaria_id" INTEGER NOT NULL,
    "alias" TEXT NOT NULL,
    "numero" TEXT,
    "estado" "EstadoWhatsappCuenta" NOT NULL DEFAULT 'desconectado',
    "proveedor" "ProveedorWhatsapp" NOT NULL DEFAULT 'baileys',
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "ultimo_error" TEXT,
    "salud_estado" "SaludNumeroWhatsapp" NOT NULL DEFAULT 'normal',
    "salud_motivo" TEXT,
    "salud_desde" TIMESTAMP(3),
    "proximo_envio_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "whatsapp_cuentas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversaciones" (
    "id" SERIAL NOT NULL,
    "concesionaria_id" INTEGER NOT NULL,
    "whatsapp_cuenta_id" INTEGER NOT NULL,
    "cliente_id" INTEGER,
    "telefono" TEXT NOT NULL,
    "jid" TEXT,
    "nombre_contacto" TEXT,
    "estado" "EstadoConversacion" NOT NULL DEFAULT 'abierta',
    "asignado_a_id" INTEGER,
    "ultimo_mensaje_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ultimo_mensaje_dir" "DireccionMensaje" NOT NULL DEFAULT 'entrante',
    "no_leidos" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "conversaciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mensajes_whatsapp" (
    "id" SERIAL NOT NULL,
    "concesionaria_id" INTEGER NOT NULL,
    "conversacion_id" INTEGER NOT NULL,
    "direccion" "DireccionMensaje" NOT NULL,
    "tipo" "TipoMensajeWhatsapp" NOT NULL DEFAULT 'texto',
    "contenido" TEXT NOT NULL,
    "estado" "EstadoMensajeWhatsapp" NOT NULL DEFAULT 'pendiente',
    "wa_message_id" TEXT,
    "media_url" TEXT,
    "media_mime_type" TEXT,
    "enviado_por_id" INTEGER,
    "error_mensaje" TEXT,
    "enviar_at" TIMESTAMP(3),
    "intentos" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "enviado_en" TIMESTAMP(3),
    "entregado_en" TIMESTAMP(3),
    "leido_en" TIMESTAMP(3),
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "mensajes_whatsapp_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "whatsapp_cuentas_concesionaria_id_idx" ON "whatsapp_cuentas"("concesionaria_id");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_cuentas_concesionaria_id_alias_key" ON "whatsapp_cuentas"("concesionaria_id", "alias");

-- CreateIndex
CREATE INDEX "conversaciones_concesionaria_id_estado_ultimo_mensaje_at_idx" ON "conversaciones"("concesionaria_id", "estado", "ultimo_mensaje_at");

-- CreateIndex
CREATE INDEX "conversaciones_concesionaria_id_ultimo_mensaje_dir_no_leido_idx" ON "conversaciones"("concesionaria_id", "ultimo_mensaje_dir", "no_leidos");

-- CreateIndex
CREATE INDEX "conversaciones_cliente_id_idx" ON "conversaciones"("cliente_id");

-- CreateIndex
CREATE UNIQUE INDEX "conversaciones_whatsapp_cuenta_id_telefono_key" ON "conversaciones"("whatsapp_cuenta_id", "telefono");

-- CreateIndex
CREATE INDEX "mensajes_whatsapp_conversacion_id_created_at_idx" ON "mensajes_whatsapp"("conversacion_id", "created_at");

-- CreateIndex
CREATE INDEX "mensajes_whatsapp_estado_enviar_at_idx" ON "mensajes_whatsapp"("estado", "enviar_at");

-- CreateIndex
CREATE UNIQUE INDEX "mensajes_whatsapp_conversacion_id_wa_message_id_key" ON "mensajes_whatsapp"("conversacion_id", "wa_message_id");

-- AddForeignKey
ALTER TABLE "whatsapp_cuentas" ADD CONSTRAINT "whatsapp_cuentas_concesionaria_id_fkey" FOREIGN KEY ("concesionaria_id") REFERENCES "concesionarias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversaciones" ADD CONSTRAINT "conversaciones_concesionaria_id_fkey" FOREIGN KEY ("concesionaria_id") REFERENCES "concesionarias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversaciones" ADD CONSTRAINT "conversaciones_whatsapp_cuenta_id_fkey" FOREIGN KEY ("whatsapp_cuenta_id") REFERENCES "whatsapp_cuentas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversaciones" ADD CONSTRAINT "conversaciones_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversaciones" ADD CONSTRAINT "conversaciones_asignado_a_id_fkey" FOREIGN KEY ("asignado_a_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mensajes_whatsapp" ADD CONSTRAINT "mensajes_whatsapp_conversacion_id_fkey" FOREIGN KEY ("conversacion_id") REFERENCES "conversaciones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mensajes_whatsapp" ADD CONSTRAINT "mensajes_whatsapp_enviado_por_id_fkey" FOREIGN KEY ("enviado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
