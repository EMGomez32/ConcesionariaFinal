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

EXPOSE 3000

CMD ["npm", "start"]
