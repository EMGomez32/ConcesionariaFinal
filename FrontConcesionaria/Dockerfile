# FrontConcesionaria/Dockerfile
# Etapa de construcción
# Imagen base fijada por digest (índice multi-arquitectura: arm64 en la Pi, amd64 en CI):
# builds reproducibles y sin cambios silenciosos de la base. Dependabot (ecosistema docker)
# propone el digest nuevo cada semana.
FROM node:22-alpine@sha256:fe4f6d74e20370acb04ad889077d14d0f64a9c8ea6a42bc60cddf1e844699914 AS build

WORKDIR /app

COPY package*.json ./
# `npm ci` (no `install`): respeta el package-lock al pie de la letra y falla si no coincide con
# package.json — build reproducible, sin que una dependencia cambie sola en un rebuild.
RUN npm ci --legacy-peer-deps

COPY . .
RUN npm run build

# Etapa de producción
# nginx-unprivileged: corre como usuario NO root (uid 101) y escucha en 8080 (un proceso sin root
# no puede bindear puertos <1024). Con la imagen nginx:alpine el master corría como root: un bug de
# nginx se convertía en root dentro del contenedor.
FROM nginxinc/nginx-unprivileged:alpine@sha256:b5047b9b76845eac124358373c6852377c52e4b05834a47647e955dd91cb8f1e

# Configuración custom con security headers + SPA fallback. Reemplaza al server block default
# (mismo path): COPY corre como root aunque la imagen termine en USER 101.
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copiar los archivos construidos de Vite
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
