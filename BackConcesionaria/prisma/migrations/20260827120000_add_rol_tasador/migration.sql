-- Rol nuevo: `tasador` (puesto acotado que sólo valúa usados). Se agrega al enum
-- RolNombre. IF NOT EXISTS por idempotencia (mismo patrón que las migraciones de
-- AccionAudit). El rol se materializa como fila en `roles` en el seed/boot, no acá.
ALTER TYPE "RolNombre" ADD VALUE IF NOT EXISTS 'tasador';
