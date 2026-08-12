# BackConcesionaria/Dockerfile
FROM node:22-alpine

WORKDIR /app

# Instalar dependencias necesarias para Prisma y node-pg
RUN apk add --no-cache openssl

COPY package*.json ./
COPY prisma ./prisma/

RUN npm install

# Copiar el resto del código
COPY . .

# Generar el cliente de Prisma
RUN npx prisma generate

# Compilar TypeScript
RUN npm run build

# Correr como usuario NO-root (defensa en profundidad — hallazgo Semgrep ToB
# `missing-user` / CWE-250: un proceso comprometido corriendo como root en el
# contenedor facilita escalar/escapar). La imagen node:alpine ya trae el user
# `node` (uid 1000). Le damos la propiedad de /app y del dir de uploads (volumen
# montado) para que el runtime pueda escribir ahí sin privilegios de root.
RUN mkdir -p /app/uploads && chown -R node:node /app
USER node

EXPOSE 3000

CMD ["npm", "start"]
