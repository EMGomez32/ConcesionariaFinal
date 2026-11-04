# Evaluación de impacto en la protección de datos (EIPD)

Versión 1.0 · Responsable: Punto de contacto de privacidad · Revisión: anual o ante un cambio en estos tratamientos.

> Borrador para revisión legal. Este documento es público: describe riesgos
> **inherentes** y las medidas **requeridas**. El estado de implementación de
> cada medida y el riesgo residual medido se siguen en el registro de riesgos
> privado ([gestión de riesgos](../seguridad/gestion-de-riesgos.md)).

## Objetivo

Evaluar los tres tratamientos de mayor riesgo para los titulares, decidir las
medidas que los vuelven aceptables y dejar constancia de esa decisión.

## Método

- Escala de probabilidad e impacto de 1 a 5 de la [gestión de riesgos](../seguridad/gestion-de-riesgos.md),
  pensada desde el **titular** (qué le puede pasar a la persona).
- **Riesgo inherente:** sin medidas específicas. **Riesgo residual esperado:**
  con todas las medidas requeridas funcionando.
- Las concesionarias son las responsables de estos tratamientos; esta
  evaluación es la contribución de AUTENZA como encargado y les sirve de base
  para la suya (ISO 27701 A.7.2.5; B.8.2.5).

## 1. Legajo de crédito: DNI y recibos de sueldo

**Descripción.** Para pedir un crédito a una financiera, el vendedor sube la
imagen del DNI y los recibos de sueldo del cliente. Se guardan como adjuntos de
la solicitud (actividad E5 del [registro](registro-de-actividades-de-tratamiento.md)).

**Necesidad y proporcionalidad.** La financiera los exige para evaluar el
crédito y el cliente lo pide. No hay alternativa con menos datos dentro del
sistema; sí se puede **reducir**: tapar descuentos que revelan datos sensibles
y conservar poco tiempo.

| Riesgo para el titular | P × I inherente | Medidas requeridas | P × I residual esperado |
|---|---|---|---|
| Robo de identidad o fraude con la imagen del DNI si se filtra | 3 × 5 = 15 (alto) | Zona privada con URL firmada de corta duración y sin caché (`uploads.middleware.ts`, `urlFirmada.ts`); acceso solo para los roles que gestionan créditos; registro de cada descarga; backups cifrados | 1 × 5 = 5 (bajo) |
| Exposición de ingresos, empleador y deudas a personal que no los necesita | 4 × 3 = 12 (alto) | Restricción por rol y por cartera; sin estos adjuntos en exportaciones masivas | 2 × 3 = 6 (medio) |
| Revelación de datos sensibles incidentales (afiliación sindical, obra social) | 3 × 4 = 12 (alto) | Aviso al cliente para tapar descuentos ([texto de consentimiento](texto-de-consentimiento-modelo.md)); clasificación Restringida | 2 × 3 = 6 (medio) |
| Conservación más allá de lo necesario | 5 × 3 = 15 (alto) | Borrado físico a los 90 días de la respuesta de la financiera (R-06) con `npm run retencion`; al borrar la solicitud se borran sus adjuntos | 1 × 3 = 3 (bajo) |
| Archivo malicioso que afecta a quien lo abre | 2 × 3 = 6 (medio) | Validación por contenido real, nombre aleatorio, `nosniff` y CSP `sandbox` al servirlo | 1 × 3 = 3 (bajo) |

**Conclusión:** aceptable **solo** con todas las medidas requeridas operando.

## 2. Bandeja de WhatsApp con un cliente no oficial

**Descripción.** La concesionaria vincula un número escaneando un QR. La
plataforma recibe y envía los mensajes de ese número mediante una librería no
oficial que emula WhatsApp Web, y guarda las conversaciones (actividad E9).

**Necesidad y proporcionalidad.** El canal es central en la venta de autos en
Argentina. La alternativa oficial (WhatsApp Business Platform) tiene costos y
requisitos que hoy frenan a las concesionarias chicas. El riesgo principal es
recolectar de más.

| Riesgo para el titular | P × I inherente | Medidas requeridas | P × I residual esperado |
|---|---|---|---|
| Ingreso de conversaciones privadas ajenas al negocio (si se vincula un celular personal): familiares, terceros, datos sensibles | 4 × 4 = 16 (alto) | Solo números **exclusivamente comerciales**, declarado por el administrador al vincular y exigido por contrato; opción de ignorar un chat y borrarlo; no se inician conversaciones en frío ni envíos masivos | 2 × 3 = 6 (medio) |
| Conservación indefinida de mensajes | 5 × 3 = 15 (alto) | Plazos R-09 (6 meses sin cliente vinculado) aplicados con `npm run retencion` | 2 × 2 = 4 (bajo) |
| Robo de la sesión del número (permite leer y enviar como la concesionaria) | 2 × 4 = 8 (medio) | Sesiones solo en el volumen `wa-auth` del host, fuera de git y de la imagen; backups cifrados; desvincular el número revoca la sesión | 1 × 4 = 4 (bajo) |
| Corte del canal por bloqueo del número (pérdida de contacto con el cliente) | 3 × 2 = 6 (medio) | Aviso previo a la concesionaria; espaciado entre envíos; plan de migración a la plataforma oficial | 3 × 2 = 6 (medio) |
| Personal que lee conversaciones de clientes ajenos a su cartera | 3 × 3 = 9 (medio) | Recorte de la bandeja para el vendedor; acceso por rol | 2 × 2 = 4 (bajo) |
| Sin contrato de encargado con el proveedor del canal | 5 × 2 = 10 (medio) | Información clara a la concesionaria; hoja de ruta hacia la plataforma oficial | 5 × 2 = 10 (medio) |

**Conclusión:** riesgo residual **medio**, aceptable de forma transitoria por la
Dirección y la concesionaria, con revisión semestral y la migración al canal
oficial como tratamiento de fondo.
> Pendiente de decisión del dueño: fecha objetivo para ofrecer el canal oficial.

## 3. Ingesta de emails (casilla IMAP de la concesionaria)

**Descripción.** Un worker lee una carpeta de la casilla de email que
configura la concesionaria y convierte los avisos de portales en consultas
(actividad E10).

**Necesidad y proporcionalidad.** Evita la carga manual de consultas que llegan
por portales. El riesgo es leer más de lo necesario.

| Riesgo para el titular | P × I inherente | Medidas requeridas | P × I residual esperado |
|---|---|---|---|
| Mails ajenos a consultas (facturas, bancos, personales) convertidos en "clientes" | 4 × 3 = 12 (alto) | Carpeta **dedicada** solo a avisos de portales (checklist de alta); lista de remitentes permitidos por integración | 1 × 3 = 3 (bajo) |
| Acumulación de texto libre de cada consulta | 4 × 2 = 8 (medio) | Guardar solo lo necesario de cada aviso; plazos R-01 | 2 × 2 = 4 (bajo) |
| Reapertura del contacto con quien ya se había descartado u opuesto | 3 × 2 = 6 (medio) | Respetar la oposición y el bloqueo del titular | 1 × 2 = 2 (bajo) |
| Robo de las credenciales de la casilla | 2 × 4 = 8 (medio) | Credenciales cifradas con AES-256-GCM (`secretBox.ts`); conexión solo a hosts públicos y puertos IMAP (`destinoSeguro.ts`) | 1 × 4 = 4 (bajo) |

**Conclusión:** aceptable con las medidas requeridas.

## Decisión

| Tratamiento | Residual esperado | Decisión |
|---|---|---|
| Legajo de crédito | Bajo a medio | Continuar; medidas requeridas como prioridad alta |
| WhatsApp no oficial | Medio | Continuar transitoriamente con aceptación de la Dirección y aviso a cada concesionaria; revisión semestral |
| Ingesta de emails | Bajo | Continuar |

Firma de la Dirección y fecha: en el acta de revisión por la dirección.

## Evidencia que se guarda

Esta evaluación aprobada; estado de cada medida en el registro de riesgos;
aceptaciones de la Dirección; avisos a las concesionarias sobre WhatsApp.

## Frecuencia de revisión

Anual, o antes si cambia uno de estos tratamientos o se suma otro de riesgo
alto (por ejemplo, una integración nueva con datos financieros).

## Controles que cubre

ISO 27701 A.7.2.5, A.7.4.1, A.7.4.2, B.8.2.5 · ISO 27001:2022 A.5.34, A.8.12 ·
SOC 2 CC3.2, P3.1, P4.1 · Ley 25.326 arts. 4, 7, 9.
