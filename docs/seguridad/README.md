# SGSI de AUTENZA

Sistema de Gestión de Seguridad de la Información "mínimo viable" para una
organización de una persona. Sigue ISO/IEC 27001:2022 (cláusulas 4 a 10 y
Anexo A) y los criterios comunes de SOC 2 (CC1 a CC9, A1, C1). La parte de
privacidad (ISO/IEC 27701 y Ley 25.326) está en [docs/privacidad/](../privacidad/README.md)
y la operación diaria en [docs/operacion/](../operacion/).

Este repositorio es **público**. Acá van las reglas y los procedimientos. El
estado real de los controles, los riesgos y la evidencia van en el **archivo
privado de evidencias** (`<archivo-de-evidencias>`: almacenamiento cifrado con
acceso solo del dueño, una carpeta por año y por control).

## Documentos

| Documento | Cubre | ISO 27001:2022 |
|---|---|---|
| [Alcance y contexto](alcance-y-contexto.md) | Partes interesadas, requisitos, alcance, exclusiones | 4.1–4.4 |
| [Política de seguridad](politica-de-seguridad.md) | Compromiso, principios, objetivos medibles | 5.1, 5.2, 6.2, A.5.1 |
| [Roles y responsabilidades](roles-y-responsabilidades.md) | Roles, segregación de funciones, rol de la IA | 5.3, A.5.2–A.5.4 |
| [Gestión de riesgos](gestion-de-riesgos.md) | Metodología, criterios de aceptación, plantillas de registro y de SoA | 6.1.2, 6.1.3, 8.2, 8.3 |
| [Control de acceso](control-de-acceso.md) | Cuentas, 2FA, roles de la app, revisión trimestral | A.5.15–A.5.18, A.8.2–A.8.5 |
| [Gestión de cambios](gestion-de-cambios.md) | PR obligatorio, checks, emergencias, deploy, tags | 6.3, A.8.32 |
| [Desarrollo seguro](desarrollo-seguro.md) | Definición de listo, checklist, modelo de amenazas | A.5.8, A.8.25–A.8.29 |
| [Gestión de vulnerabilidades](gestion-de-vulnerabilidades.md) | Fuentes y plazos por severidad | A.5.7, A.8.8 |
| [Criptografía y secretos](criptografia-y-secretos.md) | Dónde viven, rotación, filtraciones | A.8.24, A.5.17 |
| [Registros y monitoreo](registros-y-monitoreo.md) | Qué se registra, retención, alertas | A.8.15–A.8.17 |
| [Respaldo y continuidad](respaldo-y-continuidad.md) | RPO/RTO, escenarios, simulacros | A.5.29, A.5.30, A.8.13, A.8.14 |
| [Gestión de incidentes](gestion-de-incidentes.md) | Clasificación, pasos, brechas de datos personales | A.5.24–A.5.28, A.6.8 |
| [Proveedores y subencargados](proveedores-y-subencargados.md) | Registro de proveedores | A.5.19–A.5.23 |
| [Clasificación de la información](clasificacion-de-la-informacion.md) | Niveles y tratamiento | A.5.9, A.5.12–A.5.14 |
| [Uso aceptable e IA](uso-aceptable-y-ia.md) | Uso de equipos y de asistentes de IA | A.5.10, A.8.1 |
| [Personas](personas.md) | NDA, alta y baja, concientización, trabajo remoto | A.6.1–A.6.7 |
| [Seguridad física y del host](seguridad-fisica-y-del-host.md) | Equipos, medios, endurecimiento | A.7, A.8.9, A.8.20 |
| [Auditoría interna y revisión por la dirección](auditoria-interna-y-revision-por-la-direccion.md) | Programa, actas, no conformidades | 9.1–9.3, 10 |

Documentos relacionados fuera de esta carpeta: [SECURITY.md](../../SECURITY.md)
(reporte de vulnerabilidades), [runbooks](../operacion/), [scripts/BACKUPS.md](../../scripts/BACKUPS.md).

## Cómo se mantiene

1. **Todo cambio a un documento entra por PR**, como el código. El historial de
   git es el control de versiones (ISO 7.5.3).
2. **Aprobación:** cada documento rige desde que la Dirección lo aprueba en una
   revisión por la dirección y queda anotado en el acta, con fecha y versión
   (commit). Mientras tanto, es un borrador vigente de hecho.
   > Pendiente de decisión del dueño: primera aprobación formal del conjunto.
3. **Cada documento** dice su objetivo, alcance, reglas verificables, responsable,
   evidencia, frecuencia de revisión y los controles que cubre.
4. **Lo que nunca va al repo:** la Declaración de Aplicabilidad con su estado
   real, el registro de riesgos, los registros de incidentes, las revisiones de
   accesos, las actas firmadas, los informes de auditoría y cualquier evidencia
   con datos de infraestructura o de personas. En el repo solo están las plantillas.
5. **Si una regla no se cumple**, no se borra la regla: se registra una no
   conformidad o un riesgo aceptado con fecha ([auditoría interna](auditoria-interna-y-revision-por-la-direccion.md)).

## Calendario

| Frecuencia | Actividad | Documento | Evidencia |
|---|---|---|---|
| Cada deploy | Registro del deploy y smoke | [Gestión de cambios](gestion-de-cambios.md) | Log de deploys |
| Semanal | Mirar alertas de seguridad, Dependabot y CodeQL | [Vulnerabilidades](gestion-de-vulnerabilidades.md) | Issues o notas |
| Mensual | Simulacro de restore (`scripts/restore-drill.sh`) | [Respaldo](respaldo-y-continuidad.md) | Línea de `restore-drill.log` |
| Mensual | Revisión de vulnerabilidades abiertas y de `security_events` (15 min) | [Vulnerabilidades](gestion-de-vulnerabilidades.md), [Registros](registros-y-monitoreo.md) | Nota en el registro de riesgos |
| Trimestral | Revisión de accesos | [Control de acceso](control-de-acceso.md) | Checklist firmada |
| Trimestral | Simulacro de continuidad (un escenario) | [Respaldo](respaldo-y-continuidad.md) | Informe del simulacro |
| Trimestral | Revisión del registro de riesgos | [Riesgos](gestion-de-riesgos.md) | Registro actualizado |
| Trimestral | Limpieza de la memoria y notas de los asistentes de IA | [Uso aceptable e IA](uso-aceptable-y-ia.md) | Nota |
| Semestral | Revisión por la dirección | [Auditoría y revisión](auditoria-interna-y-revision-por-la-direccion.md) | Acta |
| Anual | Auditoría interna, revisión de todas las políticas, de proveedores y de la evaluación de impacto, concientización | Todos | Informe, actas, registro |

## Referencias de marcos

- ISO/IEC 27001:2022: cláusulas y controles del Anexo A con su numeración.
- SOC 2: Trust Services Criteria 2017 (revisados en 2022).
- ISO/IEC 27701: se cita la numeración de la edición 2019 con el nombre del
  control, para poder mapearla a la edición 2025 por nombre.
- Una referencia a un control indica qué control **busca cubrir** el documento.
  No implica que el control esté implementado ni certificado. AUTENZA no tiene
  hoy ninguna certificación ni informe SOC 2.
