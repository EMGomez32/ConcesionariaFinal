# Etapa 2 — MVP vendible · Guía de despliegue

Features nuevas para convertir el sistema en algo demostrable y vendible.
Todo se construyó sobre la base estable de la Etapa 1.

---

## 1. Qué se agregó

| Feature | Qué hace |
|---------|----------|
| **Reportes** | Nueva sección con 4 reportes: ventas por período, caja mensual (ingresos vs egresos), cartera de mora, y rentabilidad por vehículo. Cada uno con filtros, totales y **export a CSV**. |
| **Moneda dual ARS/USD** | Vehículos, gastos, financiaciones (y ventas/presupuestos que ya la tenían) manejan pesos o dólares. Los reportes muestran los totales **separados por moneda** (no mezclan ARS con USD). |
| **Comprobante de venta en PDF** | Botón de descarga en cada venta: genera un comprobante con cliente, vehículo, detalle de importes y pagos. |
| **Recuperación de contraseña** | Link "¿Olvidaste tu contraseña?" en el login → email con enlace de un solo uso (vence en 1 hora). |
| **Autorización por rol** | Billing solo admin; escrituras de gastos, gastos fijos y categorías protegidas por rol. |
| **CI + verificación** | Workflow de GitHub Actions y `scripts/verify.sh` para compilar todo antes de subir. |
| **Datos demo** | `npm run seed-demo` carga una concesionaria de ejemplo con vehículos, ventas, mora, etc. para presentaciones. |

---

## 2. Cambios que impactan el despliegue

- **Dependencias nuevas** (`pdfkit`, `nodemailer`): se instalan solas en el build de Docker. Por eso este deploy necesita **`--build`**.
- **Schema**: se agregaron columnas `moneda` (a vehículos, gastos, gastos fijos, financiaciones) y una tabla `password_reset_tokens`. El arranque las aplica solo con `prisma db push` (cambios NO destructivos, con defaults).
- **Variables nuevas en el `.env`** (todas opcionales, con defaults):
  - `APP_URL` — URL pública del frontend, para el link de recuperación (default: tu dominio).
  - `SMTP_HOST/PORT/USER/PASS/FROM` — para enviar emails. **Si no las configurás, la recuperación igual funciona**: el link se escribe en los logs (`docker compose logs backend`) en vez de mandarse por email. Configurá SMTP cuando tengas un proveedor.

Actualizá tu `.env` en la Pi con el bloque nuevo de `.env.example` (o dejá los defaults).

---

## 3. Desplegar

1. Subí por WinSCP las carpetas `BackConcesionaria` y `FrontConcesionaria` completas (sin `node_modules` ni `dist`). Tip: corré `sh scripts/verify.sh` **antes** de subir para confirmar que todo compila.
2. En la Pi:
   ```bash
   cd ~/docker/Concesionaria
   docker compose up -d --build
   ```
3. (Opcional) Cargar datos demo en una instancia de demostración:
   ```bash
   docker compose exec backend npm run seed-demo
   # Login demo: admin@demo.com / demo1234
   ```

---

## 4. Cómo probar cada feature

- **Reportes**: menú → *Finanzas & Postventa → Reportes*. Probá los 4 tabs y el botón *Exportar CSV*.
- **Moneda**: al cargar un vehículo o una financiación, elegí ARS o USD. En reportes vas a ver los totales separados por moneda.
- **Comprobante PDF**: en *Ventas*, pasá el mouse sobre una fila → ícono de impresora → descarga el PDF.
- **Recuperación**: en el login, "¿Olvidaste tu contraseña?" → ingresá un email → mirá el link en `docker compose logs backend` (o en el email si configuraste SMTP) → abrilo y elegí nueva contraseña.

---

## 5. Puntos diferidos (menores)

- Selector de moneda en el formulario de **gastos fijos** (hoy toma ARS por default; el dato se guarda y los reportes lo respetan).
- **Conversión automática USD↔ARS** con cotización del día: hoy cada importe lleva su moneda y los totales se muestran separados; la conversión a una sola moneda con cotización es una mejora futura.
- Ocultar *Billing* del menú para no-admin (hoy el backend ya lo bloquea con 403; es solo cosmético).
