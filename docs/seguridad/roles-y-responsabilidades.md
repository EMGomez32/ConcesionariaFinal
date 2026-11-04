# Roles y responsabilidades

Versión 1.0 · Responsable: Dirección · Revisión: anual o al sumar una persona.

## Objetivo

Asignar cada responsabilidad de seguridad y privacidad a un rol, aunque hoy
todos los ejerza la misma persona, y compensar la falta de segregación de funciones.

## Alcance

Todos los roles de la organización AUTENZA. No confundir con los roles de
usuario de la aplicación (admin, vendedor, etc.), que están en
[control de acceso](control-de-acceso.md).

## Roles

| Rol | Responsabilidades | Lo ejerce hoy |
|---|---|---|
| **Dirección** | Aprueba políticas, riesgos aceptados y presupuesto. Hace la revisión por la dirección. | El dueño |
| **Responsable de seguridad** | Mantiene el SGSI, mide los objetivos, coordina auditorías, revisa accesos. | El dueño |
| **Punto de contacto de privacidad** (ISO 27701 6.3.1.1) | Atiende a concesionarias y titulares en temas de datos personales, mantiene el registro de tratamientos, coordina brechas. | El dueño |
| **Desarrollador** | Escribe código, tests y documentación según [desarrollo seguro](desarrollo-seguro.md). | El dueño, con asistentes de IA |
| **Revisor** | Revisa cada PR contra la checklist antes del merge. | El dueño (ver compensaciones) |
| **Operador de producción** | Deploya, restaura, rota secretos, ejecuta runbooks. | El dueño |
| **Administrador de base de datos** | Migraciones, scripts de datos, restauraciones. | El dueño |
| **Administrador de plataforma** (`super_admin`) | Alta y mantenimiento de concesionarias; soporte. | El dueño |
| **Custodio de secretos** | Gestor de contraseñas, `.env`, clave de backups, códigos de recuperación. | El dueño |
| **Gestor de incidentes** | Coordina la respuesta y la comunicación. | El dueño |
| **Responsable de proveedores** | Mantiene el registro de proveedores y sus revisiones. | El dueño |

Cuando se sume una persona, el primer rol a separar es **Revisor**; el segundo,
**Operador de producción**.
> Pendiente de decisión del dueño: contratar una revisión humana externa periódica (por ejemplo trimestral, sobre una muestra de PR de riesgo alto) y un pentest antes del primer cliente pago.

## Segregación de funciones: controles compensatorios

Una sola persona escribe, aprueba y deploya. Estos controles reducen el riesgo
de error o de abuso sin un segundo humano:

| Riesgo | Control compensatorio | Dónde |
|---|---|---|
| Un cambio roto o malicioso llega a producción | PR obligatorio y checks del CI requeridos, también para administradores | [Gestión de cambios](gestion-de-cambios.md) |
| Revisión superficial | Plantilla de PR con checklist; en rutas sensibles (`.github/CODEOWNERS`), segunda lectura diferida del diff | [Gestión de cambios](gestion-de-cambios.md) |
| Deploy sin rastro | Deploy solo con `scripts/deploy.sh`, con log de deploys y tag | [Runbook de deploy](../operacion/runbook-deploy.md) |
| Cambios de datos en producción sin control | Solo por script o SQL versionado y revisado en PR, con backup previo | [Runbook de deploy](../operacion/runbook-deploy.md) |
| Borrar el rastro de una acción | `audit_log` y `security_events` son append-only para el rol de la app (`BackConcesionaria/prisma/setup-app-role.ts`) | [Registros](registros-y-monitoreo.md) |
| Uso indebido del acceso de plataforma | Escrituras de `super_admin` registradas en `security_events`; 2FA obligatorio; acceso a datos de una concesionaria solo por pedido de soporte | [Control de acceso](control-de-acceso.md) |
| Accesos que se acumulan | Revisión trimestral con checklist y evidencia | [Control de acceso](control-de-acceso.md) |
| Fraude en procesos de plata dentro de la concesionaria | Permisos por rol con test centinela (`tests/integration/permisos-mutaciones.test.ts`): anular y cancelar es del administrador | [Control de acceso](control-de-acceso.md) |
| Autoevaluación complaciente | Auditoría interna con plan escrito; las revisiones hechas con IA cuentan como detección, no como auditoría independiente | [Auditoría interna](auditoria-interna-y-revision-por-la-direccion.md) |

## El asistente de IA

Los asistentes de IA son **herramientas** del Desarrollador y del Operador. No
ejercen ningún rol de la tabla.

- **No aprueban.** Una revisión hecha por IA (incluida la "revisión adversarial")
  es un control de **detección**. La aprobación de un PR es siempre humana.
- **No mergean ni deployan por su cuenta.** Pueden preparar comandos; el humano
  los lee y los ejecuta o los autoriza uno por uno.
- **Acceso a producción solo supervisado,** preferentemente de solo lectura, y con
  credenciales propias que se puedan revocar sin tocar las del humano.
- **Coautoría visible:** los commits asistidos llevan la línea `Co-Authored-By`
  del modelo.

Detalle en [uso aceptable e IA](uso-aceptable-y-ia.md).

## Contacto con autoridades y grupos (A.5.5, A.5.6)

- **AAIP** (datos personales): por el punto de contacto de privacidad, cuando
  corresponda ([incidentes](gestion-de-incidentes.md)).
- **Fuerzas de seguridad o fiscalía** (delito informático): por la Dirección,
  con asesoramiento legal.
- **Avisos de seguridad:** se siguen los de GitHub (Dependabot), Node.js,
  Prisma, Express, Debian y las librerías de integraciones
  ([vulnerabilidades](gestion-de-vulnerabilidades.md)).

## Evidencia que se guarda

Esta asignación aprobada en el acta; cambios de asignación con fecha; las
revisiones externas que se contraten.

## Frecuencia de revisión

Anual y cada vez que entra o sale una persona.

## Controles que cubre

ISO 27001:2022 5.3, A.5.2, A.5.3, A.5.4, A.5.5, A.5.6 · ISO 27701 6.3.1.1 · SOC 2 CC1.3, CC1.4, CC5.1.
