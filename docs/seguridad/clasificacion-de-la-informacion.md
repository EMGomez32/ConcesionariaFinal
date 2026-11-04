# Clasificación de la información

Versión 1.0 · Responsable: Responsable de seguridad · Revisión: anual.

## Objetivo

Que cada dato se trate según el daño que causaría su divulgación, alteración
o pérdida.

## Alcance

Toda información que AUTENZA crea, recibe, guarda o transmite, en cualquier
formato y lugar.

## Niveles

| Nivel | Qué es | Ejemplos |
|---|---|---|
| **Pública** | Pensada para cualquiera | Sitio público y `/capacitacion`, `SECURITY.md`, políticas de este repo |
| **Interna** | Para el trabajo de AUTENZA; su divulgación no daña a terceros | Código fuente, runbooks con marcadores, backlog técnico, decisiones de diseño |
| **Confidencial** | Daña a una concesionaria, a un titular o a AUTENZA si se divulga | Datos personales de clientes (nombre, contacto, operaciones), datos comerciales de cada concesionaria (precios mínimos, costos, márgenes), datos de usuarios, `audit_log`, registros de riesgos, incidentes y auditorías, topología de infraestructura, contratos |
| **Restringida** | Daño grave o irreversible | Imágenes de DNI, recibos de sueldo, deudas y legajos de crédito, posibles datos sensibles (art. 2 de la Ley 25.326), backups, sesiones de WhatsApp (`wa-auth`), secretos y `.env`, hashes de contraseñas, tokens de integraciones, claves de cifrado, códigos de recuperación |

Ante la duda, el nivel más alto. Un conjunto hereda el nivel más alto de sus
partes (un CSV de clientes con DNI es Restringido).
> Pendiente de decisión del dueño: el repositorio es hoy público; con el código clasificado como Interno, evaluar pasarlo a privado.

## Cómo se trata cada nivel

| | Pública | Interna | Confidencial | Restringida |
|---|---|---|---|---|
| **Dónde se guarda** | Donde sea | Repo, equipos con disco cifrado | Sistemas de AUTENZA y archivo privado | Solo producción, backups cifrados y el gestor de contraseñas |
| **Transmisión** | Libre | Canales autenticados | Cifrada (TLS) y solo a quien la necesita | Cifrada y solo por los canales del sistema (URL firmada, túnel); nunca por email, chat ni adjunto |
| **Asistentes de IA** | Sí | Sí | **No** | **No** |
| **Ambientes de desarrollo o prueba** | Sí | Sí | No: datos sintéticos | No: datos sintéticos |
| **Exportaciones (CSV, PDF)** | — | — | Solo el rol que la necesita | Solo administradores; se rotulan como confidenciales |
| **Impresión y capturas** | Libre | Libre | Evitar; destruir al terminar | No |
| **Borrado** | — | Normal | Según la [política de retención](../privacidad/politica-de-retencion.md) | Borrado seguro; los medios se destruyen o se borran por sobrescritura o cifrado |

## Etiquetado

- Los documentos de este SGSI dicen su nivel cuando no es Público o Interno.
- Los archivos del archivo privado llevan el nivel en el nombre de la carpeta.
- Las exportaciones masivas con datos personales llevan una leyenda de
  confidencialidad (a medida que el sistema la incorpore).

## Inventario de activos

El inventario (activo, nivel, dueño, ubicación, backup, retención, cifrado)
está en el archivo privado de evidencias y se revisa con la revisión
trimestral de accesos. Los activos de información con datos personales se
describen en el [registro de actividades de tratamiento](../privacidad/registro-de-actividades-de-tratamiento.md).

## Responsable

Responsable de seguridad; cada persona clasifica lo que crea.

## Evidencia que se guarda

Inventario de activos actualizado; revisiones.

## Frecuencia de revisión

Anual.

## Controles que cubre

ISO 27001:2022 A.5.9, A.5.12, A.5.13, A.5.14, A.5.10, A.8.10, A.8.11, A.8.12 ·
ISO 27701 6.5.2.1, 6.5.2.2 · SOC 2 C1.1, C1.2, CC6.1.
