-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "RolNombre" AS ENUM ('admin', 'vendedor', 'cobrador', 'postventa', 'lectura', 'super_admin');

-- CreateEnum
CREATE TYPE "TipoVehiculo" AS ENUM ('USADO', 'CERO_KM');

-- CreateEnum
CREATE TYPE "OrigenVehiculo" AS ENUM ('compra', 'permuta', 'consignacion', 'otro');

-- CreateEnum
CREATE TYPE "EstadoVehiculo" AS ENUM ('preparacion', 'publicado', 'reservado', 'vendido', 'devuelto');

-- CreateEnum
CREATE TYPE "EstadoPresupuesto" AS ENUM ('borrador', 'enviado', 'aceptado', 'rechazado', 'vencido', 'cancelado');

-- CreateEnum
CREATE TYPE "FormaPagoVenta" AS ENUM ('contado', 'transferencia', 'financiado_propio', 'financiado_externo', 'canje_mas_diferencia', 'mixto');

-- CreateEnum
CREATE TYPE "EstadoEntrega" AS ENUM ('pendiente', 'bloqueada', 'autorizada', 'entregada', 'cancelada');

-- CreateEnum
CREATE TYPE "TipoIngresoVehiculo" AS ENUM ('compra_proveedor', 'compra_particular', 'permuta', 'consignacion', 'otro');

-- CreateEnum
CREATE TYPE "EstadoReserva" AS ENUM ('activa', 'vencida', 'cancelada', 'convertida_en_venta');

-- CreateEnum
CREATE TYPE "MetodoPago" AS ENUM ('efectivo', 'transferencia', 'tarjeta', 'cheque', 'otro');

-- CreateEnum
CREATE TYPE "EstadoFinanciacion" AS ENUM ('activa', 'cancelada', 'en_mora', 'refinanciada');

-- CreateEnum
CREATE TYPE "EstadoCuota" AS ENUM ('pendiente', 'parcial', 'pagada', 'vencida');

-- CreateEnum
CREATE TYPE "EstadoSolicitudFinanciacion" AS ENUM ('borrador', 'enviada', 'pendiente', 'aprobada', 'rechazada', 'cancelada');

-- CreateEnum
CREATE TYPE "TipoFinanciera" AS ENUM ('financiera', 'banco', 'otra');

-- CreateEnum
CREATE TYPE "EstadoPostventa" AS ENUM ('pendiente', 'en_curso', 'resuelto');

-- CreateEnum
CREATE TYPE "TipoMovimientoVehiculo" AS ENUM ('traslado', 'preparacion', 'ingreso', 'egreso', 'asignacion_reserva', 'liberacion_reserva', 'otro');

-- CreateEnum
CREATE TYPE "AccionAudit" AS ENUM ('create', 'update', 'cancel', 'delete_soft', 'login', 'logout');

-- CreateEnum
CREATE TYPE "PlanInterval" AS ENUM ('MONTH', 'YEAR');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('trialing', 'active', 'past_due', 'canceled', 'paused');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('draft', 'open', 'paid', 'void', 'uncollectible');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('pending', 'succeeded', 'failed', 'refunded');

-- CreateTable
CREATE TABLE "concesionarias" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "cuit" TEXT,
    "email" TEXT,
    "telefono" TEXT,
    "direccion" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "concesionarias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sucursales" (
    "id" SERIAL NOT NULL,
    "concesionaria_id" INTEGER NOT NULL,
    "nombre" TEXT NOT NULL,
    "direccion" TEXT,
    "ciudad" TEXT,
    "email" TEXT,
    "telefono" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "sucursales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" SERIAL NOT NULL,
    "nombre" "RolNombre" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usuarios" (
    "id" SERIAL NOT NULL,
    "concesionaria_id" INTEGER,
    "sucursal_id" INTEGER,
    "nombre" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usuario_roles" (
    "id" SERIAL NOT NULL,
    "usuario_id" INTEGER NOT NULL,
    "rol_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "usuario_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clientes" (
    "id" SERIAL NOT NULL,
    "concesionaria_id" INTEGER NOT NULL,
    "nombre" TEXT NOT NULL,
    "dni" TEXT,
    "telefono" TEXT,
    "email" TEXT,
    "direccion" TEXT,
    "observaciones" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "clientes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proveedores" (
    "id" SERIAL NOT NULL,
    "concesionaria_id" INTEGER NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo" TEXT,
    "telefono" TEXT,
    "email" TEXT,
    "direccion" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "proveedores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehiculos" (
    "id" SERIAL NOT NULL,
    "concesionaria_id" INTEGER NOT NULL,
    "sucursal_id" INTEGER NOT NULL,
    "tipo" "TipoVehiculo" NOT NULL DEFAULT 'USADO',
    "origen" "OrigenVehiculo" NOT NULL DEFAULT 'compra',
    "marca" TEXT NOT NULL,
    "modelo" TEXT NOT NULL,
    "version" TEXT,
    "anio" INTEGER,
    "dominio" TEXT,
    "vin" TEXT,
    "km_ingreso" INTEGER,
    "color" TEXT,
    "estado" "EstadoVehiculo" NOT NULL DEFAULT 'preparacion',
    "fecha_ingreso" DATE NOT NULL,
    "fecha_compra" DATE,
    "precio_compra" DECIMAL(12,2),
    "precio_lista" DECIMAL(12,2),
    "moneda" TEXT NOT NULL DEFAULT 'ARS',
    "proveedor_compra_id" INTEGER,
    "forma_pago_compra" TEXT,
    "observaciones" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "vehiculos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehiculo_archivos" (
    "id" SERIAL NOT NULL,
    "concesionaria_id" INTEGER,
    "vehiculo_id" INTEGER NOT NULL,
    "tipo" TEXT,
    "url" TEXT NOT NULL,
    "descripcion" TEXT,
    "original_name" TEXT,
    "mime_type" TEXT,
    "size_bytes" INTEGER,
    "storage_key" TEXT,
    "uploaded_by_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "vehiculo_archivos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ingresos_vehiculo" (
    "id" SERIAL NOT NULL,
    "concesionaria_id" INTEGER NOT NULL,
    "sucursal_id" INTEGER NOT NULL,
    "vehiculo_id" INTEGER NOT NULL,
    "tipo_ingreso" "TipoIngresoVehiculo" NOT NULL,
    "cliente_origen_id" INTEGER,
    "proveedor_origen_id" INTEGER,
    "presupuesto_id" INTEGER,
    "venta_id" INTEGER,
    "fecha_ingreso" DATE NOT NULL,
    "valor_tomado" DECIMAL(12,2),
    "observaciones" TEXT,
    "registrado_por_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "ingresos_vehiculo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehiculo_movimientos" (
    "id" SERIAL NOT NULL,
    "concesionaria_id" INTEGER NOT NULL,
    "vehiculo_id" INTEGER NOT NULL,
    "desde_sucursal_id" INTEGER,
    "hasta_sucursal_id" INTEGER,
    "tipo" "TipoMovimientoVehiculo" NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "motivo" TEXT,
    "destino" TEXT,
    "fecha_retorno" TIMESTAMP(3),
    "registrado_por_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "vehiculo_movimientos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reservas" (
    "id" SERIAL NOT NULL,
    "concesionaria_id" INTEGER NOT NULL,
    "sucursal_id" INTEGER NOT NULL,
    "vehiculo_id" INTEGER NOT NULL,
    "cliente_id" INTEGER NOT NULL,
    "creada_por_id" INTEGER,
    "estado" "EstadoReserva" NOT NULL DEFAULT 'activa',
    "fecha" DATE NOT NULL,
    "vence_el" DATE,
    "monto_senia" DECIMAL(12,2),
    "moneda" TEXT NOT NULL DEFAULT 'ARS',
    "metodo" "MetodoPago",
    "referencia" TEXT,
    "observaciones" TEXT,
    "venta_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "reservas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categorias_gasto_vehiculo" (
    "id" SERIAL NOT NULL,
    "concesionaria_id" INTEGER NOT NULL,
    "nombre" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "categorias_gasto_vehiculo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gastos_vehiculo" (
    "id" SERIAL NOT NULL,
    "concesionaria_id" INTEGER NOT NULL,
    "vehiculo_id" INTEGER NOT NULL,
    "categoria_id" INTEGER NOT NULL,
    "proveedor_id" INTEGER,
    "fecha" DATE NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    "moneda" TEXT NOT NULL DEFAULT 'ARS',
    "descripcion" TEXT,
    "comprobante_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "gastos_vehiculo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categorias_gasto_fijo" (
    "id" SERIAL NOT NULL,
    "concesionaria_id" INTEGER NOT NULL,
    "nombre" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "categorias_gasto_fijo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gastos_fijos" (
    "id" SERIAL NOT NULL,
    "concesionaria_id" INTEGER NOT NULL,
    "sucursal_id" INTEGER,
    "categoria_id" INTEGER NOT NULL,
    "proveedor_id" INTEGER,
    "anio" INTEGER NOT NULL,
    "mes" INTEGER NOT NULL,
    "descripcion" TEXT NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    "moneda" TEXT NOT NULL DEFAULT 'ARS',
    "comprobante_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "gastos_fijos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "presupuestos" (
    "id" SERIAL NOT NULL,
    "concesionaria_id" INTEGER NOT NULL,
    "sucursal_id" INTEGER NOT NULL,
    "nro_presupuesto" TEXT NOT NULL,
    "cliente_id" INTEGER NOT NULL,
    "vendedor_id" INTEGER NOT NULL,
    "fecha_creacion" DATE NOT NULL,
    "valido_hasta" DATE,
    "estado" "EstadoPresupuesto" NOT NULL DEFAULT 'borrador',
    "moneda" TEXT NOT NULL DEFAULT 'ARS',
    "observaciones" TEXT,
    "pdf_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "presupuestos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "presupuesto_items" (
    "id" SERIAL NOT NULL,
    "concesionaria_id" INTEGER,
    "presupuesto_id" INTEGER NOT NULL,
    "vehiculo_id" INTEGER NOT NULL,
    "precio_lista" DECIMAL(12,2) NOT NULL,
    "descuento" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "precio_final" DECIMAL(12,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "presupuesto_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "presupuesto_extras" (
    "id" SERIAL NOT NULL,
    "concesionaria_id" INTEGER,
    "presupuesto_id" INTEGER NOT NULL,
    "descripcion" TEXT NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "presupuesto_extras_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "presupuesto_canje" (
    "id" SERIAL NOT NULL,
    "concesionaria_id" INTEGER,
    "presupuesto_id" INTEGER NOT NULL,
    "descripcion" TEXT,
    "anio" INTEGER,
    "km" INTEGER,
    "dominio" TEXT,
    "valor_tomado" DECIMAL(12,2) NOT NULL,
    "observaciones" TEXT,
    "crear_en_inventario" BOOLEAN NOT NULL DEFAULT true,
    "vehiculo_generado_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "presupuesto_canje_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ventas" (
    "id" SERIAL NOT NULL,
    "concesionaria_id" INTEGER NOT NULL,
    "sucursal_id" INTEGER NOT NULL,
    "vehiculo_id" INTEGER NOT NULL,
    "presupuesto_id" INTEGER,
    "cliente_id" INTEGER NOT NULL,
    "vendedor_id" INTEGER NOT NULL,
    "fecha_venta" DATE NOT NULL,
    "precio_venta" DECIMAL(12,2) NOT NULL,
    "moneda" TEXT NOT NULL DEFAULT 'ARS',
    "forma_pago" "FormaPagoVenta" NOT NULL DEFAULT 'contado',
    "observaciones" TEXT,
    "estado_entrega" "EstadoEntrega" NOT NULL DEFAULT 'pendiente',
    "fecha_entrega" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "ventas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "venta_extras" (
    "id" SERIAL NOT NULL,
    "concesionaria_id" INTEGER,
    "venta_id" INTEGER NOT NULL,
    "descripcion" TEXT NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    "comprobante_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "venta_extras_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "venta_pagos" (
    "id" SERIAL NOT NULL,
    "concesionaria_id" INTEGER,
    "venta_id" INTEGER NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "monto" DECIMAL(12,2) NOT NULL,
    "metodo" "MetodoPago" NOT NULL,
    "tipo" TEXT,
    "referencia" TEXT,
    "comprobante_url" TEXT,
    "observaciones" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "venta_pagos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "venta_canje_vehiculo" (
    "id" SERIAL NOT NULL,
    "concesionaria_id" INTEGER,
    "venta_id" INTEGER NOT NULL,
    "vehiculo_canje_id" INTEGER NOT NULL,
    "valor_tomado" DECIMAL(12,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "venta_canje_vehiculo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financiaciones" (
    "id" SERIAL NOT NULL,
    "concesionaria_id" INTEGER NOT NULL,
    "sucursal_id" INTEGER,
    "venta_id" INTEGER NOT NULL,
    "cliente_id" INTEGER NOT NULL,
    "cobrador_id" INTEGER,
    "fecha_inicio" DATE NOT NULL,
    "monto_financiado" DECIMAL(12,2) NOT NULL,
    "moneda" TEXT NOT NULL DEFAULT 'ARS',
    "cuotas" INTEGER NOT NULL,
    "dia_vencimiento" INTEGER NOT NULL,
    "tasa_mensual" DECIMAL(8,4),
    "estado" "EstadoFinanciacion" NOT NULL DEFAULT 'activa',
    "observaciones" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "financiaciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cuotas" (
    "id" SERIAL NOT NULL,
    "concesionaria_id" INTEGER,
    "financiacion_id" INTEGER NOT NULL,
    "nro_cuota" INTEGER NOT NULL,
    "vencimiento" DATE NOT NULL,
    "monto_cuota" DECIMAL(12,2) NOT NULL,
    "saldo_cuota" DECIMAL(12,2) NOT NULL,
    "estado" "EstadoCuota" NOT NULL DEFAULT 'pendiente',
    "fecha_pago_completo" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "cuotas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pagos_cuota" (
    "id" SERIAL NOT NULL,
    "concesionaria_id" INTEGER,
    "cuota_id" INTEGER NOT NULL,
    "fecha_pago" TIMESTAMP(3) NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    "metodo" "MetodoPago" NOT NULL,
    "referencia" TEXT,
    "observaciones" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "pagos_cuota_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financieras" (
    "id" SERIAL NOT NULL,
    "concesionaria_id" INTEGER NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo" "TipoFinanciera" NOT NULL DEFAULT 'financiera',
    "contacto" TEXT,
    "telefono" TEXT,
    "email" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "financieras_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "solicitudes_financiacion" (
    "id" SERIAL NOT NULL,
    "concesionaria_id" INTEGER NOT NULL,
    "sucursal_id" INTEGER,
    "venta_id" INTEGER,
    "presupuesto_id" INTEGER,
    "cliente_id" INTEGER NOT NULL,
    "financiera_id" INTEGER NOT NULL,
    "estado" "EstadoSolicitudFinanciacion" NOT NULL DEFAULT 'borrador',
    "monto_solicitado" DECIMAL(12,2),
    "plazo_cuotas" INTEGER,
    "tasa_estimada" DECIMAL(8,4),
    "fecha_envio" TIMESTAMP(3),
    "fecha_respuesta" TIMESTAMP(3),
    "monto_aprobado" DECIMAL(12,2),
    "tasa_final" DECIMAL(8,4),
    "observaciones" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "solicitudes_financiacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "solicitud_financiacion_archivos" (
    "id" SERIAL NOT NULL,
    "concesionaria_id" INTEGER,
    "solicitud_id" INTEGER NOT NULL,
    "tipo" TEXT,
    "url" TEXT NOT NULL,
    "descripcion" TEXT,
    "original_name" TEXT,
    "mime_type" TEXT,
    "size_bytes" INTEGER,
    "storage_key" TEXT,
    "uploaded_by_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "solicitud_financiacion_archivos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "postventa_casos" (
    "id" SERIAL NOT NULL,
    "concesionaria_id" INTEGER NOT NULL,
    "sucursal_id" INTEGER NOT NULL,
    "venta_id" INTEGER NOT NULL,
    "vehiculo_id" INTEGER NOT NULL,
    "cliente_id" INTEGER NOT NULL,
    "fecha_reclamo" DATE NOT NULL,
    "tipo" TEXT,
    "descripcion" TEXT NOT NULL,
    "estado" "EstadoPostventa" NOT NULL DEFAULT 'pendiente',
    "fecha_cierre" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "postventa_casos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "postventa_items" (
    "id" SERIAL NOT NULL,
    "concesionaria_id" INTEGER,
    "caso_id" INTEGER NOT NULL,
    "proveedor_id" INTEGER,
    "fecha" DATE NOT NULL,
    "descripcion" TEXT NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    "comprobante_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "postventa_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" SERIAL NOT NULL,
    "concesionaria_id" INTEGER NOT NULL,
    "usuario_id" INTEGER,
    "entidad" TEXT NOT NULL,
    "entidad_id" INTEGER,
    "accion" "AccionAudit" NOT NULL,
    "detalle" TEXT,
    "ip" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "planes" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "interval" "PlanInterval" NOT NULL DEFAULT 'MONTH',
    "precio" DECIMAL(12,2) NOT NULL,
    "moneda" TEXT NOT NULL DEFAULT 'ARS',
    "max_usuarios" INTEGER,
    "max_sucursales" INTEGER,
    "max_vehiculos" INTEGER,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "planes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "concesionaria_subscriptions" (
    "id" SERIAL NOT NULL,
    "concesionaria_id" INTEGER NOT NULL,
    "plan_id" INTEGER NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'trialing',
    "trial_ends_at" TIMESTAMP(3),
    "current_period_start" TIMESTAMP(3),
    "current_period_end" TIMESTAMP(3),
    "provider" TEXT,
    "provider_customer_id" TEXT,
    "provider_subscription_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "concesionaria_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" SERIAL NOT NULL,
    "concesionaria_id" INTEGER,
    "subscription_id" INTEGER NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'open',
    "numero" TEXT,
    "periodo_desde" TIMESTAMP(3),
    "periodo_hasta" TIMESTAMP(3),
    "subtotal" DECIMAL(12,2) NOT NULL,
    "impuestos" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(12,2) NOT NULL,
    "moneda" TEXT NOT NULL DEFAULT 'ARS',
    "due_date" TIMESTAMP(3),
    "paid_at" TIMESTAMP(3),
    "provider_invoice_id" TEXT,
    "pdf_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" SERIAL NOT NULL,
    "concesionaria_id" INTEGER,
    "invoice_id" INTEGER NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'pending',
    "monto" DECIMAL(12,2) NOT NULL,
    "moneda" TEXT NOT NULL DEFAULT 'ARS',
    "provider" TEXT,
    "provider_payment_id" TEXT,
    "metodo" "MetodoPago",
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" SERIAL NOT NULL,
    "token" TEXT NOT NULL,
    "usuario_id" INTEGER NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "is_revoked" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "infoauto_brands" (
    "id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "models_count" INTEGER NOT NULL DEFAULT 0,
    "models_synced_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "infoauto_brands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "infoauto_models" (
    "id" INTEGER NOT NULL,
    "brand_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "versions_count" INTEGER NOT NULL DEFAULT 0,
    "versions_synced_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "infoauto_models_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "infoauto_versions" (
    "id" INTEGER NOT NULL,
    "model_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "available_years" INTEGER[],
    "prices_synced_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "infoauto_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "infoauto_prices" (
    "id" SERIAL NOT NULL,
    "version_id" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "price_usd" DECIMAL(12,2),
    "exchange_rate" DECIMAL(12,2),
    "recorded_at" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "infoauto_prices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" SERIAL NOT NULL,
    "usuario_id" INTEGER NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sucursales_concesionaria_id_idx" ON "sucursales"("concesionaria_id");

-- CreateIndex
CREATE UNIQUE INDEX "sucursales_concesionaria_id_nombre_key" ON "sucursales"("concesionaria_id", "nombre");

-- CreateIndex
CREATE UNIQUE INDEX "roles_nombre_key" ON "roles"("nombre");

-- CreateIndex
CREATE INDEX "usuarios_concesionaria_id_idx" ON "usuarios"("concesionaria_id");

-- CreateIndex
CREATE INDEX "usuarios_email_idx" ON "usuarios"("email");

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_concesionaria_id_email_key" ON "usuarios"("concesionaria_id", "email");

-- CreateIndex
CREATE UNIQUE INDEX "usuario_roles_usuario_id_rol_id_key" ON "usuario_roles"("usuario_id", "rol_id");

-- CreateIndex
CREATE INDEX "clientes_concesionaria_id_idx" ON "clientes"("concesionaria_id");

-- CreateIndex
CREATE INDEX "clientes_dni_idx" ON "clientes"("dni");

-- CreateIndex
CREATE INDEX "clientes_telefono_idx" ON "clientes"("telefono");

-- CreateIndex
CREATE INDEX "proveedores_concesionaria_id_idx" ON "proveedores"("concesionaria_id");

-- CreateIndex
CREATE INDEX "proveedores_tipo_idx" ON "proveedores"("tipo");

-- CreateIndex
CREATE INDEX "vehiculos_concesionaria_id_idx" ON "vehiculos"("concesionaria_id");

-- CreateIndex
CREATE INDEX "vehiculos_sucursal_id_idx" ON "vehiculos"("sucursal_id");

-- CreateIndex
CREATE INDEX "vehiculos_dominio_idx" ON "vehiculos"("dominio");

-- CreateIndex
CREATE INDEX "vehiculos_vin_idx" ON "vehiculos"("vin");

-- CreateIndex
CREATE INDEX "vehiculos_estado_idx" ON "vehiculos"("estado");

-- CreateIndex
CREATE UNIQUE INDEX "vehiculos_concesionaria_id_vin_key" ON "vehiculos"("concesionaria_id", "vin");

-- CreateIndex
CREATE INDEX "vehiculo_archivos_concesionaria_id_idx" ON "vehiculo_archivos"("concesionaria_id");

-- CreateIndex
CREATE INDEX "vehiculo_archivos_vehiculo_id_idx" ON "vehiculo_archivos"("vehiculo_id");

-- CreateIndex
CREATE INDEX "ingresos_vehiculo_concesionaria_id_idx" ON "ingresos_vehiculo"("concesionaria_id");

-- CreateIndex
CREATE INDEX "ingresos_vehiculo_sucursal_id_idx" ON "ingresos_vehiculo"("sucursal_id");

-- CreateIndex
CREATE INDEX "ingresos_vehiculo_vehiculo_id_idx" ON "ingresos_vehiculo"("vehiculo_id");

-- CreateIndex
CREATE INDEX "vehiculo_movimientos_concesionaria_id_idx" ON "vehiculo_movimientos"("concesionaria_id");

-- CreateIndex
CREATE INDEX "vehiculo_movimientos_vehiculo_id_idx" ON "vehiculo_movimientos"("vehiculo_id");

-- CreateIndex
CREATE INDEX "vehiculo_movimientos_desde_sucursal_id_idx" ON "vehiculo_movimientos"("desde_sucursal_id");

-- CreateIndex
CREATE INDEX "vehiculo_movimientos_hasta_sucursal_id_idx" ON "vehiculo_movimientos"("hasta_sucursal_id");

-- CreateIndex
CREATE INDEX "reservas_concesionaria_id_idx" ON "reservas"("concesionaria_id");

-- CreateIndex
CREATE INDEX "reservas_sucursal_id_idx" ON "reservas"("sucursal_id");

-- CreateIndex
CREATE INDEX "reservas_vehiculo_id_idx" ON "reservas"("vehiculo_id");

-- CreateIndex
CREATE INDEX "reservas_cliente_id_idx" ON "reservas"("cliente_id");

-- CreateIndex
CREATE INDEX "reservas_estado_idx" ON "reservas"("estado");

-- CreateIndex
CREATE UNIQUE INDEX "categorias_gasto_vehiculo_concesionaria_id_nombre_key" ON "categorias_gasto_vehiculo"("concesionaria_id", "nombre");

-- CreateIndex
CREATE INDEX "gastos_vehiculo_concesionaria_id_idx" ON "gastos_vehiculo"("concesionaria_id");

-- CreateIndex
CREATE INDEX "gastos_vehiculo_vehiculo_id_idx" ON "gastos_vehiculo"("vehiculo_id");

-- CreateIndex
CREATE INDEX "gastos_vehiculo_fecha_idx" ON "gastos_vehiculo"("fecha");

-- CreateIndex
CREATE INDEX "gastos_vehiculo_categoria_id_idx" ON "gastos_vehiculo"("categoria_id");

-- CreateIndex
CREATE UNIQUE INDEX "categorias_gasto_fijo_concesionaria_id_nombre_key" ON "categorias_gasto_fijo"("concesionaria_id", "nombre");

-- CreateIndex
CREATE INDEX "gastos_fijos_concesionaria_id_idx" ON "gastos_fijos"("concesionaria_id");

-- CreateIndex
CREATE INDEX "gastos_fijos_sucursal_id_idx" ON "gastos_fijos"("sucursal_id");

-- CreateIndex
CREATE INDEX "gastos_fijos_concesionaria_id_anio_mes_idx" ON "gastos_fijos"("concesionaria_id", "anio", "mes");

-- CreateIndex
CREATE INDEX "gastos_fijos_categoria_id_idx" ON "gastos_fijos"("categoria_id");

-- CreateIndex
CREATE INDEX "presupuestos_concesionaria_id_idx" ON "presupuestos"("concesionaria_id");

-- CreateIndex
CREATE INDEX "presupuestos_sucursal_id_idx" ON "presupuestos"("sucursal_id");

-- CreateIndex
CREATE INDEX "presupuestos_cliente_id_idx" ON "presupuestos"("cliente_id");

-- CreateIndex
CREATE INDEX "presupuestos_vendedor_id_idx" ON "presupuestos"("vendedor_id");

-- CreateIndex
CREATE INDEX "presupuestos_estado_idx" ON "presupuestos"("estado");

-- CreateIndex
CREATE UNIQUE INDEX "presupuestos_concesionaria_id_nro_presupuesto_key" ON "presupuestos"("concesionaria_id", "nro_presupuesto");

-- CreateIndex
CREATE INDEX "presupuesto_items_concesionaria_id_idx" ON "presupuesto_items"("concesionaria_id");

-- CreateIndex
CREATE INDEX "presupuesto_items_presupuesto_id_idx" ON "presupuesto_items"("presupuesto_id");

-- CreateIndex
CREATE INDEX "presupuesto_items_vehiculo_id_idx" ON "presupuesto_items"("vehiculo_id");

-- CreateIndex
CREATE INDEX "presupuesto_extras_concesionaria_id_idx" ON "presupuesto_extras"("concesionaria_id");

-- CreateIndex
CREATE INDEX "presupuesto_extras_presupuesto_id_idx" ON "presupuesto_extras"("presupuesto_id");

-- CreateIndex
CREATE UNIQUE INDEX "presupuesto_canje_presupuesto_id_key" ON "presupuesto_canje"("presupuesto_id");

-- CreateIndex
CREATE INDEX "presupuesto_canje_concesionaria_id_idx" ON "presupuesto_canje"("concesionaria_id");

-- CreateIndex
CREATE UNIQUE INDEX "ventas_vehiculo_id_key" ON "ventas"("vehiculo_id");

-- CreateIndex
CREATE UNIQUE INDEX "ventas_presupuesto_id_key" ON "ventas"("presupuesto_id");

-- CreateIndex
CREATE INDEX "ventas_concesionaria_id_idx" ON "ventas"("concesionaria_id");

-- CreateIndex
CREATE INDEX "ventas_sucursal_id_idx" ON "ventas"("sucursal_id");

-- CreateIndex
CREATE INDEX "ventas_cliente_id_idx" ON "ventas"("cliente_id");

-- CreateIndex
CREATE INDEX "ventas_vendedor_id_idx" ON "ventas"("vendedor_id");

-- CreateIndex
CREATE INDEX "ventas_fecha_venta_idx" ON "ventas"("fecha_venta");

-- CreateIndex
CREATE INDEX "ventas_estado_entrega_idx" ON "ventas"("estado_entrega");

-- CreateIndex
CREATE INDEX "venta_extras_concesionaria_id_idx" ON "venta_extras"("concesionaria_id");

-- CreateIndex
CREATE INDEX "venta_extras_venta_id_idx" ON "venta_extras"("venta_id");

-- CreateIndex
CREATE INDEX "venta_pagos_concesionaria_id_idx" ON "venta_pagos"("concesionaria_id");

-- CreateIndex
CREATE INDEX "venta_pagos_venta_id_idx" ON "venta_pagos"("venta_id");

-- CreateIndex
CREATE INDEX "venta_pagos_fecha_idx" ON "venta_pagos"("fecha");

-- CreateIndex
CREATE INDEX "venta_canje_vehiculo_concesionaria_id_idx" ON "venta_canje_vehiculo"("concesionaria_id");

-- CreateIndex
CREATE INDEX "venta_canje_vehiculo_venta_id_idx" ON "venta_canje_vehiculo"("venta_id");

-- CreateIndex
CREATE INDEX "venta_canje_vehiculo_vehiculo_canje_id_idx" ON "venta_canje_vehiculo"("vehiculo_canje_id");

-- CreateIndex
CREATE UNIQUE INDEX "financiaciones_venta_id_key" ON "financiaciones"("venta_id");

-- CreateIndex
CREATE INDEX "financiaciones_concesionaria_id_idx" ON "financiaciones"("concesionaria_id");

-- CreateIndex
CREATE INDEX "financiaciones_sucursal_id_idx" ON "financiaciones"("sucursal_id");

-- CreateIndex
CREATE INDEX "financiaciones_cliente_id_idx" ON "financiaciones"("cliente_id");

-- CreateIndex
CREATE INDEX "financiaciones_cobrador_id_idx" ON "financiaciones"("cobrador_id");

-- CreateIndex
CREATE INDEX "cuotas_concesionaria_id_idx" ON "cuotas"("concesionaria_id");

-- CreateIndex
CREATE INDEX "cuotas_vencimiento_idx" ON "cuotas"("vencimiento");

-- CreateIndex
CREATE INDEX "cuotas_estado_idx" ON "cuotas"("estado");

-- CreateIndex
CREATE UNIQUE INDEX "cuotas_financiacion_id_nro_cuota_key" ON "cuotas"("financiacion_id", "nro_cuota");

-- CreateIndex
CREATE INDEX "pagos_cuota_concesionaria_id_idx" ON "pagos_cuota"("concesionaria_id");

-- CreateIndex
CREATE INDEX "pagos_cuota_cuota_id_idx" ON "pagos_cuota"("cuota_id");

-- CreateIndex
CREATE INDEX "pagos_cuota_fecha_pago_idx" ON "pagos_cuota"("fecha_pago");

-- CreateIndex
CREATE INDEX "financieras_concesionaria_id_idx" ON "financieras"("concesionaria_id");

-- CreateIndex
CREATE UNIQUE INDEX "financieras_concesionaria_id_nombre_key" ON "financieras"("concesionaria_id", "nombre");

-- CreateIndex
CREATE INDEX "solicitudes_financiacion_concesionaria_id_idx" ON "solicitudes_financiacion"("concesionaria_id");

-- CreateIndex
CREATE INDEX "solicitudes_financiacion_sucursal_id_idx" ON "solicitudes_financiacion"("sucursal_id");

-- CreateIndex
CREATE INDEX "solicitudes_financiacion_cliente_id_idx" ON "solicitudes_financiacion"("cliente_id");

-- CreateIndex
CREATE INDEX "solicitudes_financiacion_financiera_id_idx" ON "solicitudes_financiacion"("financiera_id");

-- CreateIndex
CREATE INDEX "solicitudes_financiacion_estado_idx" ON "solicitudes_financiacion"("estado");

-- CreateIndex
CREATE INDEX "solicitud_financiacion_archivos_concesionaria_id_idx" ON "solicitud_financiacion_archivos"("concesionaria_id");

-- CreateIndex
CREATE INDEX "solicitud_financiacion_archivos_solicitud_id_idx" ON "solicitud_financiacion_archivos"("solicitud_id");

-- CreateIndex
CREATE INDEX "postventa_casos_concesionaria_id_idx" ON "postventa_casos"("concesionaria_id");

-- CreateIndex
CREATE INDEX "postventa_casos_sucursal_id_idx" ON "postventa_casos"("sucursal_id");

-- CreateIndex
CREATE INDEX "postventa_casos_venta_id_idx" ON "postventa_casos"("venta_id");

-- CreateIndex
CREATE INDEX "postventa_casos_vehiculo_id_idx" ON "postventa_casos"("vehiculo_id");

-- CreateIndex
CREATE INDEX "postventa_casos_cliente_id_idx" ON "postventa_casos"("cliente_id");

-- CreateIndex
CREATE INDEX "postventa_casos_estado_idx" ON "postventa_casos"("estado");

-- CreateIndex
CREATE INDEX "postventa_items_concesionaria_id_idx" ON "postventa_items"("concesionaria_id");

-- CreateIndex
CREATE INDEX "postventa_items_caso_id_idx" ON "postventa_items"("caso_id");

-- CreateIndex
CREATE INDEX "postventa_items_proveedor_id_idx" ON "postventa_items"("proveedor_id");

-- CreateIndex
CREATE INDEX "audit_log_concesionaria_id_idx" ON "audit_log"("concesionaria_id");

-- CreateIndex
CREATE INDEX "audit_log_usuario_id_idx" ON "audit_log"("usuario_id");

-- CreateIndex
CREATE INDEX "audit_log_entidad_idx" ON "audit_log"("entidad");

-- CreateIndex
CREATE INDEX "audit_log_concesionaria_id_created_at_idx" ON "audit_log"("concesionaria_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "planes_nombre_key" ON "planes"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "concesionaria_subscriptions_concesionaria_id_key" ON "concesionaria_subscriptions"("concesionaria_id");

-- CreateIndex
CREATE INDEX "concesionaria_subscriptions_plan_id_idx" ON "concesionaria_subscriptions"("plan_id");

-- CreateIndex
CREATE INDEX "concesionaria_subscriptions_status_idx" ON "concesionaria_subscriptions"("status");

-- CreateIndex
CREATE INDEX "invoices_concesionaria_id_idx" ON "invoices"("concesionaria_id");

-- CreateIndex
CREATE INDEX "invoices_subscription_id_idx" ON "invoices"("subscription_id");

-- CreateIndex
CREATE INDEX "invoices_status_idx" ON "invoices"("status");

-- CreateIndex
CREATE INDEX "payments_concesionaria_id_idx" ON "payments"("concesionaria_id");

-- CreateIndex
CREATE INDEX "payments_invoice_id_idx" ON "payments"("invoice_id");

-- CreateIndex
CREATE INDEX "payments_status_idx" ON "payments"("status");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_key" ON "refresh_tokens"("token");

-- CreateIndex
CREATE INDEX "infoauto_brands_name_idx" ON "infoauto_brands"("name");

-- CreateIndex
CREATE INDEX "infoauto_models_brand_id_idx" ON "infoauto_models"("brand_id");

-- CreateIndex
CREATE INDEX "infoauto_models_name_idx" ON "infoauto_models"("name");

-- CreateIndex
CREATE INDEX "infoauto_versions_model_id_idx" ON "infoauto_versions"("model_id");

-- CreateIndex
CREATE UNIQUE INDEX "infoauto_prices_version_id_year_key" ON "infoauto_prices"("version_id", "year");

-- CreateIndex
CREATE INDEX "password_reset_tokens_token_hash_idx" ON "password_reset_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "password_reset_tokens_usuario_id_idx" ON "password_reset_tokens"("usuario_id");

-- AddForeignKey
ALTER TABLE "sucursales" ADD CONSTRAINT "sucursales_concesionaria_id_fkey" FOREIGN KEY ("concesionaria_id") REFERENCES "concesionarias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_concesionaria_id_fkey" FOREIGN KEY ("concesionaria_id") REFERENCES "concesionarias"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursales"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuario_roles" ADD CONSTRAINT "usuario_roles_rol_id_fkey" FOREIGN KEY ("rol_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuario_roles" ADD CONSTRAINT "usuario_roles_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_concesionaria_id_fkey" FOREIGN KEY ("concesionaria_id") REFERENCES "concesionarias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proveedores" ADD CONSTRAINT "proveedores_concesionaria_id_fkey" FOREIGN KEY ("concesionaria_id") REFERENCES "concesionarias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehiculos" ADD CONSTRAINT "vehiculos_concesionaria_id_fkey" FOREIGN KEY ("concesionaria_id") REFERENCES "concesionarias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehiculos" ADD CONSTRAINT "vehiculos_proveedor_compra_id_fkey" FOREIGN KEY ("proveedor_compra_id") REFERENCES "proveedores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehiculos" ADD CONSTRAINT "vehiculos_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehiculo_archivos" ADD CONSTRAINT "vehiculo_archivos_vehiculo_id_fkey" FOREIGN KEY ("vehiculo_id") REFERENCES "vehiculos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingresos_vehiculo" ADD CONSTRAINT "ingresos_vehiculo_cliente_origen_id_fkey" FOREIGN KEY ("cliente_origen_id") REFERENCES "clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingresos_vehiculo" ADD CONSTRAINT "ingresos_vehiculo_concesionaria_id_fkey" FOREIGN KEY ("concesionaria_id") REFERENCES "concesionarias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingresos_vehiculo" ADD CONSTRAINT "ingresos_vehiculo_presupuesto_id_fkey" FOREIGN KEY ("presupuesto_id") REFERENCES "presupuestos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingresos_vehiculo" ADD CONSTRAINT "ingresos_vehiculo_proveedor_origen_id_fkey" FOREIGN KEY ("proveedor_origen_id") REFERENCES "proveedores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingresos_vehiculo" ADD CONSTRAINT "ingresos_vehiculo_registrado_por_id_fkey" FOREIGN KEY ("registrado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingresos_vehiculo" ADD CONSTRAINT "ingresos_vehiculo_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingresos_vehiculo" ADD CONSTRAINT "ingresos_vehiculo_vehiculo_id_fkey" FOREIGN KEY ("vehiculo_id") REFERENCES "vehiculos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingresos_vehiculo" ADD CONSTRAINT "ingresos_vehiculo_venta_id_fkey" FOREIGN KEY ("venta_id") REFERENCES "ventas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehiculo_movimientos" ADD CONSTRAINT "vehiculo_movimientos_concesionaria_id_fkey" FOREIGN KEY ("concesionaria_id") REFERENCES "concesionarias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehiculo_movimientos" ADD CONSTRAINT "vehiculo_movimientos_desde_sucursal_id_fkey" FOREIGN KEY ("desde_sucursal_id") REFERENCES "sucursales"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehiculo_movimientos" ADD CONSTRAINT "vehiculo_movimientos_hasta_sucursal_id_fkey" FOREIGN KEY ("hasta_sucursal_id") REFERENCES "sucursales"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehiculo_movimientos" ADD CONSTRAINT "vehiculo_movimientos_registrado_por_id_fkey" FOREIGN KEY ("registrado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehiculo_movimientos" ADD CONSTRAINT "vehiculo_movimientos_vehiculo_id_fkey" FOREIGN KEY ("vehiculo_id") REFERENCES "vehiculos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservas" ADD CONSTRAINT "reservas_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservas" ADD CONSTRAINT "reservas_concesionaria_id_fkey" FOREIGN KEY ("concesionaria_id") REFERENCES "concesionarias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservas" ADD CONSTRAINT "reservas_creada_por_id_fkey" FOREIGN KEY ("creada_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservas" ADD CONSTRAINT "reservas_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservas" ADD CONSTRAINT "reservas_vehiculo_id_fkey" FOREIGN KEY ("vehiculo_id") REFERENCES "vehiculos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservas" ADD CONSTRAINT "reservas_venta_id_fkey" FOREIGN KEY ("venta_id") REFERENCES "ventas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categorias_gasto_vehiculo" ADD CONSTRAINT "categorias_gasto_vehiculo_concesionaria_id_fkey" FOREIGN KEY ("concesionaria_id") REFERENCES "concesionarias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gastos_vehiculo" ADD CONSTRAINT "gastos_vehiculo_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "categorias_gasto_vehiculo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gastos_vehiculo" ADD CONSTRAINT "gastos_vehiculo_concesionaria_id_fkey" FOREIGN KEY ("concesionaria_id") REFERENCES "concesionarias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gastos_vehiculo" ADD CONSTRAINT "gastos_vehiculo_proveedor_id_fkey" FOREIGN KEY ("proveedor_id") REFERENCES "proveedores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gastos_vehiculo" ADD CONSTRAINT "gastos_vehiculo_vehiculo_id_fkey" FOREIGN KEY ("vehiculo_id") REFERENCES "vehiculos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categorias_gasto_fijo" ADD CONSTRAINT "categorias_gasto_fijo_concesionaria_id_fkey" FOREIGN KEY ("concesionaria_id") REFERENCES "concesionarias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gastos_fijos" ADD CONSTRAINT "gastos_fijos_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "categorias_gasto_fijo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gastos_fijos" ADD CONSTRAINT "gastos_fijos_concesionaria_id_fkey" FOREIGN KEY ("concesionaria_id") REFERENCES "concesionarias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gastos_fijos" ADD CONSTRAINT "gastos_fijos_proveedor_id_fkey" FOREIGN KEY ("proveedor_id") REFERENCES "proveedores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gastos_fijos" ADD CONSTRAINT "gastos_fijos_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursales"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "presupuestos" ADD CONSTRAINT "presupuestos_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "presupuestos" ADD CONSTRAINT "presupuestos_concesionaria_id_fkey" FOREIGN KEY ("concesionaria_id") REFERENCES "concesionarias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "presupuestos" ADD CONSTRAINT "presupuestos_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "presupuestos" ADD CONSTRAINT "presupuestos_vendedor_id_fkey" FOREIGN KEY ("vendedor_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "presupuesto_items" ADD CONSTRAINT "presupuesto_items_presupuesto_id_fkey" FOREIGN KEY ("presupuesto_id") REFERENCES "presupuestos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "presupuesto_items" ADD CONSTRAINT "presupuesto_items_vehiculo_id_fkey" FOREIGN KEY ("vehiculo_id") REFERENCES "vehiculos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "presupuesto_extras" ADD CONSTRAINT "presupuesto_extras_presupuesto_id_fkey" FOREIGN KEY ("presupuesto_id") REFERENCES "presupuestos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "presupuesto_canje" ADD CONSTRAINT "presupuesto_canje_presupuesto_id_fkey" FOREIGN KEY ("presupuesto_id") REFERENCES "presupuestos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "presupuesto_canje" ADD CONSTRAINT "presupuesto_canje_vehiculo_generado_id_fkey" FOREIGN KEY ("vehiculo_generado_id") REFERENCES "vehiculos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_concesionaria_id_fkey" FOREIGN KEY ("concesionaria_id") REFERENCES "concesionarias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_presupuesto_id_fkey" FOREIGN KEY ("presupuesto_id") REFERENCES "presupuestos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_vehiculo_id_fkey" FOREIGN KEY ("vehiculo_id") REFERENCES "vehiculos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_vendedor_id_fkey" FOREIGN KEY ("vendedor_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "venta_extras" ADD CONSTRAINT "venta_extras_venta_id_fkey" FOREIGN KEY ("venta_id") REFERENCES "ventas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "venta_pagos" ADD CONSTRAINT "venta_pagos_venta_id_fkey" FOREIGN KEY ("venta_id") REFERENCES "ventas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "venta_canje_vehiculo" ADD CONSTRAINT "venta_canje_vehiculo_vehiculo_canje_id_fkey" FOREIGN KEY ("vehiculo_canje_id") REFERENCES "vehiculos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "venta_canje_vehiculo" ADD CONSTRAINT "venta_canje_vehiculo_venta_id_fkey" FOREIGN KEY ("venta_id") REFERENCES "ventas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financiaciones" ADD CONSTRAINT "financiaciones_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financiaciones" ADD CONSTRAINT "financiaciones_cobrador_id_fkey" FOREIGN KEY ("cobrador_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financiaciones" ADD CONSTRAINT "financiaciones_concesionaria_id_fkey" FOREIGN KEY ("concesionaria_id") REFERENCES "concesionarias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financiaciones" ADD CONSTRAINT "financiaciones_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursales"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financiaciones" ADD CONSTRAINT "financiaciones_venta_id_fkey" FOREIGN KEY ("venta_id") REFERENCES "ventas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cuotas" ADD CONSTRAINT "cuotas_financiacion_id_fkey" FOREIGN KEY ("financiacion_id") REFERENCES "financiaciones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pagos_cuota" ADD CONSTRAINT "pagos_cuota_cuota_id_fkey" FOREIGN KEY ("cuota_id") REFERENCES "cuotas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financieras" ADD CONSTRAINT "financieras_concesionaria_id_fkey" FOREIGN KEY ("concesionaria_id") REFERENCES "concesionarias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitudes_financiacion" ADD CONSTRAINT "solicitudes_financiacion_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitudes_financiacion" ADD CONSTRAINT "solicitudes_financiacion_concesionaria_id_fkey" FOREIGN KEY ("concesionaria_id") REFERENCES "concesionarias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitudes_financiacion" ADD CONSTRAINT "solicitudes_financiacion_financiera_id_fkey" FOREIGN KEY ("financiera_id") REFERENCES "financieras"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitudes_financiacion" ADD CONSTRAINT "solicitudes_financiacion_presupuesto_id_fkey" FOREIGN KEY ("presupuesto_id") REFERENCES "presupuestos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitudes_financiacion" ADD CONSTRAINT "solicitudes_financiacion_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursales"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitudes_financiacion" ADD CONSTRAINT "solicitudes_financiacion_venta_id_fkey" FOREIGN KEY ("venta_id") REFERENCES "ventas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitud_financiacion_archivos" ADD CONSTRAINT "solicitud_financiacion_archivos_solicitud_id_fkey" FOREIGN KEY ("solicitud_id") REFERENCES "solicitudes_financiacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "postventa_casos" ADD CONSTRAINT "postventa_casos_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "postventa_casos" ADD CONSTRAINT "postventa_casos_concesionaria_id_fkey" FOREIGN KEY ("concesionaria_id") REFERENCES "concesionarias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "postventa_casos" ADD CONSTRAINT "postventa_casos_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "postventa_casos" ADD CONSTRAINT "postventa_casos_vehiculo_id_fkey" FOREIGN KEY ("vehiculo_id") REFERENCES "vehiculos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "postventa_casos" ADD CONSTRAINT "postventa_casos_venta_id_fkey" FOREIGN KEY ("venta_id") REFERENCES "ventas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "postventa_items" ADD CONSTRAINT "postventa_items_caso_id_fkey" FOREIGN KEY ("caso_id") REFERENCES "postventa_casos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "postventa_items" ADD CONSTRAINT "postventa_items_proveedor_id_fkey" FOREIGN KEY ("proveedor_id") REFERENCES "proveedores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_concesionaria_id_fkey" FOREIGN KEY ("concesionaria_id") REFERENCES "concesionarias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "concesionaria_subscriptions" ADD CONSTRAINT "concesionaria_subscriptions_concesionaria_id_fkey" FOREIGN KEY ("concesionaria_id") REFERENCES "concesionarias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "concesionaria_subscriptions" ADD CONSTRAINT "concesionaria_subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "planes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "concesionaria_subscriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "infoauto_models" ADD CONSTRAINT "infoauto_models_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "infoauto_brands"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "infoauto_versions" ADD CONSTRAINT "infoauto_versions_model_id_fkey" FOREIGN KEY ("model_id") REFERENCES "infoauto_models"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "infoauto_prices" ADD CONSTRAINT "infoauto_prices_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "infoauto_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

