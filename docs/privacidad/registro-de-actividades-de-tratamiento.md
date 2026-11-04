# Registro de actividades de tratamiento (RoPA)

Versión 1.0 · Responsable: Punto de contacto de privacidad · Revisión: anual y con cada cambio que trate datos nuevos.

> Borrador para revisión legal: las bases legales son las **sugeridas**. En las
> actividades como encargado, la base legal la determina y documenta cada
> concesionaria como responsable.

**Organización:** `<razón social de AUTENZA>`, `<CUIT>`, `<domicilio>`.
**Punto de contacto de privacidad:** `<email-de-privacidad>`.

## Referencias

**Base legal (Ley 25.326, art. 5)**

- **C:** consentimiento libre, expreso e informado (art. 5, inc. 1).
- **RC:** necesario para una relación contractual con el titular (art. 5, inc. 2 d), incluidos los pasos previos que el titular pide (cotizar, probar un auto). *A validar.*
- **OL:** obligación legal (art. 5, inc. 2 b).

**Medidas de seguridad comunes**

- **M1** Aislamiento por concesionaria: extensión de Prisma + RLS de Postgres + rol de runtime `app_rw` sin privilegios.
- **M2** Control de acceso por rol con test centinela; 2FA obligatorio para `admin` y `super_admin`; bloqueo por intentos fallidos.
- **M3** TLS en tránsito; backups cifrados con `age`; el offsite recibe solo archivos cifrados.
- **M4** `audit_log` y `security_events` append-only.
- **M5** Adjuntos de legajos en zona privada, servidos solo con URL firmada con vencimiento y sin caché.
- **M6** Secretos de integraciones cifrados con AES-256-GCM.
- **M7** Recorte de cartera: el vendedor ve solo su cartera.
- **M8** Purga y anonimización por plazos (`npm run retencion`) según la [política de retención](politica-de-retencion.md).
- **M9** Logs con redacción de credenciales y emails enmascarados.

Detalle de los controles: [arquitectura](../operacion/arquitectura.md) y [SGSI](../seguridad/README.md).

**Destinatario común a todas las actividades:** Cloudflare (borde y túnel: ve
el tráfico en tránsito; EE.UU.) y el almacenamiento offsite de backups
(cifrados; jurisdicción del bucket). Ver [subencargados](../seguridad/proveedores-y-subencargados.md).

## A. AUTENZA como encargado (por cuenta de cada concesionaria)

| # | Actividad y finalidad | Titulares | Categorías de datos | Base sugerida | Destinatarios y subencargados (además de los comunes) | Transferencias | Conservación | Medidas |
|---|---|---|---|---|---|---|---|---|
| E1 | **Clientes y prospectos (CRM):** registrar, seguir y contactar | Clientes y prospectos | Nombre, apellido, tipo y número de documento, condición IVA, teléfono, email, domicilio, estado y origen del contacto, notas, consentimiento de contacto | RC; contacto comercial posterior: C | Personal de la concesionaria según rol | Ver comunes | R-01, R-04 | M1, M2, M4, M7, M8 |
| E2 | **Atención en el salón:** relevar qué busca el cliente y su capacidad de compra | Clientes y prospectos | Presupuesto, anticipo, cuota máxima, tipo de financiación, unidades vistas, observaciones | RC | Vendedor y administración | Ver comunes | R-02 | M1, M2, M7, M8 |
| E3 | **Presupuestos, reservas y ventas** | Clientes | Datos de E1, unidad, precios, forma de pago, señas, pagos y sus referencias, comprobantes | RC; comprobantes: OL | Personal según rol | Ver comunes | R-03 (no convertidos), R-05 | M1, M2, M4 |
| E4 | **Financiación propia y cobranza** | Clientes deudores | Monto financiado, tasa, cuotas, saldos, mora, pagos | RC | Cobrador y administración | Ver comunes | R-05 | M1, M2, M4 |
| E5 | **Legajo de crédito con terceros:** armar la solicitud ante una financiera | Clientes solicitantes | Imagen del DNI, recibos de sueldo (empleador, ingresos; **posibles datos sensibles incidentales**: descuentos sindicales o de obra social), montos y tasas | RC (a pedido del titular) | La financiera que elige el cliente (la cesión la hace la concesionaria) | Ver comunes | R-06 | M1, M2, M5, M8; ver [evaluación de impacto](evaluacion-de-impacto.md) |
| E6 | **Tasaciones y permutas** | Titulares de usados | Dominio, kilometraje, valor estimado o tomado | RC | Tasador, vendedor, administración | Ver comunes | R-03, R-05 si integra una venta | M1, M2 |
| E7 | **Postventa:** reclamos, turnos y service | Clientes | Descripción del reclamo, turnos, unidad | RC | Postventa, administración | Ver comunes | R-07 | M1, M2 |
| E8 | **Stock de unidades** | Titulares anteriores de las unidades | Dominio, número de chasis, quién entregó la unidad y valor tomado, documentos de la unidad con datos del titular anterior | RC; OL | Personal según rol | Ver comunes | R-08 | M1, M2 |
| E9 | **Bandeja de conversaciones** (WhatsApp, Messenger, Instagram) | Contactos que escriben a la concesionaria | Teléfono, identificadores de la plataforma, nombre del contacto, contenido de los mensajes (puede incluir ubicación, contactos compartidos o datos sensibles incidentales) | RC (el contacto inicia la conversación) | Meta / WhatsApp como canal; vendedores y administración | EE.UU. | R-09 | M1, M2, M6, M7, M8; ver [evaluación de impacto](evaluacion-de-impacto.md) |
| E10 | **Ingesta de consultas** (formularios de Meta, emails de portales, preguntas de Mercado Libre) | Interesados | Nombre, teléfono, email, texto de la consulta, apodo e id de Mercado Libre | RC (a pedido del titular); formularios de Meta: según el aviso de la concesionaria | Meta, Mercado Libre, proveedor de email de la concesionaria | EE.UU. (Meta) | R-01 | M1, M2, M6, M8; ver [evaluación de impacto](evaluacion-de-impacto.md) |
| E11 | **Facturación electrónica** (hoy en modo simulado) | Clientes | Nombre, documento y condición IVA del receptor, importes | OL | ARCA/AFIP (cuando sea real) | — | R-05 | M1, M2, M4 |
| E12 | **Proveedores y financieras** | Contactos de empresas | Nombre del contacto, teléfono, email, domicilio | RC | Administración | Ver comunes | R-10 | M1, M2 |
| E13 | **Gestión comercial del personal:** comisiones, objetivos, cartera | Empleados de la concesionaria | Porcentaje de comisión, objetivos, resultados por vendedor | RC (laboral, de la concesionaria) | Administración | Ver comunes | R-11 | M1, M2 |
| E14 | **Reportes y exportaciones** (CSV, PDF) | Los de E1 a E13 | Los del origen | La del origen | Quien descarga (bajo responsabilidad de la concesionaria) | — | Temporales del servidor: R-19 | M1, M2, M7 |

## B. AUTENZA como responsable

| # | Actividad y finalidad | Titulares | Categorías de datos | Base sugerida | Destinatarios (además de los comunes) | Transferencias | Conservación | Medidas |
|---|---|---|---|---|---|---|---|---|
| R1 | **Cuentas de usuario y autenticación** | Usuarios (empleados de concesionarias, personal de AUTENZA) | Nombre, email, hash de contraseña, secreto 2FA cifrado, códigos de recuperación (hash), roles, sucursal, sesiones | RC (prestación del servicio contratado por la concesionaria) | Proveedor de SMTP (emails de recuperación) | UE (SMTP), EE.UU. | R-12 | M2, M4, M6, M9 |
| R2 | **Seguridad y auditoría** | Usuarios y, de forma indirecta, clientes nombrados en el rastro | IP, user-agent, acciones, fecha y hora, hash del email en intentos fallidos | OL (deber de seguridad, art. 9) y RC | — | Ver comunes | R-13, R-14 | M4, M9 |
| R3 | **Cuenta comercial de cada concesionaria** (alta, suscripción, facturación del servicio) | Dueños o representantes de las concesionarias (persona humana si es monotributista) | Razón social, CUIT, domicilio, email, teléfono, sucursales, datos de facturación | RC; facturación: OL | — | Ver comunes | R-05, R-10 | M1, M2 |
| R4 | **Visitantes del sitio público** (`/login`, `/capacitacion`) | Visitantes | IP, user-agent, página visitada | Necesario para prestar el sitio y protegerlo (*a validar*) | Proveedor de tipografías web (recibe IP y user-agent) | EE.UU. | R-14 | M9 |
| R5 | **Soporte a concesionarias** | Responsables y usuarios de las concesionarias | Nombre, email, teléfono, contenido del pedido | RC | — | Según el canal | R-10 | M2 |
| R6 | **Reportes de vulnerabilidades** | Investigadores | Usuario de GitHub, contenido del reporte | C (lo envía el investigador) | GitHub | EE.UU. | R-18 | — |
| R7 | **Respaldo** (cubre también los datos de la sección A) | Todos | Copia completa de la base, archivos y sesiones | La de cada actividad | Almacenamiento offsite (cifrado) | Jurisdicción del bucket | R-15 | M3 |

## Datos sensibles (art. 2 y 7 de la Ley 25.326)

El sistema no tiene campos para datos sensibles. Pueden entrar **de forma
incidental** en recibos de sueldo, en campos de texto libre y en mensajes. Se
mitiga con: aviso al personal ("no registres datos de salud, religión, política
ni afiliación"), sugerencia al titular de tapar descuentos sindicales o de obra
social en los recibos, plazo corto de conservación de los legajos (R-06) y
acceso restringido. Ver la [evaluación de impacto](evaluacion-de-impacto.md).

## Responsable

Punto de contacto de privacidad.

## Evidencia que se guarda

Versiones de este registro (historial de git) y su aprobación en el acta de
revisión por la dirección.

## Frecuencia de revisión

Anual, y en el mismo PR de todo cambio que trate datos personales nuevos.

## Controles que cubre

ISO 27701 A.7.2.1, A.7.2.2, A.7.2.8, A.7.5.1–A.7.5.4, B.8.2.6, B.8.5.6 ·
ISO 27001:2022 A.5.9, A.5.34 · SOC 2 P3.1, P6.1, C1.1 · Ley 25.326 arts. 4, 5, 7, 12, 21.
