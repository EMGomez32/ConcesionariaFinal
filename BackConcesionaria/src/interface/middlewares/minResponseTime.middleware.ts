import { RequestHandler } from 'express';

/**
 * Garantiza un tiempo MÍNIMO de respuesta JSON. Se usa en endpoints que responden
 * lo mismo exista o no el recurso (forgot-password): si el camino "existe" hace
 * trabajo (consultas, inserts) y el "no existe" vuelve al toque, la diferencia de
 * tiempo delata qué emails están registrados aunque el cuerpo sea idéntico.
 * Con un piso por encima del costo normal del camino lento, ambos tardan igual.
 */
export const minResponseTime = (ms: number): RequestHandler => (_req, res, next) => {
    const inicio = Date.now();
    const json = res.json.bind(res);
    res.json = (body?: unknown) => {
        const resto = ms - (Date.now() - inicio);
        if (resto > 0) {
            setTimeout(() => json(body), resto);
            return res;
        }
        return json(body);
    };
    next();
};
