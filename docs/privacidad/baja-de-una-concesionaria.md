# Baja de una concesionaria: devolución y supresión de los datos

Versión 1.0 · Responsable: Punto de contacto de privacidad · Revisión: anual.

> Pendiente de decisión del dueño: los plazos marcados como propuesta, que
> también figuran en el [contrato de encargado](contrato-de-encargado-plantilla.md) (cláusula 10).

## Objetivo

Que al terminar el contrato la concesionaria se lleve sus datos y AUTENZA los
suprima de forma verificable, como exige el art. 25 de la Ley 25.326.

## Alcance

Todos los datos de la concesionaria en la plataforma: base de datos, archivos
subidos, sesiones de WhatsApp, tokens de integraciones, cuentas de usuario y
copias de respaldo.

## Línea de tiempo

| Momento | Qué pasa |
|---|---|
| **Aviso de baja** | Se confirma por escrito la fecha de fin (T0), el contacto de la concesionaria y el formato de exportación. |
| **Hasta T0** | Servicio normal. La concesionaria puede ir exportando. |
| **T0 a T0 + 30 días** *(propuesta)* | **Período de exportación.** Solo queda activo el usuario administrador, para exportar; el resto de los usuarios se desactiva. A pedido, AUTENZA entrega una exportación completa: datos en un formato de uso común (CSV o JSON) y los archivos subidos, por un canal cifrado. |
| **T0 + 30 a T0 + 60 días** *(propuesta)* | **Supresión** de los datos de la concesionaria en producción. |
| **+ 14 días** | Los backups que todavía contienen esos datos vencen por su ciclo normal (`BACKUP_RETENTION_DAYS`). |
| **Dentro de los 5 días hábiles** siguientes | **Constancia de supresión** a la concesionaria. |

Si la concesionaria autoriza por escrito conservar los datos por encargos
futuros, se pueden guardar con las mismas medidas de seguridad por hasta **dos
años** (art. 25, inc. 2). La autorización se archiva y se fija una fecha de
supresión.

## Pasos

**Al confirmar la baja**

- [ ] Registrar la baja con T0 y el contacto de la concesionaria.
- [ ] Acordar el formato de exportación.
- [ ] Avisarle que debe desvincular o revocar desde su lado lo que contrató por
      su cuenta (app de Meta, cuenta de Mercado Libre, número de WhatsApp,
      contraseña de la casilla de email).

**En T0**

- [ ] Desactivar todas las cuentas de usuario de la concesionaria salvo el
      administrador (que queda solo para exportar); cerrar sus sesiones.
- [ ] Desvincular las integraciones: revocar y borrar tokens de Meta y Mercado
      Libre, borrar las credenciales de la casilla, desvincular los números de
      WhatsApp y borrar sus sesiones del volumen `wa-auth`.
- [ ] Entregar la exportación si se pidió, y registrar la entrega.

**Al vencer el período de exportación**

- [ ] Backup verificado previo (para poder probar qué se suprimió si hubiera un reclamo; vence con el ciclo normal).
- [ ] Suprimir todos los registros del tenant y sus archivos subidos, con un
      procedimiento versionado y revisado en un PR, en una sola transacción por
      lote, y registrado en el log de deploys.
      > Pendiente: script versionado de exportación y supresión completa de un tenant. Hasta que exista, el procedimiento se escribe y se revisa en un PR antes de cada baja.
- [ ] Conservar solo lo que AUTENZA debe guardar por obligación propia: su
      facturación del servicio a la concesionaria (R-05) y el rastro mínimo de
      auditoría de la plataforma (R-13), anonimizado donde se pueda.
- [ ] Verificar: conteo de registros del tenant en cero en cada tabla, y
      directorio de archivos vacío.

**Cierre**

- [ ] Esperar el vencimiento de los backups (14 días) y confirmar que ya no
      queda ninguno anterior a la supresión.
- [ ] Emitir la constancia de supresión (plantilla abajo).
- [ ] Quitar a la concesionaria de los avisos de cambios de subencargados.

## Plantilla: constancia de supresión

```markdown
Constancia de supresión de datos personales

`<Razón social de AUTENZA>` deja constancia de que, en cumplimiento del contrato
de servicio y del art. 25 de la Ley 25.326, suprimió los datos personales que
trataba por cuenta de `<razón social de la concesionaria>` (CUIT `<…>`):

- Fecha de fin del servicio (T0): `<fecha>`
- Exportación entregada: `<sí, fecha y formato / no solicitada>`
- Fecha de supresión en producción: `<fecha>`
- Vencimiento de la última copia de respaldo con esos datos: `<fecha>`
- Datos conservados por obligación legal propia: facturación del servicio de AUTENZA
  a la concesionaria; registro mínimo de auditoría de la plataforma.

Firma y fecha.
```

## Responsable

Punto de contacto de privacidad (coordinación y constancia); Operador de
producción (ejecución).

## Evidencia que se guarda

Registro de la baja, entrega de la exportación, PR del procedimiento de
supresión, conteos de verificación y constancia firmada. Retención: 5 años.

## Frecuencia de revisión

Anual, y después de cada baja (para corregir lo que no funcionó).

## Controles que cubre

ISO 27701 B.8.4.2, A.7.4.5, A.7.4.8 · ISO 27001:2022 A.8.10, A.5.11 · SOC 2 C1.2, P4.3 · Ley 25.326 art. 25.
