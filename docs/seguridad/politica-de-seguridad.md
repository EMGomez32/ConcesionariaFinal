# Política de seguridad de la información

Versión 1.0 · Responsable: Dirección · Revisión: anual.

## Objetivo

Fijar el compromiso de AUTENZA con la seguridad de la información y la
privacidad, los principios que guían las decisiones y objetivos que se puedan medir.

## Alcance

Todo lo definido en [alcance y contexto](alcance-y-contexto.md): personas,
software, infraestructura, cuentas y proveedores de AUTENZA.

## Compromiso de la Dirección (ISO 5.1)

La Dirección:

1. protege la **confidencialidad** de los datos de cada concesionaria y de sus
   clientes, la **integridad** de sus operaciones de plata y la
   **disponibilidad** del servicio en horario comercial;
2. cumple la Ley 25.326 y los demás requisitos legales y contractuales que
   aplican, y actúa como encargado del tratamiento con las concesionarias;
3. asigna tiempo y presupuesto para operar este SGSI y mejorarlo;
4. no vende ni promete controles, certificaciones, métricas ni plazos que no
   existan;
5. revisa este sistema por lo menos cada seis meses.

## Principios

- **Tenant primero.** Ningún dato cruza de una concesionaria a otra. El
  aislamiento se defiende en la aplicación y en la base.
- **Mínimo privilegio.** Cada persona, rol, proceso y token tiene solo el acceso
  que necesita.
- **Defensa en profundidad.** Ningún control único protege un dato sensible.
- **Seguro por defecto.** Ante una configuración faltante, el sistema falla
  cerrado (por ejemplo, el arranque sin secretos obligatorios aborta).
- **Todo cambio es trazable.** Por PR, con CI, con tag y con registro de deploy.
- **Datos mínimos.** Se recolecta y conserva solo lo necesario para la finalidad.
- **Honestidad.** Los modos de demostración se rotulan como tales.
- **La IA es una herramienta,** no un aprobador ni un operador sin supervisión.

## Reglas generales

1. Las políticas de esta carpeta son obligatorias para toda persona con acceso
   a sistemas de AUTENZA, incluidos colaboradores y proveedores con acceso.
2. Una excepción a una política se pide por escrito, con motivo, alcance y
   vencimiento (máximo 6 meses), y la aprueba la Dirección como riesgo aceptado
   ([gestión de riesgos](gestion-de-riesgos.md)).
3. El incumplimiento deliberado tiene consecuencias definidas en el contrato o
   acuerdo de cada persona ([personas](personas.md)).
4. Cualquier persona que detecte un evento de seguridad lo reporta enseguida
   ([gestión de incidentes](gestion-de-incidentes.md)).

## Objetivos medibles (ISO 6.2)

Se miden en cada revisión por la dirección.

| # | Objetivo | Meta | Fuente de la medición |
|---|---|---|---|
| O1 | Cambios a `main` por PR con checks obligatorios en verde | 100 % | Historial de GitHub |
| O2 | Cambios de emergencia con PR retroactivo en menos de 24 h | 100 % | Log de deploys y PR con etiqueta `break-glass` |
| O3 | Vulnerabilidades críticas y altas cerradas dentro del plazo | 100 % (o con aceptación vigente) | Alertas de Dependabot y CodeQL, registro de riesgos |
| O4 | Revisiones trimestrales de accesos hechas | 4 por año | Checklists firmadas |
| O5 | Simulacros de restore exitosos | 1 por mes como mínimo | `scripts/restore-drill.log` |
| O6 | Antigüedad del último backup completo | Menos de 26 h (RPO actual de 24 h) | Healthcheck de `db-backup` |
| O7 | 2FA activo en cuentas `admin` y `super_admin` de la app y en las cuentas SaaS críticas | 100 % | Revisión trimestral de accesos |
| O8 | Incidentes registrados dentro de las 24 h de detectados y con post-mortem los SEV1 y SEV2 | 100 % | Registro de incidentes |
| O9 | Disponibilidad mensual medida por el monitor externo | > Pendiente de decisión del dueño: objetivo interno (propuesta: 99 % en horario comercial). No es un SLA. | `.github/workflows/uptime.yml` |
| O10 | Pedidos de titulares asistidos dentro del plazo legal | 100 % | Registro de solicitudes |

Si un objetivo no se cumple, se registra una no conformidad con su acción
correctiva ([auditoría interna](auditoria-interna-y-revision-por-la-direccion.md)).

## Responsable

La Dirección aprueba esta política. El Responsable de seguridad la mantiene y
mide los objetivos ([roles](roles-y-responsabilidades.md)).

## Evidencia que se guarda

Acta de aprobación con la versión (commit) aprobada; mediciones de cada
objetivo por período.

## Frecuencia de revisión

Anual, y cuando cambie el alcance, la ley o el modelo de negocio.

## Controles que cubre

ISO 27001:2022 5.1, 5.2, 6.2, A.5.1, A.5.4, A.5.36 · ISO 27701 6.2 · SOC 2 CC1.1, CC1.2, CC2.1, CC5.3.
