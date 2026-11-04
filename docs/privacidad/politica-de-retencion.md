# Política de retención

Versión 1.0 · Responsable: Punto de contacto de privacidad · Revisión: anual.

> Pendiente de decisión del dueño: los plazos de esta tabla son **propuestas**.
> Borrador para revisión legal: validar con un abogado y un contador los
> plazos legales (fiscales, contables, de defensa del consumidor y, si aplica,
> de prevención de lavado de activos).

## Objetivo

Conservar los datos personales solo mientras sean necesarios para su
finalidad o para cumplir una obligación legal, y después suprimirlos o
anonimizarlos (art. 4 de la Ley 25.326).

## Alcance

Todos los datos del [registro de actividades de tratamiento](registro-de-actividades-de-tratamiento.md):
base de datos, archivos subidos, sesiones de WhatsApp, registros y backups.

## Reglas

1. **Supresión o anonimización al vencer el plazo.** Anonimizar = reemplazar
   los datos identificatorios (nombre, documento, teléfono, email, domicilio,
   textos libres) por marcadores y borrar adjuntos y mensajes, de modo que no
   se pueda volver a identificar al titular. Un borrado lógico (soft-delete)
   **no** es supresión.
2. **Bloqueo cuando hay obligación legal de conservar.** Si un dato debe
   guardarse por ley pero ya no se usa para operar, se **bloquea**: sale de
   listados, búsquedas y contactos, y queda accesible solo para cumplir esa
   obligación (art. 16, inc. 5 de la Ley 25.326).
3. **La concesionaria manda** sobre los datos de sus clientes: puede pedir
   plazos más cortos o más largos, dentro de la ley. Si no dice nada, se
   aplica esta tabla.
4. **Backups:** no se editan. Un dato suprimido desaparece de los backups
   cuando estos vencen (14 días). Si se restaura un backup, se vuelve a correr
   la purga antes de reabrir el servicio.
5. **Logs:** se minimiza lo que entra ([registros y monitoreo](../seguridad/registros-y-monitoreo.md)).

## Plazos

| Código | Categoría | Plazo propuesto | Al vencer | Fundamento |
|---|---|---|---|---|
| R-01 | Prospectos y consultas sin ninguna operación | 24 meses desde la última interacción | Anonimizar | Finalidad comercial agotada |
| R-02 | Atenciones en el salón sin operación | 24 meses desde la atención | Anonimizar (borrar observaciones y capacidad de compra) | Finalidad agotada |
| R-03 | Presupuestos y tasaciones no convertidos en operación | 24 meses desde su fecha | Anonimizar | Finalidad agotada |
| R-04 | Ficha de un cliente con operaciones | Mientras dure la relación; luego, bloqueada mientras se conserven sus operaciones (R-05) | Anonimizar al vencer R-05 | Relación contractual; R-05 |
| R-05 | Operaciones con efecto contable o fiscal: ventas, pagos, señas cobradas, financiaciones, cuotas y pagos, comprobantes; facturación del servicio de AUTENZA | 10 años desde la operación, bloqueadas al terminar la relación | Suprimir o anonimizar | Código Civil y Comercial, art. 328 (conservación de libros, registros y comprobantes por 10 años); obligaciones fiscales. *Validar si la concesionaria es sujeto obligado ante la UIF.* |
| R-06 | Legajo de crédito: imagen del DNI y recibos de sueldo | 90 días desde que la financiera responde (aprobada, rechazada o desistida) | Borrado físico del archivo | Minimización; posibles datos sensibles incidentales. La financiera conserva su propio legajo. |
| R-07 | Postventa (reclamos y casos) | 3 años desde el cierre del caso | Anonimizar | Plazo de prescripción de la Ley 24.240 (*validar*) |
| R-08 | Documentos de una unidad con datos del titular anterior | 12 meses desde la venta de la unidad, salvo los que respalden la operación (R-05) | Borrar | Finalidad agotada |
| R-09 | Conversaciones (WhatsApp, Messenger, Instagram) | Sin cliente vinculado: 6 meses desde el último mensaje. Con cliente: como su ficha (R-01 o R-04) | Borrar los mensajes | Minimización |
| R-10 | Contactos de proveedores, financieras, soporte y cuenta comercial | Mientras dure la relación y 2 años más | Anonimizar | Finalidad agotada |
| R-11 | Datos comerciales del personal de la concesionaria (comisiones, objetivos) | Lo que defina la concesionaria; por defecto, como la cuenta del usuario (R-12), salvo lo que respalde pagos (R-05) | Anonimizar | Relación laboral (de la concesionaria) |
| R-12 | Cuentas de usuario | Mientras esté activa; 12 meses después de la baja | Anonimizar nombre y email (se conserva el id para el rastro) | Atribución de acciones |
| R-12b | Tokens de sesión, de recuperación y códigos usados o vencidos | 30 días desde que vencen o se usan | Borrar | Sin finalidad |
| R-13 | `audit_log` y `security_events` | `audit_log` 5 años; `security_events` 2 años; IP truncada a los 12 meses | Borrar | Prueba de operaciones de plata y de seguridad |
| R-14 | Logs de aplicación y de nginx | 30 días | Rotación | Operación y seguridad |
| R-15 | Backups (local y offsite) | 14 días (`BACKUP_RETENTION_DAYS`) | Borrado automático | Continuidad |
| R-16 | Sesiones de WhatsApp (`wa-auth`) | Hasta que se desvincula el número | Borrar la sesión | Funcionamiento del canal |
| R-17 | Datos de una concesionaria que termina el contrato | Según [baja de una concesionaria](baja-de-una-concesionaria.md) | Devolver y suprimir | Art. 25 de la Ley 25.326 |
| R-18 | Reportes de vulnerabilidades, incidentes y evidencia del SGSI | 5 años | Borrar | Prueba y mejora |
| R-19 | Archivos temporales del servidor (exportaciones, procesos de importación) | Al terminar el proceso | Borrar | Minimización (archivos temporales) |

## Ejecución: `npm run retencion`

- Comando del backend que aplica la purga y la anonimización según los plazos
  configurados. **Por defecto corre en *dry-run***: informa qué haría sin
  modificar nada. Su cabecera documenta qué categorías cubre, cómo se
  configuran los plazos y cómo se ejecuta para aplicar.
- En producción se corre dentro del contenedor del backend, primero en
  *dry-run*: `docker compose exec -T backend npm run retencion </dev/null`.
- **Frecuencia:** mensual. Se revisa la salida del *dry-run*, se aplica y se
  guarda el resumen (cantidades por categoría, sin datos personales) en el
  archivo privado.
- Antes de aplicarlo por primera vez, o después de cambiar plazos: backup
  verificado y revisión de la salida con la concesionaria si la afecta.
- Las categorías que el comando todavía no cubra se tratan con un procedimiento
  manual registrado o quedan como riesgo en el registro de riesgos.

## Responsable

Punto de contacto de privacidad (plazos y ejecución); Operador de producción (corrida mensual).

## Evidencia que se guarda

Resúmenes mensuales de la purga; plazos acordados con cada concesionaria que
difieran de esta tabla; decisiones de bloqueo.

## Frecuencia de revisión

Anual, y ante cambios legales o de producto.

## Controles que cubre

ISO 27701 A.7.4.4, A.7.4.5, A.7.4.6, A.7.4.7, A.7.4.8, B.8.4.1, B.8.4.2 ·
ISO 27001:2022 A.8.10, A.5.33, A.5.34 · SOC 2 P4.2, P4.3, C1.2 · Ley 25.326 arts. 4, 16, 25.
