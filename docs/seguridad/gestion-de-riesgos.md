# Gestión de riesgos

Versión 1.0 · Responsable: Responsable de seguridad · Revisión: anual (metodología); trimestral (registro).

## Objetivo

Identificar, evaluar y tratar los riesgos de seguridad y privacidad de forma
repetible, y que cada riesgo que se acepta quede aceptado por escrito, con
dueño y fecha, y no olvidado.

## Alcance

Todo el [alcance del SGSI](alcance-y-contexto.md), incluidos los riesgos para
los titulares de datos personales (ISO 27701 5.4.1.2).

> **El registro de riesgos real y la Declaración de Aplicabilidad con su estado
> NO están en este repositorio**, que es público: describirían debilidades
> abiertas. Viven en el archivo privado de evidencias. Acá están solo la
> metodología y las plantillas.

## Metodología (ISO 6.1.2)

1. **Identificar:** por activo o proceso (del inventario y del registro de
   tratamientos), ¿qué amenaza puede aprovechar qué debilidad? Fuentes:
   auditorías, incidentes, vulnerabilidades, cambios grandes, proveedores, la
   [evaluación de impacto](../privacidad/evaluacion-de-impacto.md).
2. **Analizar:** probabilidad e impacto con la escala de abajo, considerando
   los controles que **ya** operan.
3. **Evaluar:** nivel = probabilidad × impacto, contra los criterios de aceptación.
4. **Tratar** (ISO 6.1.3): elegir una opción, definir controles, dueño y plazo.
5. **Aceptar el riesgo residual:** la Dirección lo firma.
6. **Seguir:** revisión trimestral del registro; cada cambio grande o incidente
   dispara una revisión puntual.

## Escala

**Probabilidad**

| Valor | Nivel | Criterio |
|---|---|---|
| 1 | Rara | Puede pasar solo en circunstancias excepcionales (menos de una vez en 5 años) |
| 2 | Improbable | Podría pasar alguna vez (una vez en 2 a 5 años) |
| 3 | Posible | Puede pasar (una vez en 1 a 2 años) |
| 4 | Probable | Va a pasar en el año |
| 5 | Casi segura | Pasa o está pasando |

**Impacto** (se toma el mayor de los criterios)

| Valor | Nivel | Datos personales | Servicio | Negocio y legal |
|---|---|---|---|---|
| 1 | Insignificante | Ninguno | Minutos | Ninguno |
| 2 | Menor | Pocos datos no sensibles de un tenant | Menos de 1 h | Reclamo aislado |
| 3 | Moderado | Datos de contacto de muchos titulares de un tenant | Menos de 1 día | Pérdida de un cliente, sanción leve |
| 4 | Mayor | Documentos, ingresos o deudas; o datos de más de un tenant | 1 a 3 días | Varios clientes, sanción, daño reputacional |
| 5 | Catastrófico | Exposición masiva o cruce entre tenants generalizado | Más de 3 días o pérdida de datos | Inviabilidad del negocio |

**Nivel = P × I**

| Nivel | Rango | Criterio de aceptación |
|---|---|---|
| Bajo | 1–5 | Aceptable. Se revisa una vez por año. |
| Medio | 6–11 | Aceptable con dueño asignado y revisión trimestral; tratar si hay una mejora barata. |
| Alto | 12–19 | **Tratamiento obligatorio** con plazo de 90 días como máximo, o aceptación firmada por la Dirección con vencimiento de 6 meses como máximo. |
| Crítico | 20–25 | **Tratamiento inmediato** (plan en 7 días, mitigación en 30 días). Solo se acepta transitoriamente, por escrito y por 30 días como máximo. |

## Opciones de tratamiento

- **Mitigar:** agregar o mejorar controles (lo habitual).
- **Evitar:** dejar de hacer la actividad (por ejemplo, no ofrecer una integración).
- **Transferir:** contrato, seguro o proveedor (la responsabilidad legal no se transfiere del todo).
- **Aceptar:** con firma, motivo y vencimiento.

Los controles elegidos se comparan con el Anexo A de ISO 27001:2022 para no
olvidar ninguno necesario; el resultado es la Declaración de Aplicabilidad.

## Plantilla: registro de riesgos

```markdown
| ID | Fecha | Activo / proceso | Amenaza | Debilidad | Controles actuales | P | I | Nivel | Tratamiento | Controles a implementar (Anexo A) | Dueño | Plazo | Riesgo residual (P×I) | Aceptación (quién, fecha, vence) | Estado | Última revisión |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| R-001 | AAAA-MM-DD | | | | | | | | Mitigar / Evitar / Transferir / Aceptar | | | | | | Abierto / En tratamiento / Aceptado / Cerrado | |
```

## Plantilla: Declaración de Aplicabilidad (SoA)

Se completa en el archivo privado para los 93 controles del Anexo A de ISO
27001:2022 (y, para el PIMS, los controles de ISO 27701 de responsable y de
encargado).

```markdown
| Control | Nombre | ¿Aplica? | Justificación (riesgo, requisito legal o contractual) | Estado (implementado / parcial / planificado / no) | Referencia (documento, archivo, evidencia) |
|---|---|---|---|---|---|
| A.5.1 | Políticas de seguridad de la información | Sí | | | docs/seguridad/politica-de-seguridad.md |
| A.7.4 | Monitoreo de la seguridad física | | | | |
| ... | | | | | |
```

Una exclusión se justifica siempre (por ejemplo, un control de desarrollo
tercerizado que no aplica porque no hay desarrollo tercerizado).

## Responsable

Responsable de seguridad. La Dirección aprueba los criterios de aceptación y
firma cada aceptación de riesgo.

## Evidencia que se guarda

Registro de riesgos con su historial; aceptaciones firmadas; SoA vigente y sus
versiones; actas de revisión trimestral.

## Frecuencia de revisión

Metodología: anual. Registro: trimestral y ante cambios o incidentes.

## Controles que cubre

ISO 27001:2022 6.1.1, 6.1.2, 6.1.3, 8.2, 8.3 · ISO 27701 5.4.1.2, 5.4.1.3 · SOC 2 CC3.1, CC3.2, CC3.3, CC3.4, CC9.1.
