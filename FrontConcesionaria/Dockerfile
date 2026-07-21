# FrontConcesionaria/Dockerfile
# Etapa de construcción
FROM node:22-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm install --legacy-peer-deps

COPY . .
RUN npm run build

# Etapa de producción
FROM nginx:alpine

# Quitar el server block default de nginx para que use solo el nuestro.
RUN rm /etc/nginx/conf.d/default.conf

# Configuración custom con security headers + SPA fallback.
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copiar los archivos construidos de Vite
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
