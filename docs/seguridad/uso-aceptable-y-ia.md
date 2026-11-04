# Uso aceptable y asistentes de IA

Versión 1.0 · Responsable: Responsable de seguridad · Revisión: anual (la parte de IA, semestral).

## Objetivo

Definir cómo se usan los equipos, las cuentas y los datos de AUTENZA, y en
particular los asistentes de IA, para que no sean un canal de fuga de datos ni
de cambios sin control.

## Alcance

Toda persona con acceso a sistemas de AUTENZA y toda herramienta de IA
(asistentes de chat, agentes de código, revisores automáticos) que se use para
desarrollar, operar o dar soporte.

## Uso aceptable

1. Los accesos de AUTENZA se usan solo para trabajar en AUTENZA.
2. Prohibido: compartir credenciales, desactivar controles de seguridad (2FA,
   CI, protección de rama, firewall) sin el procedimiento de excepción, probar
   ataques fuera de un entorno propio y autorizado, y llevarse datos de clientes.
3. Los datos de producción se miran solo cuando la tarea lo exige
   (soporte, incidente) y lo mínimo necesario.
4. El equipo de trabajo cumple la sección de trabajo remoto de [personas](personas.md).
5. Software en equipos de trabajo: de fuentes oficiales y actualizado.
6. Cualquier uso indebido que veas, reportalo ([incidentes](gestion-de-incidentes.md)).

## Asistentes de IA

### Datos

| Se puede compartir con un asistente | **Nunca** se comparte |
|---|---|
| Código fuente y diffs | Datos personales reales (de clientes, usuarios o empleados), incluso un registro |
| Documentación y runbooks con marcadores | Secretos: contenido del `.env`, tokens, contraseñas, claves privadas, códigos de recuperación |
| Datos sintéticos o del seed de pruebas | Dumps, backups, exportes CSV o PDF de producción |
| Salidas de comandos **revisadas** antes de pegarlas (sin datos personales ni secretos) | Logs de producción sin revisar (pueden contener datos personales en URLs y errores) |
| Mensajes de error con los datos reemplazados | IPs, usuarios del sistema y hostnames internos de producción |

Si por error se compartió un secreto, **se considera comprometido**: se rota
([criptografía y secretos](criptografia-y-secretos.md)). Si se compartieron
datos personales, es un evento de seguridad que se evalúa como posible brecha
([incidentes](gestion-de-incidentes.md)).

### Cambios

1. **La IA no aprueba.** Puede escribir, revisar y señalar riesgos; la decisión
   de mergear es siempre humana, después de leer el diff completo.
2. La "revisión adversarial" o cualquier revisión hecha por IA se declara en el
   PR como lo que es: un control de **detección**, no una aprobación.
3. Los commits asistidos llevan `Co-Authored-By` con el modelo usado.
4. El código generado pasa por la misma [DoD y checklist](desarrollo-seguro.md)
   que cualquier otro. Las afirmaciones de la IA sobre "ya probado" o "ya
   verificado" se comprueban.

### Acceso a sistemas

1. **Producción solo supervisada.** El agente propone el comando; el humano lo
   lee y lo aprueba o lo ejecuta, uno por uno. Nada de scripts ofuscados
   (por ejemplo, codificados en base64) que el humano no pueda leer.
2. Preferir **solo lectura**. Toda escritura en producción sigue la
   [gestión de cambios](gestion-de-cambios.md) (backup previo, registro).
3. Si un agente necesita una credencial (por ejemplo, una llave SSH), es
   **propia del agente**, con el mínimo alcance posible (restricción de comando
   o de origen), inventariada y revisada cada trimestre, y revocable sin
   tocar las del humano.
4. Un agente con permisos de escritura **no procesa contenido no confiable**
   de producción (mails entrantes, mensajes de WhatsApp, preguntas de Mercado
   Libre, archivos subidos): ese contenido puede traer instrucciones
   maliciosas (*prompt injection*).
5. Los modos de ejecución automática del agente se limitan a comandos de solo
   lectura en el entorno local.

### Memoria y configuración del asistente

1. Las notas o memorias persistentes del asistente no guardan secretos, IPs,
   usuarios, hostnames internos ni datos personales. Lo operativo va al repo
   ([runbooks](../operacion/)) con marcadores.
2. Cada trimestre se revisan y se limpian esas notas.
3. Se configura la retención de datos del proveedor del asistente al mínimo
   disponible y se deja constancia de la configuración.
4. El proveedor del asistente figura en el
   [registro de proveedores](proveedores-y-subencargados.md).

## Responsable

Responsable de seguridad. Cada persona es responsable de lo que comparte.

## Evidencia que se guarda

Configuración de retención del proveedor de IA; revisión trimestral de notas
del asistente; inventario de credenciales de agentes (en la revisión de accesos);
incidentes por datos compartidos por error.

## Frecuencia de revisión

Anual; la sección de IA, semestral (las herramientas cambian rápido).

## Controles que cubre

ISO 27001:2022 A.5.10, A.5.23, A.5.8, A.6.3, A.8.1, A.8.12, A.5.14 ·
ISO 27701 6.10.2.1 · SOC 2 CC1.4, CC2.1, CC9.2, C1.1.
