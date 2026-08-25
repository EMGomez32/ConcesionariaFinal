-- Bandeja MULTICANAL: la conversación deja de ser "un hilo de WhatsApp" y pasa a
-- ser "un hilo de cualquier canal" (WhatsApp, DM de Instagram, DM de Messenger,
-- comentario de Instagram, comentario de la página de Facebook).
--
-- ESTA MIGRACIÓN CORRE SOBRE DATOS VIVOS DE PRODUCCIÓN. Reglas que se respetan acá:
--  1. Todas las filas existentes son de WhatsApp: quedan con canal = 'whatsapp'
--     y clave_hilo = '<whatsapp_cuenta_id>:<telefono>'. El backfill es
--     EXPLÍCITO (UPDATE propio), no se delega en el DEFAULT de la columna.
--     ESE FORMATO TIENE QUE SER IDÉNTICO al de claveHiloDe() en
--     src/application/services/conversacionService.ts: si difiere aunque sea en
--     un prefijo, el próximo mensaje de un contacto YA EXISTENTE no encuentra su
--     hilo y abre uno nuevo — la bandeja de producción se parte en dos.
--  2. Las dos columnas nuevas obligatorias (canal, clave_hilo) se agregan
--     NULLABLES, se llenan, y RECIÉN DESPUÉS se marcan NOT NULL. Agregarlas
--     NOT NULL de una haría fallar la migración con filas presentes.
--  3. El unique nuevo [concesionaria_id, canal, clave_hilo] es EQUIVALENTE al
--     viejo [whatsapp_cuenta_id, telefono]: clave_hilo lleva adentro la cuenta,
--     y una cuenta pertenece a una sola concesionaria. No puede haber duplicados
--     nuevos, así que el CREATE UNIQUE INDEX no puede fallar por datos previos.

-- CreateEnum
CREATE TYPE "CanalConversacion" AS ENUM ('whatsapp', 'instagram', 'messenger', 'instagram_comentario', 'facebook_comentario');

-- TipoMensajeWhatsapp NO se toca: los mensajes y comentarios de Meta entran con
-- los valores que ya existen ('texto' y los de adjunto). Un valor de enum de
-- Postgres no se puede borrar después, así que no se agrega ninguno "por las
-- dudas" — cuando haga falta, es una migración de una línea.

-- DropForeignKey
-- Se recrea más abajo apuntando a la columna ya nullable (ON DELETE SET NULL).
ALTER TABLE "conversaciones" DROP CONSTRAINT "conversaciones_whatsapp_cuenta_id_fkey";

-- DropIndex
-- El unique natural del hilo deja de ser (cuenta de WhatsApp, teléfono): un DM
-- de Instagram no tiene ninguna de las dos cosas.
DROP INDEX "conversaciones_whatsapp_cuenta_id_telefono_key";

-- AlterTable
-- canal y clave_hilo entran NULLABLES a propósito: se llenan en el backfill de
-- abajo y ahí se les pone el NOT NULL.
ALTER TABLE "conversaciones" ADD COLUMN     "canal" "CanalConversacion",
ADD COLUMN     "clave_hilo" TEXT,
ADD COLUMN     "comentario_externo_id" TEXT,
ADD COLUMN     "contacto_externo_id" TEXT,
ADD COLUMN     "integracion_id" INTEGER,
ADD COLUMN     "post_externo_id" TEXT,
ADD COLUMN     "ventana_vence_at" TIMESTAMP(3),
ALTER COLUMN "whatsapp_cuenta_id" DROP NOT NULL,
ALTER COLUMN "telefono" DROP NOT NULL;

-- ── BACKFILL EXPLÍCITO ───────────────────────────────────────────────────────
-- Todo lo que existe hoy entró por WhatsApp. Sin WHERE de deleted_at: las filas
-- borradas por soft-delete también ocupan el unique, así que también necesitan
-- su clave.
UPDATE "conversaciones" SET "canal" = 'whatsapp' WHERE "canal" IS NULL;

-- '<cuenta>:<telefono>' reproduce EXACTAMENTE el unique viejo [whatsapp_cuenta_id,
-- telefono] — es la misma restricción escrita de una forma que también le sirve a
-- Meta. Incluir la CUENTA no es decorativo: una concesionaria con dos números
-- tiene hoy DOS hilos con el mismo contacto, y con clave_hilo = telefono a secas
-- el CREATE UNIQUE INDEX de abajo fallaría sobre esos datos.
--
-- Los COALESCE son un cinturón de seguridad: las dos columnas eran NOT NULL hasta
-- hace tres líneas, así que nunca disparan; están para que el SET NOT NULL de
-- abajo no pueda fallar por una fila rara y dejar la migración a medio aplicar.
UPDATE "conversaciones"
   SET "clave_hilo" = COALESCE("whatsapp_cuenta_id"::text, 'sin-cuenta')
                      || ':'
                      || COALESCE(NULLIF("telefono", ''), 'sin-telefono-' || "id"::text)
 WHERE "clave_hilo" IS NULL;

ALTER TABLE "conversaciones" ALTER COLUMN "canal" SET DEFAULT 'whatsapp';
ALTER TABLE "conversaciones" ALTER COLUMN "canal" SET NOT NULL;
ALTER TABLE "conversaciones" ALTER COLUMN "clave_hilo" SET NOT NULL;
-- ─────────────────────────────────────────────────────────────────────────────

-- AlterTable
-- Id del mensaje/comentario en Meta: la clave de idempotencia de la ingesta
-- (Meta reintenta las notificaciones del webhook). Null en WhatsApp.
ALTER TABLE "mensajes_whatsapp" ADD COLUMN     "externo_id" TEXT;

-- CreateIndex
CREATE INDEX "conversaciones_concesionaria_id_canal_ultimo_mensaje_at_idx" ON "conversaciones"("concesionaria_id", "canal", "ultimo_mensaje_at");

-- CreateIndex
CREATE INDEX "conversaciones_integracion_id_idx" ON "conversaciones"("integracion_id");

-- CreateIndex
CREATE UNIQUE INDEX "conversaciones_concesionaria_id_canal_clave_hilo_key" ON "conversaciones"("concesionaria_id", "canal", "clave_hilo");

-- CreateIndex
CREATE UNIQUE INDEX "mensajes_whatsapp_conversacion_id_externo_id_key" ON "mensajes_whatsapp"("conversacion_id", "externo_id");

-- AddForeignKey
ALTER TABLE "conversaciones" ADD CONSTRAINT "conversaciones_whatsapp_cuenta_id_fkey" FOREIGN KEY ("whatsapp_cuenta_id") REFERENCES "whatsapp_cuentas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversaciones" ADD CONSTRAINT "conversaciones_integracion_id_fkey" FOREIGN KEY ("integracion_id") REFERENCES "integraciones_canal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
