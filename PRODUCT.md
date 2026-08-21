# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

AUTENZA lo usa el personal de una concesionaria de autos, cada rol en su tarea diaria:

- **vendedor** — carga clientes, vehículos, presupuestos y cierra ventas en el mostrador;
- **cobrador** — gestiona la financiación propia, las cuotas y las cobranzas;
- **admin** — configura la concesionaria, sucursales, usuarios y catálogos;
- **postventa** — gestiona casos de postventa y sus ítems;
- **lectura** — consulta sin editar;
- **super_admin** — opera sobre todas las concesionarias (cruza tenants).

Es una herramienta de uso operativo y recurrente (gestión del día a día del negocio), no esporádico.

## Product Purpose

Sistema de gestión integral (ERP operativo) para concesionarias de autos. Administra el ciclo completo del vehículo y del negocio: ingreso / preparación / publicación de unidades, clientes, presupuestos, reservas, ventas, financiación propia con plan de cuotas y cobranzas, postventa, gastos (de vehículo y fijos), proveedores, reportes, auditoría y facturación AFIP. El éxito es que una concesionaria —o una red de varias— opere todo su negocio desde un solo sistema, con los datos aislados por tenant.

## Positioning

Multi-tenancy real como mecanismo central, no como agregado: cada concesionaria queda estrictamente aislada (Row-Level Security en Postgres + extensión de Prisma; el rol `super_admin` es el único que cruza tenants), y una misma cuenta administra varias sucursales desde un panel único. Está pensado para grupos / redes de concesionarias, no para un local aislado.

## Operating Context

- Uso diario en la concesionaria (mostrador, back-office y administración), en español rioplatense.
- Flujo del negocio: ingreso de unidad → preparación → publicación → reserva/presupuesto → venta → (financiación propia + cobranza de cuotas | facturación AFIP) → postventa.
- Onboarding guiado con un tour (driver.js) anclado por atributos `data-tour` en la UI: el diseño no debe romper esas anclas.
- Producción: autenza.nebulant.com.ar (deploy en Raspberry Pi detrás de Cloudflare Tunnel).

## Capabilities and Constraints

- **Roles / permisos**: super_admin, admin, vendedor, cobrador, postventa, lectura.
- **Aislamiento multi-tenant** por `concesionariaId`, forzado por la extensión de Prisma + RLS. El super_admin elige la concesionaria al crear recursos; el resto queda atado a su propio tenant. El diseño nunca debe insinuar ni filtrar datos de otra concesionaria.
- **Cumplimiento fiscal AFIP** (Argentina): la facturación respeta reglas y formatos fiscales. Módulo por cortes (Corte 1 = MOCK / CAE simulado; el real WSAA/WSFEv1 y multi-moneda están pendientes).
- **Stack** (dado por el código): frontend React + Vite + TypeScript (react-router-dom, @tanstack/react-query, zustand, react-hook-form, lucide-react, driver.js), con CSS propio (sin Tailwind); backend Node/Express + Prisma + PostgreSQL.
- **Superficies existentes (25)**: dashboard, auth, clientes, vehículos, ingresos, movimientos, ventas, presupuestos, reservas, financiaciones, solicitudes, gastos, gastos-fijos, proveedores, postventa, seguimientos, tasaciones, reportes, auditoría, billing, concesionarias, sucursales, usuarios, configuración, error.

## Brand Commitments

- Nombre: **AUTENZA**. Identidad visual definida y binding (gradiente emerald→cyan→violet, tipografía Space Grotesk, isotipo); assets en `marca-autenza/`. Usar como fuente de verdad, no reinventar.
- UI y textos **100% en español (rioplatense)**.

## Evidence on Hand

- Assets de marca en `marca-autenza/`.
- Datos demo de siembra en `BackConcesionaria/prisma/seed-demo.ts`.
- Deploy productivo en autenza.nebulant.com.ar.
- No hay testimonios, métricas de clientes ni casos reales documentados: no deben fabricarse.

## Product Principles

- **Tenant primero**: nada cruza concesionarias salvo super_admin; el diseño nunca sugiere ni expone datos de otro tenant.
- **Operar rápido**: es una herramienta de trabajo diario — escaneabilidad, consistencia entre módulos y densidad útil ganan sobre la expresión.
- **Fidelidad al flujo del negocio**: respetar el ciclo ingreso→venta→postventa/financiación y los estados reales de cada entidad (máquinas de estado).
- **Cumplir sin fricción**: el cumplimiento fiscal AFIP es un requisito, no un extra; los formularios fiscales no se "simplifican" rompiendo su validez.
- **Marca AUTENZA consistente**: aplicar la identidad en toda superficie.
