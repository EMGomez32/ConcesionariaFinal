# Auditoría interna, revisión por la dirección y mejora

Versión 1.0 · Responsable: Responsable de seguridad (auditoría) y Dirección (revisión) · Revisión: anual.

## Objetivo

Verificar que el SGSI y el PIMS se cumplen y funcionan, que la Dirección
decide con información y que cada desvío se corrige en su causa.

## Alcance

Todas las cláusulas 4 a 10 de ISO 27001:2022, los controles de la Declaración
de Aplicabilidad y los requisitos de privacidad de [docs/privacidad/](../privacidad/README.md).

## Seguimiento y medición (ISO 9.1)

Los objetivos de la [política](politica-de-seguridad.md) se miden cada
semestre, con la fuente indicada en cada uno. Las mediciones se guardan en el
archivo privado y son una entrada de la revisión por la dirección.

## Auditoría interna (ISO 9.2)

**Programa**

- **Una auditoría completa por año** (todas las cláusulas y una muestra de
  controles del Anexo A), planificada en el primer trimestre del año.
- Prioridad por riesgo: control de acceso, gestión de cambios, respaldo,
  incidentes y privacidad van todos los años; el resto rota.
- Muestra mínima: 5 PR de riesgo alto, el log de deploys de un mes, una
  revisión trimestral de accesos, un simulacro de restore, un pedido de un
  titular (si hubo).

**Independencia.** El auditor no audita su propio trabajo. En una organización
de una persona:

1. La auditoría anual la hace un **tercero** (consultor o auditor con NDA).
   > Pendiente de decisión del dueño: contratar al auditor externo y su frecuencia.
2. Mientras no haya tercero, el dueño hace una **autoevaluación** con esta
   misma plantilla y la declara como tal en el acta. No cuenta como auditoría
   independiente.
3. Las revisiones hechas con asistentes de IA son un insumo útil (control de
   detección) pero no son una auditoría interna: no tienen independencia ni
   verifican evidencia por sí mismas.

**Plantilla: informe de auditoría**

```markdown
### Auditoría interna <AAAA>
- Auditor (independiente / autoevaluación):
- Fechas y alcance (cláusulas y controles):
- Criterios: ISO 27001:2022, ISO 27701, políticas de docs/seguridad y docs/privacidad
- Evidencia revisada:
- Conformidades destacadas:
- No conformidades (NC-<AAAA>-<NN>): mayor / menor, requisito, evidencia
- Observaciones y oportunidades de mejora:
- Conclusión:
```

## Revisión por la dirección (ISO 9.3)

**Cada seis meses** (mayo y noviembre) y después de un incidente SEV1.

**Entradas (9.3.2)**

1. Estado de las acciones de la revisión anterior.
2. Cambios en cuestiones internas y externas, y en las necesidades de las
   partes interesadas ([alcance y contexto](alcance-y-contexto.md)).
3. Desempeño: no conformidades y acciones correctivas; resultados de
   seguimiento y medición (objetivos); resultados de auditorías; cumplimiento
   de los objetivos de seguridad.
4. Retroalimentación de partes interesadas (concesionarias, titulares, reportes externos).
5. Resultados de la evaluación de riesgos y estado del plan de tratamiento.
6. Incidentes y brechas del período.
7. Proveedores: cambios y revisiones.
8. Oportunidades de mejora.

**Plantilla: acta**

```markdown
### Revisión por la dirección <AAAA-MM>
- Fecha, participantes:
- Versión del SGSI revisada (commit):
- Entradas (1 a 8): resumen de cada una
- Decisiones:
  - Políticas aprobadas o modificadas (con versión):
  - Riesgos aceptados (ID, vencimiento):
  - Recursos asignados (tiempo, presupuesto, contrataciones):
  - Cambios al SGSI:
  - Objetivos para el próximo período:
- Acciones (responsable, plazo):
- Firma de la Dirección:
```

## No conformidades y acción correctiva (ISO 10.2)

Una **no conformidad** es cualquier incumplimiento de un requisito de ISO, de
una política propia, de un contrato o de la ley: lo encuentre una auditoría, un
incidente, una medición o cualquier persona.

1. **Reaccionar:** contener y corregir el efecto inmediato.
2. **Analizar la causa** (5 porqués) y buscar si pasa en otro lado.
3. **Acción correctiva** que elimine la causa, con responsable y plazo.
4. **Verificar la eficacia** en la fecha fijada.
5. Actualizar riesgos y políticas si hace falta.

**Plantilla: no conformidad**

```markdown
### NC-<AAAA>-<NN>: <título>
- Origen: auditoría / incidente / medición / reporte / otro
- Requisito incumplido (cláusula, control, política, contrato, ley):
- Descripción y evidencia:
- Clasificación: mayor (el requisito no se cumple en absoluto o hay riesgo alto) / menor
- Corrección inmediata (qué, cuándo):
- Causa raíz:
- ¿Puede pasar en otro lado?:
- Acción correctiva (responsable, plazo):
- Verificación de eficacia (fecha, resultado):
- Cierre (fecha, firma):
```

## Mejora continua (ISO 10.1)

Las oportunidades de mejora surgen de auditorías, incidentes, revisiones y
reportes. Se registran junto con las no conformidades, se priorizan por riesgo
en la revisión por la dirección y se ejecutan por el camino normal de cambios.

## Calendario

| Mes | Actividad |
|---|---|
| Enero, abril, julio, octubre | Revisión de accesos y de riesgos |
| Febrero-marzo | Auditoría interna anual |
| Mayo, noviembre | Revisión por la dirección (medición de objetivos) |
| Una vez por año | Ejercicio de mesa de incidentes, concientización, revisión de proveedores y de la evaluación de impacto |

## Responsable

Responsable de seguridad (programa de auditoría, registro de no
conformidades). Dirección (revisión, decisiones).

## Evidencia que se guarda

Programas e informes de auditoría, actas firmadas, registro de no
conformidades con su verificación de eficacia, mediciones de objetivos.
Retención: 5 años.

## Frecuencia de revisión

Anual.

## Controles que cubre

ISO 27001:2022 9.1, 9.2, 9.3, 10.1, 10.2, A.5.35, A.5.36 · ISO 27701 6.15.2.1, 6.15.2.3 · SOC 2 CC4.1, CC4.2, CC1.2, CC2.1.
