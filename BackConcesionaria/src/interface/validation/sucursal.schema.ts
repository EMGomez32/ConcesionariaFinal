import { z } from 'zod';

// Schemas de validación del recurso sucursal. Reemplazan a
// modules/sucursales/sucursal.validation.ts (express-validator). Payload verificado
// contra el DTO real del front (sucursales.api.ts -> CreateSucursalDto /
// UpdateSucursalDto de types/sucursal.types.ts) y el form (components/forms/
// SucursalForm.tsx), más lo que persiste el repo (PrismaSucursalRepository.pickEditable
// = nombre, direccion, ciudad, email, telefono, activo).
//
// El form manda SIEMPRE los seis campos (buildSucursalFormData los inicializa todos)
// y además concesionariaId. El validador viejo sólo listaba nombre/direccion/telefono,
// pero como express-validator no descarta claves, ciudad/email/activo pasaban igual y
// el repo los persiste. Hay que declararlos o el strip de Zod los borraría => regresión.
//
// concesionariaId: CLAVE. SucursalController.create resuelve el tenant como
// `isSuper ? req.body.concesionariaId : actor.concesionariaId` DESPUÉS de que
// validate.middleware ya reemplazó req.body por el objeto parseado. Si el schema
// strippeara concesionariaId, un super_admin perdería la concesionaria elegida y
// CreateSucursal tiraría 'Elegí la concesionaria para la sucursal'. Por eso se declara
// (opcional). Para un admin el controller ignora el body y usa su propio tenant, así
// que el valor que llegue es inofensivo (mismo reparto que usuario.schema.ts).

const optionalFk = z.preprocess(
    (v) => (v === 0 || v === '' || v === null ? undefined : v),
    z.coerce.number().int().positive().optional(),
);

// String opcional: se deja pasar '' TAL CUAL. El repo (pickEditable) traduce '' -> null
// al persistir, así que enviar '' es la forma de "limpiar" un campo en el update:
// mapearlo a undefined rompería ese borrado. Por eso NADA de preprocess acá.
const optionalStr = z.string().optional();

export const createSucursalSchema = z.object({
    nombre: z.string({ error: 'El nombre es obligatorio' }).min(1, 'El nombre es obligatorio'),
    direccion: optionalStr,
    ciudad: optionalStr,
    // Sin .email(): el validador viejo NO validaba formato (no había isEmail), y el
    // form deja mandar ''. Agregar .email() sería MÁS estricto y rechazaría lo que hoy pasa.
    email: optionalStr,
    telefono: optionalStr,
    // El form manda un boolean real (toggle). No se coacciona (z.coerce.boolean trata
    // 'false' como true). Mismo criterio que usuario.schema.ts.
    activo: z.boolean().optional(),
    // Ver cabecera: debe sobrevivir al strip para el flujo super_admin del controller.
    concesionariaId: optionalFk,
});

// Update parcial. Mismos campos, todos opcionales (nombre exige no-vacío SI viene, como
// el `.optional().notEmpty()` original). concesionariaId se declara por paridad con el
// controller (SucursalController.update lo lee y lo borra para no-super); nótese que el
// repo.update NO lo persiste igual (pickEditable no lo incluye), así que su presencia es
// inocua: está sólo para no cambiar lo que el controller ve.
export const updateSucursalSchema = z.object({
    nombre: z.string().min(1, 'El nombre no puede estar vacío').optional(),
    direccion: optionalStr,
    ciudad: optionalStr,
    email: optionalStr,
    telefono: optionalStr,
    activo: z.boolean().optional(),
    concesionariaId: optionalFk,
});
