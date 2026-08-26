-- ─────────────────────────────────────────────────────────────────────────────
-- Módulo del vendedor / atención presencial — modelos y campos nuevos.
--
-- Corre sobre datos VIVOS. Todo lo que se agrega es aditivo: columnas nullable o
-- con DEFAULT (en Postgres 11+ un ADD COLUMN ... NOT NULL DEFAULT no reescribe
-- la tabla), tablas nuevas vacías, y ningún cambio de tipo ni de constraint
-- sobre columnas existentes. Ninguna fila existente puede hacer fallar esto.
--
-- Los backfills van al final, en su propio bloque comentado, y son todos
-- idempotentes (repiten el mismo valor si se corren dos veces).
--
-- OJO — la RLS de las tres tablas nuevas (atenciones, atencion_vehiculos,
-- solicitudes_precio_minimo) NO se habilita acá: la habilita prisma/init-rls.ts,
-- que corre en cada arranque del backend y ya las tiene registradas en
-- TENANT_TABLES (y atencion_vehiculos además en BACKFILL_PLAN, para el trigger
-- que le deriva el concesionaria_id de la atención). Ese es el patrón de la casa
-- para todas las tablas del sistema.
-- ─────────────────────────────────────────────────────────────────────────────

-- CreateEnum
CREATE TYPE "EstadoTasacion" AS ENUM ('sin_tasar', 'tasada', 'rechazada');

-- CreateEnum
CREATE TYPE "CanalAtencion" AS ENUM ('presencial');

-- CreateEnum
CREATE TYPE "MotivoAtencion" AS ENUM ('consulta_general', 'unidad_puntual', 'vuelve_por_atencion_anterior');

-- CreateEnum
CREATE TYPE "EstadoAtencion" AS ENUM ('abierta', 'cerrada');

-- CreateEnum
CREATE TYPE "ResultadoAtencion" AS ENUM ('reserva', 'cotizacion', 'test_drive', 'permuta_a_tasar', 'en_analisis', 'sin_unidad', 'se_retiro');

-- CreateEnum
CREATE TYPE "ModoBusqueda" AS ENUM ('presupuesto', 'modelo', 'unidad');

-- CreateEnum
CREATE TYPE "TipoFinanciamiento" AS ENUM ('contado', 'credito', 'plan_de_ahorro');

-- CreateEnum
CREATE TYPE "TipoAtencionVehiculo" AS ENUM ('buscada', 'sugerida');

-- CreateEnum
CREATE TYPE "AccionAtencionVehiculo" AS ENUM ('vista', 'test_drive', 'cotizada', 'reservada');

-- CreateEnum
CREATE TYPE "NivelInteres" AS ENUM ('bajo', 'medio', 'alto');

-- CreateEnum
CREATE TYPE "EstadoSolicitudPrecioMinimo" AS ENUM ('pendiente', 'autorizada', 'rechazada', 'expirada');

-- AlterTable
ALTER TABLE "cliente_seguimientos" ADD COLUMN     "atencion_id" INTEGER;

-- AlterTable
ALTER TABLE "clientes" ADD COLUMN     "apellido" TEXT,
ADD COLUMN     "consentimiento_contacto" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "consentimiento_en" TIMESTAMP(3),
ADD COLUMN     "telefono_normalizado" TEXT,
ADD COLUMN     "ultima_interaccion_en" TIMESTAMP(3),
ADD COLUMN     "vendedor_asignado_en" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "concesionarias" ADD COLUMN     "dias_retencion_cliente" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "tasacion_solo_tasador" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "tasaciones" ADD COLUMN     "atencion_id" INTEGER,
ADD COLUMN     "estado" "EstadoTasacion" NOT NULL DEFAULT 'sin_tasar';

-- AlterTable
ALTER TABLE "vehiculos" ADD COLUMN     "precio_minimo" DECIMAL(12,2),
ADD COLUMN     "segmento" TEXT;

-- CreateTable
CREATE TABLE "atenciones" (
    "id" SERIAL NOT NULL,
    "concesionaria_id" INTEGER NOT NULL,
    "cliente_id" INTEGER NOT NULL,
    "vendedor_id" INTEGER NOT NULL,
    "canal" "CanalAtencion" NOT NULL DEFAULT 'presencial',
    "motivo" "MotivoAtencion" NOT NULL DEFAULT 'consulta_general',
    "atencion_anterior_id" INTEGER,
    "estado" "EstadoAtencion" NOT NULL DEFAULT 'abierta',
    "resultado" "ResultadoAtencion",
    "iniciada_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cerrada_en" TIMESTAMP(3),
    "cerrada_automaticamente" BOOLEAN NOT NULL DEFAULT false,
    "observaciones" TEXT,
    "modo_busqueda" "ModoBusqueda",
    "presupuesto_min" DECIMAL(12,2),
    "presupuesto_max" DECIMAL(12,2),
    "anticipo" DECIMAL(12,2),
    "cuota_maxima" DECIMAL(12,2),
    "tipo_financiamiento" "TipoFinanciamiento",
    "presupuesto_real_calculado" DECIMAL(12,2),
    "moneda" TEXT NOT NULL DEFAULT 'ARS',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "atenciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "atencion_vehiculos" (
    "id" SERIAL NOT NULL,
    "concesionaria_id" INTEGER,
    "atencion_id" INTEGER NOT NULL,
    "vehiculo_id" INTEGER NOT NULL,
    "tipo" "TipoAtencionVehiculo" NOT NULL,
    "accion" "AccionAtencionVehiculo" NOT NULL DEFAULT 'vista',
    "nivel_interes" "NivelInteres",
    "motivo_sugerencia" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "atencion_vehiculos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "solicitudes_precio_minimo" (
    "id" SERIAL NOT NULL,
    "concesionaria_id" INTEGER NOT NULL,
    "vehiculo_id" INTEGER NOT NULL,
    "atencion_id" INTEGER,
    "solicitante_id" INTEGER NOT NULL,
    "resuelta_por_id" INTEGER,
    "estado" "EstadoSolicitudPrecioMinimo" NOT NULL DEFAULT 'pendiente',
    "motivo" TEXT,
    "respuesta" TEXT,
    "precio_autorizado" DECIMAL(12,2),
    "moneda" TEXT NOT NULL DEFAULT 'ARS',
    "solicitada_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resuelta_en" TIMESTAMP(3),
    "vence_el" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "solicitudes_precio_minimo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "atenciones_concesionaria_id_idx" ON "atenciones"("concesionaria_id");

-- CreateIndex
CREATE INDEX "atenciones_cliente_id_idx" ON "atenciones"("cliente_id");

-- CreateIndex
CREATE INDEX "atenciones_vendedor_id_idx" ON "atenciones"("vendedor_id");

-- CreateIndex
CREATE INDEX "atenciones_concesionaria_id_estado_idx" ON "atenciones"("concesionaria_id", "estado");

-- CreateIndex
CREATE INDEX "atencion_vehiculos_concesionaria_id_idx" ON "atencion_vehiculos"("concesionaria_id");

-- CreateIndex
CREATE INDEX "atencion_vehiculos_atencion_id_idx" ON "atencion_vehiculos"("atencion_id");

-- CreateIndex
CREATE INDEX "atencion_vehiculos_vehiculo_id_idx" ON "atencion_vehiculos"("vehiculo_id");

-- CreateIndex
CREATE UNIQUE INDEX "atencion_vehiculos_atencion_id_vehiculo_id_key" ON "atencion_vehiculos"("atencion_id", "vehiculo_id");

-- CreateIndex
CREATE INDEX "solicitudes_precio_minimo_concesionaria_id_idx" ON "solicitudes_precio_minimo"("concesionaria_id");

-- CreateIndex
CREATE INDEX "solicitudes_precio_minimo_vehiculo_id_idx" ON "solicitudes_precio_minimo"("vehiculo_id");

-- CreateIndex
CREATE INDEX "solicitudes_precio_minimo_atencion_id_idx" ON "solicitudes_precio_minimo"("atencion_id");

-- CreateIndex
CREATE INDEX "solicitudes_precio_minimo_concesionaria_id_estado_idx" ON "solicitudes_precio_minimo"("concesionaria_id", "estado");

-- CreateIndex
CREATE INDEX "solicitudes_precio_minimo_solicitante_id_idx" ON "solicitudes_precio_minimo"("solicitante_id");

-- CreateIndex
CREATE INDEX "cliente_seguimientos_atencion_id_idx" ON "cliente_seguimientos"("atencion_id");

-- CreateIndex
CREATE INDEX "clientes_concesionaria_id_telefono_normalizado_idx" ON "clientes"("concesionaria_id", "telefono_normalizado");

-- CreateIndex
CREATE INDEX "tasaciones_atencion_id_idx" ON "tasaciones"("atencion_id");

-- AddForeignKey
ALTER TABLE "cliente_seguimientos" ADD CONSTRAINT "cliente_seguimientos_atencion_id_fkey" FOREIGN KEY ("atencion_id") REFERENCES "atenciones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasaciones" ADD CONSTRAINT "tasaciones_atencion_id_fkey" FOREIGN KEY ("atencion_id") REFERENCES "atenciones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "atenciones" ADD CONSTRAINT "atenciones_concesionaria_id_fkey" FOREIGN KEY ("concesionaria_id") REFERENCES "concesionarias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "atenciones" ADD CONSTRAINT "atenciones_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "atenciones" ADD CONSTRAINT "atenciones_vendedor_id_fkey" FOREIGN KEY ("vendedor_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "atenciones" ADD CONSTRAINT "atenciones_atencion_anterior_id_fkey" FOREIGN KEY ("atencion_anterior_id") REFERENCES "atenciones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "atencion_vehiculos" ADD CONSTRAINT "atencion_vehiculos_atencion_id_fkey" FOREIGN KEY ("atencion_id") REFERENCES "atenciones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "atencion_vehiculos" ADD CONSTRAINT "atencion_vehiculos_vehiculo_id_fkey" FOREIGN KEY ("vehiculo_id") REFERENCES "vehiculos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitudes_precio_minimo" ADD CONSTRAINT "solicitudes_precio_minimo_concesionaria_id_fkey" FOREIGN KEY ("concesionaria_id") REFERENCES "concesionarias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitudes_precio_minimo" ADD CONSTRAINT "solicitudes_precio_minimo_vehiculo_id_fkey" FOREIGN KEY ("vehiculo_id") REFERENCES "vehiculos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitudes_precio_minimo" ADD CONSTRAINT "solicitudes_precio_minimo_atencion_id_fkey" FOREIGN KEY ("atencion_id") REFERENCES "atenciones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitudes_precio_minimo" ADD CONSTRAINT "solicitudes_precio_minimo_solicitante_id_fkey" FOREIGN KEY ("solicitante_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitudes_precio_minimo" ADD CONSTRAINT "solicitudes_precio_minimo_resuelta_por_id_fkey" FOREIGN KEY ("resuelta_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ═════════════════════════════════════════════════════════════════════════════
-- BACKFILL DE DATOS VIVOS
-- ═════════════════════════════════════════════════════════════════════════════

-- ── 1. Forma canónica del teléfono ───────────────────────────────────────────
-- Hoy el dedupe compara `telefono` con match EXACTO y sin normalizar, así que
-- "2614567890", "261 456-7890", "+54 9 261 456-7890" y "0261 15 4567890" son
-- cuatro clientes distintos. Esta función deja los cuatro en "2614567890".
--
-- ESTA FUNCIÓN ES UN ESPEJO, NO LA REGLA. La regla vive en
-- src/domain/services/telefono.ts (`normalizarTelefono`), que es la que corre en
-- CADA escritura de los cuatro canales de ingesta y la que llena la columna de
-- ahora en más. Acá se replica sólo para poder backfillear las filas históricas
-- en una sentencia, sin levantar Node ni pasear toda la tabla por la app.
--
-- Si las dos se separan, el daño es silencioso y peor que no normalizar: los
-- clientes viejos quedan con una forma canónica que los nuevos nunca matchean, y
-- el dedupe deja de funcionar justo para la cartera histórica. Los pasos de
-- abajo están en el MISMO orden que los del helper de TypeScript, y ese orden
-- importa (el 9 se saca antes que el 0, y las guardas de largo 11/13 evitan
-- comerse dígitos de un número de 10 que empiece con 0 o 9).
CREATE OR REPLACE FUNCTION normalizar_telefono_ar(p_telefono text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    d text;
    i int;
BEGIN
    IF p_telefono IS NULL THEN RETURN NULL; END IF;

    -- 1. Sólo dígitos: se van "+", espacios, guiones, puntos y paréntesis.
    d := regexp_replace(p_telefono, '[^0-9]', '', 'g');
    IF d = '' THEN RETURN NULL; END IF;

    -- 2. "00" de salida internacional.
    IF left(d, 2) = '00' THEN d := substr(d, 3); END IF;

    -- 3. Código de país. La guarda por largo protege a un número nacional de 10
    --    dígitos que empiece con 54.
    IF length(d) > 10 AND left(d, 2) = '54' THEN d := substr(d, 3); END IF;

    -- 4. "9" de celular del formato internacional (+54 9 ...). ANTES que el 0.
    IF length(d) IN (11, 13) AND left(d, 1) = '9' THEN d := substr(d, 2); END IF;

    -- 5. "0" de larga distancia nacional (0261 ...). Sólo con largo 11 o 13: un
    --    fijo de 10 dígitos que arranque con 0 no se toca.
    IF length(d) IN (11, 13) AND left(d, 1) = '0' THEN d := substr(d, 2); END IF;

    -- 6. "15" de celular del formato nacional. Va pegado al código de área, que
    --    mide 2, 3 o 4 dígitos, así que se busca en esas tres posiciones y se
    --    saca la primera que matchee. Sólo con largo 12 = NSN(10) + los dos
    --    dígitos del 15: así un fijo de 10 que contenga "15" nunca se toca.
    IF length(d) = 12 THEN
        FOREACH i IN ARRAY ARRAY[2, 3, 4] LOOP
            IF substr(d, i + 1, 2) = '15' THEN
                d := left(d, i) || substr(d, i + 3);
                EXIT;
            END IF;
        END LOOP;
    END IF;

    -- 7. Con menos de 6 dígitos no se deduplica: devolver "0" o "15" como forma
    --    canónica haría matchear entre sí a todas las fichas con basura cargada.
    IF length(d) >= 6 THEN RETURN d; END IF;
    RETURN NULL;
END;
$$;

UPDATE clientes
SET telefono_normalizado = normalizar_telefono_ar(telefono)
WHERE telefono IS NOT NULL;

-- ── 2. Estado de las tasaciones existentes ───────────────────────────────────
-- La columna entra con DEFAULT 'sin_tasar', que es el valor correcto para una
-- tasación sin valor. Las que YA tienen `valor_estimado` están tasadas: si
-- quedaran en 'sin_tasar', el flujo del tasador las volvería a pedir.
-- Ninguna existente puede ser 'rechazada' (el concepto no existía).
UPDATE tasaciones
SET estado = 'tasada'
WHERE valor_estimado IS NOT NULL
  AND estado = 'sin_tasar';

-- ── 3. Fecha de asignación del vendedor ──────────────────────────────────────
-- No hay registro de cuándo se asignó cada cliente. Se usa `created_at` y no
-- `updated_at` a propósito: `updated_at` se mueve con cualquier edición de la
-- ficha y haría parecer recién asignada a una cartera vieja. `created_at` es la
-- cota inferior honesta (la asignación no pudo ser antes de que el cliente
-- existiera). Es dato de auditoría; el plazo de retención se mide contra
-- `ultima_interaccion_en`, no contra esto.
UPDATE clientes
SET vendedor_asignado_en = created_at
WHERE vendedor_asignado_id IS NOT NULL
  AND vendedor_asignado_en IS NULL;

-- ── 4. Última interacción ────────────────────────────────────────────────────
-- Es el reloj de la retención de la cartera, así que un backfill perezoso
-- (copiar `updated_at`) daría plazos falsos: corregirle la dirección a un
-- cliente de hace un año lo dejaría "caliente" 30 días más. Se toma el último
-- contacto REAL del que hay registro —la fecha más nueva de sus seguimientos—
-- y, si no tiene ninguno, la fecha de alta.
UPDATE clientes c
SET ultima_interaccion_en = GREATEST(
    c.created_at,
    COALESCE(
        (SELECT MAX(s.fecha)::timestamp(3)
           FROM cliente_seguimientos s
          WHERE s.cliente_id = c.id
            AND s.deleted_at IS NULL),
        c.created_at
    )
)
WHERE c.ultima_interaccion_en IS NULL;
