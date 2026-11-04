# Gestión de incidentes

Versión 1.0 · Responsable: Gestor de incidentes · Revisión: anual y después de cada SEV1 o SEV2.

## Objetivo

Detectar, contener y resolver los incidentes de seguridad y de disponibilidad,
avisar a quien corresponde en plazo (en especial ante una brecha de datos
personales) y aprender de cada uno.

## Alcance

Todo evento que afecte o pueda afectar la confidencialidad, integridad o
disponibilidad de AUTENZA o de los datos que trata. Pasos operativos:
[runbook de incidentes](../operacion/runbook-incidentes.md).

## Cómo se reporta un evento

- **Personas de AUTENZA:** al Gestor de incidentes, en el momento.
- **Concesionarias y sus usuarios:** por el canal de soporte acordado en el contrato.
- **Investigadores externos:** reporte privado de vulnerabilidades ([SECURITY.md](../../SECURITY.md)).
- **Alertas automáticas:** [registros y monitoreo](registros-y-monitoreo.md).

Ante la duda, se reporta. Reportar un falso positivo no tiene costo.

## Clasificación

| Nivel | Criterio | Ejemplos |
|---|---|---|
| **SEV1** | Exposición o alteración de datos personales o de plata a escala; datos de un tenant visibles para otro; host comprometido; servicio caído para todos más de 4 h en horario comercial | Fuga de un backup sin cifrar, intrusión con acceso a la base |
| **SEV2** | Exposición acotada (un tenant, pocos titulares); cuenta privilegiada comprometida; secreto crítico filtrado; caída de más de 30 min en horario comercial; pérdida del acceso administrativo | Credencial de `admin` robada, secreto en un chat |
| **SEV3** | Degradación parcial; ataque dirigido sin éxito; vulnerabilidad crítica sin indicios de explotación; secreto de bajo impacto filtrado | Fuerza bruta contra una cuenta, una integración caída |
| **SEV4** | Evento sin impacto | Escaneo automático, falsa alarma |

La clasificación se revisa a medida que se sabe más. Ante la duda, el nivel más alto.

## Roles

En una organización de una persona, todos los ejerce el dueño. Se escriben
igual para no saltear ninguna tarea.

| Rol | Tarea |
|---|---|
| Gestor del incidente | Decide, prioriza, lleva el registro y la línea de tiempo |
| Responsable técnico | Diagnostica, contiene, erradica y recupera |
| Comunicaciones | Avisos a concesionarias, proveedores y terceros |
| Punto de contacto de privacidad | Evalúa la brecha de datos personales y prepara los avisos |

Se puede sumar ayuda externa (abogado, perito informático) con NDA.

## Pasos

1. **Registrar:** abrir el registro (plantilla abajo) con la hora de detección.
2. **Clasificar** dentro de la primera hora.
3. **Contener:** cortar el daño (desactivar cuentas, rotar secretos, cortar la
   exposición pública) sin destruir evidencia.
4. **Preservar evidencia:** logs, registros de la base, estado del host, con
   hora y hash, en el archivo privado (A.5.28). La cadena de custodia se anota.
5. **Evaluar si hay datos personales afectados** (sección siguiente).
6. **Erradicar:** eliminar la causa (parche, reconstrucción en limpio).
7. **Recuperar:** volver a servicio, verificar, vigilar de cerca una semana.
8. **Comunicar** según los plazos de abajo.
9. **Cerrar y aprender:** informe post-incidente para SEV1 y SEV2 dentro de los
   10 días hábiles, con acciones correctivas registradas como no conformidades
   ([auditoría interna](auditoria-interna-y-revision-por-la-direccion.md)).

## Brechas de datos personales

**Qué es:** cualquier incidente que provoque destrucción, pérdida, alteración,
divulgación o acceso no autorizado a datos personales, sea accidental o no.

**Evaluación** (la hace el punto de contacto de privacidad, por escrito):

- qué datos y de qué categorías (¿documentos de identidad, ingresos, deudas,
  posibles datos sensibles?);
- cuántos titulares, aproximado, y de qué concesionarias;
- si los datos estaban cifrados o seudonimizados y si la clave quedó a salvo;
- si hay evidencia de que alguien los vio, copió o usó;
- consecuencias probables para los titulares (fraude, suplantación de
  identidad, discriminación, daño reputacional) y su gravedad;
- si el daño se puede revertir.

**Registro:** toda brecha se registra, aunque se concluya que no hace falta
avisar a nadie, con la evaluación y el fundamento de la decisión.

**Aviso a la concesionaria** (AUTENZA es encargado; la concesionaria es la responsable):

- **Sin demora indebida**, con un **plazo objetivo de 48 horas** desde que
  AUTENZA confirma la brecha.
  > Pendiente de decisión del dueño: fijar el plazo contractual en el anexo de tratamiento de datos (el modelo propone 48 h).
- El primer aviso puede ser parcial; se completa a medida que se sabe más, con
  actualizaciones por lo menos cada 24 h mientras el incidente siga abierto.
- AUTENZA **no** avisa por su cuenta a los clientes de la concesionaria, salvo
  instrucción de la concesionaria u obligación legal. Asiste con el texto, la
  lista de titulares afectados y las medidas.

**Rol de la AAIP:** es la autoridad de control de la Ley 25.326. Cuando los
datos son de una concesionaria, la decisión de informar a la AAIP es de la
concesionaria y AUTENZA la asiste con la información. Cuando los datos son de
AUTENZA como responsable (cuentas de usuario, visitantes), AUTENZA evalúa
informar a la AAIP y a los usuarios afectados y documenta la decisión.
> Borrador para revisión legal: la Ley 25.326 no fija hoy un plazo de aviso a la autoridad; validar con un abogado el criterio vigente al momento de cada incidente.

**Otros avisos:** proveedores involucrados (por ejemplo, Meta o Mercado Libre si
se comprometieron sus tokens) y, si hay delito, la denuncia que decida la Dirección.

## Comunicación a las concesionarias

| Situación | Cuándo | Cómo |
|---|---|---|
| Brecha de datos personales que la afecta | Sin demora indebida (objetivo 48 h) | Email al responsable designado + llamada si es SEV1 |
| Caída de más de 30 min en horario comercial | Al confirmarla | Canal acordado |
| Incidente resuelto que la afectó | Informe final dentro de los 10 días hábiles | Email |

## Plantillas

**Registro de incidente** (archivo privado, uno por incidente):

```markdown
### INC-<AAAA>-<NN>: <título corto>
- Detectado: <fecha y hora> por <quién o qué alerta>
- Nivel: SEV<n> (revisiones: ...)
- ¿Datos personales afectados?: sí / no / en evaluación
- Concesionarias afectadas:
- Línea de tiempo (hora: acción, quién):
- Evidencia preservada (archivo, hash):
- Contención / erradicación / recuperación:
- Avisos enviados (a quién, cuándo, contenido):
- Cierre: <fecha y hora>; post-mortem: <enlace>
```

**Aviso a la concesionaria:**

```markdown
Asunto: [AUTENZA] Aviso de incidente de seguridad — <fecha>

Qué pasó: <descripción en lenguaje claro>
Cuándo: <inicio estimado> — detectado el <fecha y hora>
Datos involucrados: <categorías> de aproximadamente <N> personas de su concesionaria
Consecuencias posibles: <...>
Qué hicimos: <contención y medidas>
Qué les recomendamos: <medidas para la concesionaria y sus clientes>
Lo que todavía no sabemos: <...>
Próxima actualización: <fecha y hora>
Contacto: <punto de contacto de privacidad>
```

**Informe post-incidente:**

```markdown
### Post-mortem INC-<AAAA>-<NN>
- Resumen e impacto (usuarios, concesionarias, titulares, tiempo):
- Línea de tiempo:
- Causa raíz (5 porqués):
- Qué funcionó / qué no:
- Acciones correctivas (responsable, plazo, enlace a la no conformidad):
- Cambios a políticas o runbooks:
```

## Responsable

Gestor de incidentes; el punto de contacto de privacidad para las brechas.

## Evidencia que se guarda

Registros de incidentes y de brechas, avisos enviados, evidencia preservada con
sus hashes y post-mortems, en el archivo privado. Retención: 5 años.

## Frecuencia de revisión

Anual, después de cada SEV1 o SEV2 y con un ejercicio de mesa anual
(simular un incidente y recorrer esta política).

## Controles que cubre

ISO 27001:2022 A.5.24, A.5.25, A.5.26, A.5.27, A.5.28, A.6.8, A.5.5 ·
ISO 27701 6.13.1.1, 6.13.1.5, B.8.2.5 · SOC 2 CC7.3, CC7.4, CC7.5, CC2.2, CC2.3, P6.3, P6.5, P6.6.
