-- CreateEnum
CREATE TYPE "CondicionIva" AS ENUM ('responsable_inscripto', 'monotributo', 'exento', 'consumidor_final');

-- CreateEnum
CREATE TYPE "TipoDocumento" AS ENUM ('CUIT', 'CUIL', 'DNI', 'CF');

-- CreateEnum
CREATE TYPE "TipoComprobanteAfip" AS ENUM ('factura_a', 'factura_b', 'factura_c');

-- CreateEnum
CREATE TYPE "EstadoComprobanteAfip" AS ENUM ('pendiente', 'emitida', 'error');

-- CreateEnum
CREATE TYPE "EntornoAfip" AS ENUM ('mock', 'homologacion', 'produccion');

-- AlterTable
ALTER TABLE "clientes" ADD COLUMN     "condicion_iva" "CondicionIva",
ADD COLUMN     "tipo_doc" "TipoDocumento";

-- AlterTable
ALTER TABLE "concesionarias" ADD COLUMN     "afip_entorno" "EntornoAfip" NOT NULL DEFAULT 'mock',
ADD COLUMN     "condicion_iva" "CondicionIva",
ADD COLUMN     "punto_venta" INTEGER,
ADD COLUMN     "razon_social" TEXT;

-- CreateTable
CREATE TABLE "comprobantes_afip" (
    "id" SERIAL NOT NULL,
    "concesionaria_id" INTEGER NOT NULL,
    "venta_id" INTEGER NOT NULL,
    "tipo_comprobante" "TipoComprobanteAfip" NOT NULL,
    "punto_venta" INTEGER NOT NULL,
    "numero" INTEGER NOT NULL,
    "concepto" INTEGER NOT NULL DEFAULT 1,
    "fecha_comprobante" DATE NOT NULL,
    "receptor_nombre" TEXT NOT NULL,
    "receptor_doc_tipo" INTEGER NOT NULL,
    "receptor_doc_nro" TEXT NOT NULL,
    "receptor_cond_iva" "CondicionIva" NOT NULL,
    "moneda" TEXT NOT NULL DEFAULT 'PES',
    "cotizacion" DECIMAL(18,6) NOT NULL DEFAULT 1,
    "neto" DECIMAL(14,2) NOT NULL,
    "alicuota_iva" DECIMAL(5,2) NOT NULL,
    "iva" DECIMAL(14,2) NOT NULL,
    "total" DECIMAL(14,2) NOT NULL,
    "estado" "EstadoComprobanteAfip" NOT NULL DEFAULT 'pendiente',
    "entorno" "EntornoAfip" NOT NULL,
    "cae" TEXT,
    "cae_vencimiento" DATE,
    "qr_data" TEXT,
    "error_msg" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "comprobantes_afip_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "comprobantes_afip_venta_id_key" ON "comprobantes_afip"("venta_id");

-- CreateIndex
CREATE INDEX "comprobantes_afip_concesionaria_id_idx" ON "comprobantes_afip"("concesionaria_id");

-- CreateIndex
CREATE INDEX "comprobantes_afip_concesionaria_id_tipo_comprobante_punto_v_idx" ON "comprobantes_afip"("concesionaria_id", "tipo_comprobante", "punto_venta");

-- CreateIndex
CREATE UNIQUE INDEX "comprobantes_afip_numero_key" ON "comprobantes_afip"("concesionaria_id", "tipo_comprobante", "punto_venta", "numero");

-- AddForeignKey
ALTER TABLE "comprobantes_afip" ADD CONSTRAINT "comprobantes_afip_concesionaria_id_fkey" FOREIGN KEY ("concesionaria_id") REFERENCES "concesionarias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comprobantes_afip" ADD CONSTRAINT "comprobantes_afip_venta_id_fkey" FOREIGN KEY ("venta_id") REFERENCES "ventas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
