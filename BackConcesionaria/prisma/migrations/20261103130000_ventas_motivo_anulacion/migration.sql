-- PROC-30: anular una venta deja de ser un borrado mudo. El motivo (obligatorio
-- desde la API) y quién la anuló quedan en la propia fila, además del audit_log.
-- Columnas nullable: las ventas vivas no las usan y las anuladas antes de este
-- cambio no tienen motivo que recuperar.

-- AlterTable
ALTER TABLE "ventas" ADD COLUMN     "anulada_por_id" INTEGER,
ADD COLUMN     "motivo_anulacion" TEXT;

-- AddForeignKey
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_anulada_por_id_fkey" FOREIGN KEY ("anulada_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
