# FrontConcesionaria — Web de AUTENZA

SPA en React 19 + Vite + TypeScript (react-router, TanStack Query, zustand,
react-hook-form, driver.js para los tours). CSS propio con tokens, sin Tailwind.
Cómo levantar el monorepo completo: [README de la raíz](../README.md).

## Comandos

| Comando | Qué hace |
|---|---|
| `npm ci --legacy-peer-deps` | Instala dependencias respetando el lockfile. |
| `npm run dev` | Servidor de desarrollo en `http://localhost:5173`. |
| `npm run build` | `tsc -b` + `vite build` (es lo que corre el CI). |
| `npx vitest --run` | Tests (Vitest + Testing Library, entorno jsdom). |
| `npm run lint` | ESLint. |

## Variables

- `.env.development`: `VITE_API_BASE_URL` del backend local.
- `.env.production`: `VITE_API_BASE_URL=/api` (nginx sirve la API en el mismo origen).

Todo lo que empieza con `VITE_` queda **público** dentro del bundle. Nunca pongas
un secreto ahí.

## Estructura

```
src/
  api/          clientes HTTP por recurso (axios)
  store/        estado de sesión (el access token vive en memoria; el refresh va en cookie httpOnly)
  pages/        una carpeta por módulo (ventas, financiaciones, atenciones, conversaciones, ...)
  components/   UI compartida (Input, Select, tablas, modales)
  onboarding/   tours guiados por rol
  test/         setup de Vitest
nginx.conf      cabeceras de seguridad (CSP, HSTS, etc.) y proxy de /api y /uploads al backend
```

## Reglas de UI

- La identidad visual y los tokens están en [DESIGN.md](../DESIGN.md) y en `marca-autenza/`.
- Los tours se anclan con atributos `data-tour`. No los borres ni los renombres sin
  actualizar `src/onboarding/`.
- El menú y los guards de rol son comodidad: el permiso real lo decide el backend.
- `src/pages/capacitacion/contenido.ts` describe permisos por rol en una página
  pública. Si cambiás un permiso, actualizalo y verificalo contra los `authorize`
  del backend.
- No uses `dangerouslySetInnerHTML` ni `innerHTML`.

## Producción

La imagen (`Dockerfile`) compila el bundle y lo sirve con nginx sin root
(`nginx-unprivileged`). `nginx.conf` define la CSP y las demás cabeceras; si
agregás un origen externo, la CSP lo va a bloquear hasta que lo sumes ahí, y
eso es un cambio de riesgo alto ([gestión de cambios](../docs/seguridad/gestion-de-cambios.md)).
