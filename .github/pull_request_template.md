## Qué cambia y por qué

<!-- Una o dos frases. Enlazá el issue, el hallazgo o el incidente si hay. -->

## Cómo se probó

<!-- Tests nuevos o modificados, suites que corriste, prueba manual (en qué entorno y con qué rol). Nunca con datos de producción. -->

- [ ] Tests nuevos o actualizados que fallan sin este cambio
- [ ] Integración local o en CI (y bajo `app_rw` si toca datos de un tenant)
- [ ] Prueba manual: <!-- qué flujo, con qué rol -->

## ¿Toca algo sensible?

Si marcás alguno, el cambio es de **riesgo alto**: completá la checklist de
`docs/seguridad/desarrollo-seguro.md` y la segunda lectura.

- [ ] **Autenticación o sesión** (login, 2FA, tokens, cookies, contraseñas)
- [ ] **Autorización o tenant** (`authorize`, roles, extensión de Prisma, RLS, `rawPrisma` / `$queryRaw`, workers sin request)
- [ ] **Plata** (ventas, pagos, señas, financiaciones, cuotas, anulaciones, facturación)
- [ ] **Datos personales** (campos nuevos, exportaciones, logs, retención, adjuntos)
- [ ] **Un tercero** (integración nueva o cambiada, dependencia nueva, salida a internet)
- [ ] **Infraestructura o CI** (compose, Dockerfile, nginx, scripts, workflows, variables de entorno)
- [ ] Nada de lo anterior

## Migración y operación

- [ ] Sin cambios de schema
- [ ] Migración nueva generada con `prisma migrate dev` y commiteada (¿es aditiva?)
- [ ] Tabla nueva con datos de un tenant agregada a `TENANT_TABLES` (`prisma/init-rls.ts`)
- [ ] Variable de entorno nueva en `docker-compose.yml` **y** `.env.example`
- [ ] Volumen nuevo con su directorio creado en el `Dockerfile`
- [ ] Pasos manuales de deploy (describilos abajo)

## Documentación

- [ ] No hace falta
- [ ] Actualicé README, runbooks o `docs/`
- [ ] Cambia permisos por rol: actualicé `FrontConcesionaria/src/pages/capacitacion/contenido.ts`
- [ ] Trata datos personales nuevos: actualicé `docs/privacidad/registro-de-actividades-de-tratamiento.md`

## Riesgo y plan de rollback

- **Riesgo:** bajo / medio / alto — <!-- por qué -->
- **Rollback:** <!-- volver al tag anterior; ¿la migración lo permite? ¿hay que restaurar algo? -->

## Revisión

- [ ] Leí el diff completo antes de pedir el merge
- [ ] Riesgo alto: segunda lectura hecha al menos 12 h después de la última modificación (anotá el resultado en un comentario)
- [ ] Si se usó un asistente de IA: verifiqué lo que afirma, y su revisión cuenta como detección, no como aprobación
- [ ] Cambio de emergencia (*break-glass*): etiqueta `break-glass`, enlace al incidente, comandos ejecutados y salida del smoke
