-- PROC-31: una venta ANULADA (soft-delete) ya no bloquea la reventa de la unidad
-- ni la reconversión del presupuesto.
--
-- Los @unique totales de `vehiculo_id` y `presupuesto_id` contaban también las
-- filas con deleted_at, así que después de anular una venta el siguiente POST
-- /ventas de esa misma unidad rebotaba con P2002. Se reemplazan por índices únicos
-- PARCIALES: siguen garantizando UNA venta viva por unidad y por presupuesto.
--
-- Orden a propósito: primero se crean los parciales y recién después se bajan los
-- totales, para que no haya ni un instante sin unicidad sobre las ventas vivas.
-- Crear los parciales no puede fallar por datos: el índice total vigente ya
-- impedía duplicados (vivos o no).

-- CreateIndex
CREATE UNIQUE INDEX "ventas_vehiculo_id_viva_key" ON "ventas"("vehiculo_id") WHERE (deleted_at IS NULL);

-- CreateIndex
CREATE UNIQUE INDEX "ventas_presupuesto_id_viva_key" ON "ventas"("presupuesto_id") WHERE (deleted_at IS NULL);

-- DropIndex
DROP INDEX "ventas_vehiculo_id_key";

-- DropIndex
DROP INDEX "ventas_presupuesto_id_key";
