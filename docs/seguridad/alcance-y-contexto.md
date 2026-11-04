# Alcance y contexto del SGSI

Versión 1.0 · Responsable: Dirección · Revisión: anual o ante un cambio grande
(nuevo host, nuevo socio, venta o licencia del software, nueva integración).

## Objetivo

Dejar escrito para qué existe el SGSI, a quién le importa la seguridad de
AUTENZA, qué exige cada uno y qué partes del negocio y de la tecnología cubre.

## 1. Contexto (ISO 4.1)

**Cuestiones internas**

- Organización de **una persona**: la misma persona desarrolla, revisa, opera,
  administra la base y atiende a los clientes. La segregación de funciones se
  compensa con controles técnicos ([roles](roles-y-responsabilidades.md)).
- El desarrollo se apoya en **asistentes de IA**. Aceleran, pero también son un
  canal posible de exposición de datos y de errores
  ([uso aceptable e IA](uso-aceptable-y-ia.md)).
- Infraestructura de producción de **pequeña escala**: un único host propio,
  expuesto solo por un túnel de Cloudflare. Sin redundancia geográfica.
- Producto con mucha funcionalidad y datos sensibles: DNI, recibos de sueldo,
  deudas, conversaciones con clientes.

**Cuestiones externas**

- Mercado: concesionarias argentinas, muchas sin área de sistemas, que delegan
  en AUTENZA la custodia de los datos de sus clientes.
- Marco legal argentino: Ley 25.326 de Protección de Datos Personales (autoridad:
  AAIP), régimen de factura electrónica (ARCA/AFIP), Defensa del Consumidor,
  Código Civil y Comercial (conservación de registros) y, a evaluar, prevención
  de lavado de activos en la compraventa de automotores.
- Dependencia de plataformas de terceros con términos propios: Meta, WhatsApp,
  Mercado Libre, Cloudflare, GitHub.
- Amenazas típicas: robo de credenciales, abuso interno en la concesionaria
  (extracción de cartera), ransomware, dependencias vulnerables, fallas de
  hardware o de conectividad del host.

## 2. Partes interesadas y sus requisitos (ISO 4.2)

| Parte interesada | Qué espera | Cómo se atiende |
|---|---|---|
| Concesionarias clientes | Confidencialidad y aislamiento de sus datos, disponibilidad en horario comercial, contrato de tratamiento, aviso de incidentes | Multi-tenant con RLS, [continuidad](respaldo-y-continuidad.md), [contrato de encargado](../privacidad/contrato-de-encargado-plantilla.md), [incidentes](gestion-de-incidentes.md) |
| Clientes de las concesionarias (titulares de datos) | Uso limitado a la finalidad, seguridad, ejercer sus derechos | [PIMS](../privacidad/README.md), [derechos](../privacidad/derechos-de-los-titulares.md) |
| Usuarios de la plataforma (empleados de las concesionarias) | Cuentas seguras, privacidad de sus datos de acceso | [Control de acceso](control-de-acceso.md), [aviso de privacidad](../privacidad/aviso-de-privacidad-borrador.md) |
| AAIP | Cumplimiento de la Ley 25.326 | [PIMS](../privacidad/README.md) |
| ARCA/AFIP | Validez de los comprobantes fiscales y su conservación | [Retención](../privacidad/politica-de-retencion.md) |
| Plataformas integradas (Meta, Mercado Libre) | Cumplir sus términos y proteger sus tokens | [Criptografía y secretos](criptografia-y-secretos.md), [proveedores](proveedores-y-subencargados.md) |
| Proveedores | Uso correcto de sus servicios | [Proveedores](proveedores-y-subencargados.md) |
| Investigadores de seguridad | Un canal de reporte y respuesta | [SECURITY.md](../../SECURITY.md) |
| Licenciatarios, compradores o inversores potenciales | Evidencia de controles, titularidad del código, continuidad del conocimiento | Este SGSI, [LICENSE](../../LICENSE), [runbooks](../operacion/) |
| Dirección (dueño) | Proteger el activo y la reputación, poder vender y escalar | [Política](politica-de-seguridad.md), [revisión por la dirección](auditoria-interna-y-revision-por-la-direccion.md) |

Los requisitos legales y contractuales se revisan en cada revisión por la
dirección. Las interpretaciones legales se validan con un abogado.
> Pendiente de decisión del dueño: contratar la validación legal de la Ley 25.326, Defensa del Consumidor (financiación propia) y prevención de lavado.

## 3. Alcance (ISO 4.3)

El SGSI cubre **el desarrollo, la operación y el soporte de la plataforma SaaS
AUTENZA**, que incluye:

1. **Software:** `BackConcesionaria/` (API y workers), `FrontConcesionaria/`
   (web y nginx), `AppConcesionaria/` (app móvil), `scripts/` y la configuración
   de despliegue (`docker-compose.yml`, Dockerfiles).
2. **Infraestructura de producción:** el host, su sistema operativo, los
   contenedores, la base de datos, los volúmenes (`pgdata`, `uploads`,
   `wa-auth`, `backups`), el backup offsite, el túnel de Cloudflare y la red de
   administración.
3. **CI/CD:** el repositorio en GitHub, GitHub Actions y las configuraciones de
   seguridad del repositorio.
4. **Cuentas SaaS** que administran o alojan algo de lo anterior: GitHub,
   Cloudflare, la red de administración, el proveedor de SMTP, Expo, el
   registrador del dominio, el gestor de contraseñas, los asistentes de IA y el
   servicio de alertas.
5. **Equipos del personal** que acceden a lo anterior.
6. **Procesos:** desarrollo, gestión de cambios, operación, respaldo, soporte,
   alta y baja de concesionarias, incidentes y privacidad.

**Ubicación:** trabajo remoto y un host de producción en una ubicación
controlada por el dueño (no se publica).

## 4. Exclusiones justificadas

| Fuera del alcance | Por qué | Quién lo cubre |
|---|---|---|
| Equipos, redes y oficinas de las concesionarias | No están bajo control de AUTENZA | La concesionaria (contrato) |
| Cuentas propias de las concesionarias en Meta, Mercado Libre, WhatsApp o su proveedor de email | Las administra la concesionaria; AUTENZA solo guarda los tokens que ella autoriza | La concesionaria. Los tokens guardados sí están en alcance. |
| Controles internos de los proveedores de nube | Se gestionan como proveedores, no como sistemas propios | [Proveedores](proveedores-y-subencargados.md) |
| Facturación electrónica real ante ARCA/AFIP | Hoy no existe; solo hay modo simulado | Entra al alcance cuando se implemente |
| Otros proyectos personales del dueño | No comparten datos con AUTENZA | No deben compartir infraestructura con producción ([host](seguridad-fisica-y-del-host.md)) |

## 5. El SGSI como sistema (ISO 4.4)

- **Documentación:** esta carpeta y [docs/privacidad/](../privacidad/README.md), versionadas en git.
- **Operación:** [runbooks](../operacion/) y scripts del repo.
- **Medición:** objetivos de la [política](politica-de-seguridad.md) y [registros](registros-y-monitoreo.md).
- **Mejora:** [auditoría interna, revisión por la dirección y acciones correctivas](auditoria-interna-y-revision-por-la-direccion.md).
- **Rol en privacidad (ISO 27701 5.2.1):** AUTENZA es **encargado** de los datos
  de los clientes de cada concesionaria y **responsable** de los datos de las
  cuentas de usuario, de la telemetría de seguridad y de los visitantes del sitio.

## Evidencia que se guarda

Esta página aprobada en el acta de revisión por la dirección. La lista de
cuentas SaaS en alcance va en el inventario del archivo privado.

## Controles que cubre

ISO 27001:2022 4.1, 4.2, 4.3, 4.4, A.5.31 · ISO 27701 5.2.1–5.2.4 · SOC 2 CC2.3, CC3.1.
