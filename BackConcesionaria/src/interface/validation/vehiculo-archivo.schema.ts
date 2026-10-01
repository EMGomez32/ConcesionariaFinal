import { z } from 'zod';

// Schema del alta JSON legacy de POST /vehiculo-archivos (link externo ya
// conocido). Whitelist estricta: Zod descarta lo no declarado, así que el cliente
// NO puede fijar storageKey (la clave que después usa DELETE para hacer unlink en
// disco), mimeType, sizeBytes, uploadedById ni esPrincipal. El upload multipart
// arma esos campos en el servidor.

// Sólo enlaces http(s) absolutos: `javascript:`, `data:` o rutas relativas no son
// un "link externo" válido y se renderizan como href en el front.
const urlExterna = z
    .string({ error: 'url es obligatoria' })
    .trim()
    .max(2048, 'url demasiado larga')
    .refine((v) => {
        try {
            const u = new URL(v);
            return u.protocol === 'http:' || u.protocol === 'https:';
        } catch {
            return false;
        }
    }, 'url debe ser un enlace http(s) válido');

export const createVehiculoArchivoSchema = z.object({
    vehiculoId: z.coerce
        .number({ error: 'vehiculoId es obligatorio' })
        .int('vehiculoId inválido')
        .positive('vehiculoId inválido'),
    url: urlExterna,
    tipo: z.string().trim().max(50).nullish(),
    descripcion: z.string().trim().max(500).nullish(),
});
