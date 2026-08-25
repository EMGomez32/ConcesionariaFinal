-- Devuelve la guarda que se perdió al hacer nullable `whatsapp_cuenta_id`.
--
-- Antes de multi-canal la columna era NOT NULL y Prisma había creado la FK con
-- ON DELETE RESTRICT: un DELETE sobre whatsapp_cuentas se BLOQUEABA mientras
-- hubiera conversaciones colgando. Al pasarla a nullable, la migración
-- 20260825120000 la recreó con ON DELETE SET NULL (el default de Prisma para una
-- relación opcional), y con eso borrar un número desde psql o desde un script de
-- mantenimiento deja los hilos VIVOS de ese número huérfanos en silencio:
--   - responder tira 404 'Cuenta de WhatsApp no encontrado';
--   - los salientes en cola quedan 'fallido';
--   - revincular el mismo número por QR le da un id nuevo, así que la clave del
--     hilo no matchea más y se abre una conversación nueva por contacto: la
--     bandeja de producción queda partida en dos y el historial viejo, inalcanzable.
--
-- Nullable y RESTRICT no se pelean: la columna puede seguir naciendo NULL (los
-- hilos de Meta no tienen cuenta de WhatsApp) y aun así Postgres impide borrar
-- una cuenta que tiene hilos apuntándole. Es la única tabla de todo esto con
-- datos reales en producción, así que la defensa vuelve.
--
-- La FK de integracion_id NO se toca: ahí SET NULL es lo correcto (si se elimina
-- la integración de Meta el historial del hilo se conserva).

ALTER TABLE "conversaciones" DROP CONSTRAINT "conversaciones_whatsapp_cuenta_id_fkey";

ALTER TABLE "conversaciones" ADD CONSTRAINT "conversaciones_whatsapp_cuenta_id_fkey"
    FOREIGN KEY ("whatsapp_cuenta_id") REFERENCES "whatsapp_cuentas"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
