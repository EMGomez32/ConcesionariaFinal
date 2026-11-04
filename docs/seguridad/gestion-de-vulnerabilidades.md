# Gestión de vulnerabilidades

Versión 1.0 · Responsable: Responsable de seguridad · Revisión: anual.

## Objetivo

Enterarse de las vulnerabilidades que afectan a AUTENZA, decidir rápido y
corregirlas dentro de un plazo según su gravedad.

## Alcance

Código propio, dependencias npm de los tres paquetes, imágenes de contenedores,
sistema operativo del host, configuración de las cuentas SaaS.

## Fuentes

| Fuente | Qué detecta | Dónde se ve |
|---|---|---|
| Dependabot (`.github/dependabot.yml`) | Dependencias npm, Actions e imágenes con avisos publicados; PR de actualización | Pestaña Security y PR de GitHub |
| CodeQL (`.github/workflows/codeql.yml`) | Patrones inseguros en el código | Pestaña Security (code scanning) |
| `npm audit` en el CI | Dependencias de producción con vulnerabilidades altas o críticas | Job del CI |
| Escaneo de secretos (CI y push protection de GitHub) | Credenciales commiteadas | CI y GitHub |
| Actualizaciones automáticas del host | Parches de seguridad del sistema operativo | Logs del host; `scripts/hardening/verify-host.sh` |
| Reportes externos | Lo que encuentre un investigador o un cliente | Reporte privado de vulnerabilidades ([SECURITY.md](../../SECURITY.md)) |
| Pentest o revisión externa | Fallas de lógica y de configuración | Informe (archivo privado) |
| Auditorías internas, incluidas las asistidas por IA | Hallazgos de diseño y proceso | Informe (archivo privado) |
| Avisos de proyectos críticos | Node.js, Express, Prisma, PostgreSQL, nginx, Debian, librerías de integraciones (WhatsApp, IMAP, PDF, uploads) | Suscripción a sus avisos de seguridad |

> Pendiente de decisión del dueño: pentest externo antes del primer cliente pago y su frecuencia posterior.

## Severidad y plazos

La severidad parte del CVSS publicado y se ajusta por la exposición real en
AUTENZA (¿la ruta vulnerable es alcanzable?, ¿desde internet?, ¿con sesión?).
El ajuste se escribe en el registro.

| Severidad | Ejemplos | Plazo para corregir o mitigar |
|---|---|---|
| **Crítica** | Ejecución remota, salto del aislamiento entre tenants, acceso sin autenticación a datos personales, secreto de producción expuesto | Mitigación en **72 h**, corrección en **7 días** |
| **Alta** | Escalada de privilegios dentro de un tenant, exposición de datos a un rol que no debe verlos, dependencia de runtime con exploit conocido | **30 días** |
| **Media** | Requiere condiciones poco probables o tiene impacto acotado | **90 días** |
| **Baja** | Endurecimiento, información menor | En la siguiente revisión trimestral |

- El plazo corre desde que se conoce la vulnerabilidad.
- Si no hay parche publicado, se mitiga (desactivar la función, filtrar la
  entrada, reemplazar la dependencia) y se registra el riesgo.
- Una vulnerabilidad que no se corrige en plazo necesita una **aceptación de
  riesgo** escrita, con motivo, mitigación y vencimiento de 90 días como máximo
  ([gestión de riesgos](gestion-de-riesgos.md)).
- Una crítica explotada o con indicios de explotación es además un **incidente**
  ([gestión de incidentes](gestion-de-incidentes.md)).

## Procedimiento

1. **Registrar** el hallazgo: fuente, componente, severidad ajustada, fecha.
   Los detalles de una vulnerabilidad abierta **no** se publican en el repo, en
   issues públicos ni en PR con descripción explícita hasta que esté corregida.
2. **Decidir:** corregir, mitigar o aceptar.
3. **Corregir** por el camino normal de [gestión de cambios](gestion-de-cambios.md)
   (o el de emergencia si es crítica), con un test que falle sin el arreglo
   cuando sea posible.
4. **Verificar** en producción y cerrar el registro con la fecha.
5. **Avisar** a quien reportó, si fue externo.

## Rutina

- **Semanal:** revisar la pestaña Security de GitHub y los PR de Dependabot.
- **Mensual (15 min):** vulnerabilidades abiertas contra sus plazos; anotar el
  estado en el registro de riesgos.
- **Trimestral:** actualizar las imágenes base (Node, Postgres, nginx) y
  revisar las bajas.

## Responsable

Responsable de seguridad.

## Evidencia que se guarda

Registro de vulnerabilidades con fechas de detección y cierre; aceptaciones de
riesgo; informes de pentest; PR de corrección.

## Frecuencia de revisión

Anual.

## Controles que cubre

ISO 27001:2022 A.5.7, A.8.8, A.8.19, A.5.6 · SOC 2 CC7.1, CC3.2, CC3.4, CC4.1.
