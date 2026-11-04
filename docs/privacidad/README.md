# PIMS de AUTENZA (privacidad y datos personales)

Sistema de gestión de la privacidad que extiende el [SGSI](../seguridad/README.md)
según ISO/IEC 27701 y la Ley 25.326 de Protección de Datos Personales de
Argentina (autoridad de control: Agencia de Acceso a la Información Pública, AAIP).

> Borrador para revisión legal: las interpretaciones de la Ley 25.326 y los
> textos para titulares de esta carpeta tienen que validarse con un abogado
> antes de usarse con clientes.

## Los dos roles de AUTENZA

| | AUTENZA es **encargado del tratamiento** | AUTENZA es **responsable** |
|---|---|---|
| **De qué datos** | Los de los clientes, prospectos y contactos de cada concesionaria: fichas, atenciones, presupuestos, ventas, financiaciones, legajos de crédito, conversaciones, tasaciones, postventa | Las cuentas de usuario de la plataforma (empleados de las concesionarias y personal propio), la telemetría de seguridad (IP, user-agent, eventos), los datos de la cuenta comercial de cada concesionaria y los de los visitantes del sitio público |
| **Quién decide** | La concesionaria decide finalidades y medios; AUTENZA trata **por su cuenta y según sus instrucciones** (art. 25 de la Ley 25.326) | AUTENZA |
| **Qué le debe AUTENZA a quién** | A la concesionaria: usar los datos solo para el servicio, no cederlos, seguridad, confidencialidad, asistencia con derechos y brechas, devolución y supresión al terminar | A los titulares: información, base legal, derechos, seguridad |
| **Documento base** | [Contrato de encargado](contrato-de-encargado-plantilla.md) | [Aviso de privacidad](aviso-de-privacidad-borrador.md) |
| **ISO 27701** | Controles del Anexo B (encargado) | Controles del Anexo A (responsable) |

La concesionaria, como responsable de los datos de sus clientes, es quien debe
informarles, obtener su consentimiento cuando haga falta, inscribir su base
ante la AAIP y responder sus pedidos. AUTENZA le da las herramientas y la asiste.

## Documentos

| Documento | Para qué |
|---|---|
| [Registro de actividades de tratamiento](registro-de-actividades-de-tratamiento.md) | Qué datos se tratan, para qué, con qué base, quién los recibe, cuánto se guardan |
| [Política de retención](politica-de-retencion.md) | Plazos por categoría y su fundamento; purga con `npm run retencion` |
| [Derechos de los titulares](derechos-de-los-titulares.md) | Acceso, rectificación, actualización, supresión y bloqueo: canal, verificación, plazos |
| [Contrato de encargado (modelo)](contrato-de-encargado-plantilla.md) | Anexo de tratamiento de datos para el contrato con cada concesionaria |
| [Aviso de privacidad (borrador)](aviso-de-privacidad-borrador.md) | Política de privacidad de la plataforma para usuarios y visitantes |
| [Texto de consentimiento (modelo)](texto-de-consentimiento-modelo.md) | Para que la concesionaria informe y pida consentimiento en el mostrador |
| [Evaluación de impacto](evaluacion-de-impacto.md) | Tratamientos de mayor riesgo: legajo de crédito, WhatsApp, ingesta de emails |
| [Baja de una concesionaria](baja-de-una-concesionaria.md) | Devolución y supresión de los datos al terminar el contrato |

Relacionados en el SGSI: [incidentes y brechas](../seguridad/gestion-de-incidentes.md),
[proveedores y subencargados](../seguridad/proveedores-y-subencargados.md),
[clasificación](../seguridad/clasificacion-de-la-informacion.md),
[control de acceso](../seguridad/control-de-acceso.md).

## Cómo se mantiene

- Igual que el SGSI: cambios por PR, aprobación en la revisión por la dirección,
  evidencia en el archivo privado.
- **Punto de contacto de privacidad:** el rol definido en
  [roles y responsabilidades](../seguridad/roles-y-responsabilidades.md). Canal
  publicado: `<email-de-privacidad>`.
  > Pendiente de decisión del dueño: crear el buzón de privacidad y publicarlo en el aviso.
- **Registro de bases ante la AAIP:** AUTENZA inscribe sus propias bases (como
  responsable) y orienta a cada concesionaria para que inscriba la suya.
  > Pendiente de decisión del dueño: inscripción de las bases de AUTENZA.
- Todo cambio que trate datos personales nuevos actualiza el registro de
  tratamientos en el mismo PR ([desarrollo seguro](../seguridad/desarrollo-seguro.md)).
- Revisión anual de toda la carpeta y de la evaluación de impacto.

## Numeración de ISO 27701

Se cita la edición 2019 (controles A.7.x del responsable, B.8.x del encargado y
extensiones 6.x de ISO 27002) con el nombre del control. Si se usa la edición
2025, se mapean por nombre.
