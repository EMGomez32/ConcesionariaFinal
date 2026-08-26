import { z } from 'zod';

// Schemas de validación de concesionarias (los TENANTS). Payloads verificados
// contra los DTOs reales del front:
//   - ConcesionariaForm.tsx  -> POST / y PATCH /:id (super_admin)
//   - ConfiguracionPage.tsx  -> PATCH /me (autogestión del admin del tenant)
// Ambos forms mandan SIEMPRE los cinco campos como string, y los opcionales
// pueden llegar en '' cuando el usuario los deja vacíos o los limpia.
//
// La lista explícita CORTA el mass-assignment: los use-cases pasan el body crudo
// a Prisma (`repository.create(data)` / `repository.update(id, data)` -> Prisma
// `create({ data })` / `update({ data })`), así que sin esto se podían inyectar
// columnas arbitrarias (id, deletedAt, createdAt, o incluso relaciones). Zod
// descarta todo lo no declarado.

// Campos de texto libre opcionales. A PROPÓSITO se aceptan como string SIN
// enforcement de formato y SIN transformar '' -> undefined:
//   - El front manda '' para "limpiar" un campo. En update ese '' se persiste
//     (o el controller de /me lo convierte a null). Si lo transformáramos a
//     undefined, el strip lo borraría y el campo NUNCA se podría limpiar
//     (cambio de conducta respecto de hoy).
//   - No se usa .email() en `email`: el input ya valida formato con type="email"
//     en el front, y el '' de limpieza haría fallar un .email() estricto ->
//     rechazaría un request válido (viola la regla de oro nº1).
const textoOpcional = z.string().optional();

// Color de marca: hex `#RRGGBB` o '' (para limpiarlo). Se valida el formato
// porque el valor termina embebido crudo en el PDF (pdfkit `fillColor`): un
// string arbitrario lo haría explotar en runtime. El '' de limpieza se acepta
// y el controller de /me lo convierte a null.
const colorOpcional = z.string()
    .regex(/^(#[0-9a-fA-F]{6})?$/, 'El color debe ser un hex tipo #10b981')
    .optional();

// Pie de página del PDF y sitio web: texto libre con tope de largo para que no
// desborde el documento. '' se acepta (limpieza).
const pieOpcional = z.string().max(500, 'El pie no puede superar 500 caracteres').optional();
const sitioOpcional = z.string().max(200, 'El sitio web es demasiado largo').optional();

// Cupo de usuarios del tenant (sólo lo setea el super_admin). Se acepta:
//   - un entero >= 1 (el tope),
//   - '' o null → null (sin límite, para "limpiarlo"),
//   - ausente → undefined (Prisma no toca la columna en un PATCH).
// OJO: sólo llega a persistirse por POST / y PATCH /:id (super_admin). En
// PATCH /me (admin) el controller usa su propia whitelist CAMPOS que NO lo
// incluye, así que un admin no puede subirse su propio límite aunque lo mande.
const limiteUsuariosOpcional = z.preprocess(
    (v) => (v === '' ? null : v),
    z.coerce.number().int().min(1, 'El límite debe ser al menos 1').nullable().optional(),
);

// ── Datos fiscales (facturación electrónica AFIP) ────────────────────────────
// El '' de "limpieza" del form se acepta y se convierte a null (mismo criterio
// que el resto de opcionales). `condicionIva` del EMISOR determina qué factura
// emite (RI → A/B; monotributo/exento → C). `puntoVenta` es obligatorio para
// facturar, pero opcional acá (se valida al emitir, no al guardar el perfil).
// El EMISOR no puede ser 'consumidor_final' (un CF no factura). Enum acotado a
// los tres que sí emiten — distinto del enum del receptor (cliente.schema), que
// sí incluye consumidor_final.
const condicionIvaOpcional = z.preprocess(
    (v) => (v === '' ? null : v),
    z.enum(['responsable_inscripto', 'monotributo', 'exento']).nullable().optional(),
);
const puntoVentaOpcional = z.preprocess(
    (v) => (v === '' ? null : v),
    z.coerce.number().int().min(1, 'El punto de venta debe ser al menos 1').max(99999, 'Punto de venta inválido').nullable().optional(),
);

export const createConcesionariaSchema = z.object({
    nombre: z.string({ error: 'El nombre es obligatorio' }).min(1, 'El nombre es obligatorio'),
    cuit: textoOpcional,
    email: textoOpcional,
    telefono: textoOpcional,
    direccion: textoOpcional,
    limiteUsuarios: limiteUsuariosOpcional,
});

// PATCH parcial. Reutilizado por PATCH /:id (super_admin) y PATCH /me
// (autogestión admin): mismos campos, todos opcionales. `nombre`, si viene, no
// puede quedar vacío (columna NOT NULL en DB; además ambos forms garantizan que
// se manda non-empty, así que este .min(1) nunca rechaza un request real).
// ── Parámetros del módulo del vendedor (atención presencial) ────────────────
// `diasRetencionCliente`: cuánto tiempo un cliente le "pertenece" al vendedor que
// lo atendió primero. El dueño decidió que lo define cada concesionaria; el
// sugerido es 30. El tope de 365 no es capricho: una retención de años equivale a
// "para siempre" y hace inútil el pozo común.
// `tasacionSoloTasador`: en algunas concesionarias el vendedor estima la permuta,
// en otras sólo el tasador. Booleano, default false (el vendedor puede estimar).
const diasRetencionOpcional = z.preprocess(
    (v) => (v === '' || v === null ? undefined : v),
    z.coerce.number().int().min(1, 'La retención debe ser de al menos 1 día').max(365, 'La retención no puede superar los 365 días').optional(),
);
const tasacionSoloTasadorOpcional = z.preprocess(
    // El form manda 'true'/'false' como string; z.coerce.boolean() convierte
    // CUALQUIER string no vacío en true, así que 'false' entraría como true.
    (v) => (v === 'true' ? true : v === 'false' ? false : v === '' || v === null ? undefined : v),
    z.boolean().optional(),
);

export const updateConcesionariaSchema = z.object({
    nombre: z.string().min(1, 'El nombre no puede quedar vacío').optional(),
    cuit: textoOpcional,
    email: textoOpcional,
    telefono: textoOpcional,
    direccion: textoOpcional,
    // Marca de los documentos (PDF). El logo NO se setea acá: va por el endpoint
    // multipart /me/logo. Estos son los campos editables por formulario.
    colorPrimario: colorOpcional,
    colorSecundario: colorOpcional,
    pdfPie: pieOpcional,
    sitioWeb: sitioOpcional,
    limiteUsuarios: limiteUsuariosOpcional,
    // Datos fiscales del emisor (AFIP).
    razonSocial: textoOpcional,
    condicionIva: condicionIvaOpcional,
    puntoVenta: puntoVentaOpcional,
    // Módulo del vendedor.
    diasRetencionCliente: diasRetencionOpcional,
    tasacionSoloTasador: tasacionSoloTasadorOpcional,
});
