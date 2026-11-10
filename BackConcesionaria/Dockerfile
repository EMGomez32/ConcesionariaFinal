# BackConcesionaria/Dockerfile
#
# Build MULTI-ETAPA (hallazgo APP-20 de la auditoría). Antes era una sola etapa con
# `npm ci` completo: el contenedor que atiende internet traía jest, ts-jest, ts-node,
# typescript y todo src/. Eso es superficie de ataque gratis (un RCE encontraba un
# compilador y un ejecutor de TypeScript a mano), más megas en la Pi y más paquetes
# para auditar. Ahora la imagen final lleva SÓLO lo que se ejecuta:
#
#   base     node:alpine fijada por digest + openssl (de acá parten todas las etapas)
#   build    devDependencies, `prisma generate`, compila src/ -> dist/ y los scripts
#            de operación (prisma/*.ts, scripts/*.ts) -> dist-ops/ (tsconfig.ops.json)
#   deps     sólo las dependencias de producción (`npm ci --omit=dev`)
#   runtime  la imagen que corre: node_modules de `deps` + cliente de Prisma generado +
#            dist/ + dist-ops/ + schema y migraciones. Sin código fuente TypeScript.
#
# Los comandos que se corren a mano dentro del contenedor usan el JS compilado:
#   npm run retencion [-- --apply]                  (también lo corre el cron del host)
#   node dist-ops/scripts/reset-2fa.js <email>
#   node dist-ops/scripts/set-password.js           (USER_EMAIL / USER_PASSWORD por env)
#   node dist-ops/scripts/migrar-documentos-vehiculos.js [--aplicar]
#   node dist-ops/scripts/auditar-uploads.js [directorio]
#   npm run seed-demo / npm run seed
# `npx ts-node ...` ya NO sirve acá: no hay ts-node, y npx sin TTY lo bajaría del
# registro de npm en vez de fallar. Nunca usarlo dentro del contenedor.

# Imagen base fijada por digest (índice multi-arquitectura: arm64 en la Pi, amd64 en CI):
# builds reproducibles y sin cambios silenciosos de la base. Dependabot (ecosistema docker)
# propone el digest nuevo cada semana. El digest está en UN solo lugar: las otras etapas
# arrancan `FROM base`, así que build, deps y runtime usan exactamente la misma imagen.
FROM node:22-alpine@sha256:fe4f6d74e20370acb04ad889077d14d0f64a9c8ea6a42bc60cddf1e844699914 AS base

WORKDIR /app

# Instalar dependencias necesarias para Prisma y node-pg
RUN apk add --no-cache openssl

# ---------------------------------------------------------------------------------------
FROM base AS build

# Sólo los manifiestos antes del install: mientras package*.json no cambie, esta capa
# sale de la caché aunque cambie el código (antes se copiaba también prisma/, y cada
# migración nueva reinstalaba todo; @prisma/client 7 no tiene postinstall que lo use).
COPY package*.json ./

# `npm ci`: build reproducible que respeta el lockfile (falla si no coincide con package.json).
RUN npm ci

# Copiar el resto del código
COPY . .

# Generar el cliente de Prisma (prisma-client-js lo escribe en node_modules/.prisma)
RUN npx prisma generate

# Compilar TypeScript: src/ -> dist/ y los scripts de operación -> dist-ops/
RUN npm run build

# ---------------------------------------------------------------------------------------
FROM base AS deps

COPY package*.json ./

# Sólo dependencias de producción. El CLI de `prisma` está en `dependencies` (no en
# devDependencies) A PROPÓSITO: el arranque corre `prisma migrate deploy` dentro de este
# contenedor, y los runbooks usan `prisma migrate resolve` y Prisma Studio (perfil debug)
# con esta misma imagen. Separarlo en otra imagen/servicio de migración sería más liviano,
# pero cambia el arranque y los runbooks; por ahora pesa menos que lo que se saca.
# El postinstall de @prisma/engines baja acá el motor de migraciones para la arquitectura
# de la imagen.
#
# typescript entra IGUAL con --omit=dev: es peerDependency opcional de @prisma/client y de
# prisma, y npm marca esos paquetes `devOptional`, que --omit=dev no saca. En runtime no
# se usa (el CLI de Prisma carga prisma.config.ts con jiti, no con tsc), así que se borra
# a mano. El centinela de la etapa final verifica que no quede.
RUN npm ci --omit=dev \
    && rm -rf node_modules/typescript node_modules/.bin/tsc node_modules/.bin/tsserver

# ---------------------------------------------------------------------------------------
FROM base AS runtime

# Todo lo que se copia queda de root y el proceso corre como `node`: el código y las
# dependencias son de SÓLO LECTURA para la app (un proceso comprometido no puede
# reescribir dist/ ni node_modules). Además evita el `chown -R` sobre node_modules, que
# duplicaba en una capa nueva cientos de MB.
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/package.json /app/package-lock.json /app/prisma.config.ts ./
COPY --from=build /app/prisma/schema.prisma ./prisma/schema.prisma
COPY --from=build /app/prisma/migrations ./prisma/migrations
COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-ops ./dist-ops

# Centinela: si un cambio futuro vuelve a meter el toolchain de desarrollo en la imagen
# final (p. ej. ts-node pasado a dependencies), el build falla ACÁ y no llega a la Pi.
RUN for p in typescript ts-node ts-node-dev jest ts-jest; do \
        if [ -e "node_modules/$p" ]; then echo "APP-20: node_modules/$p no va en la imagen de producción" >&2; exit 1; fi; \
    done; \
    for b in tsc tsserver ts-node ts-node-dev jest ts-jest; do \
        if [ -e "node_modules/.bin/$b" ]; then echo "APP-20: node_modules/.bin/$b no va en la imagen de producción" >&2; exit 1; fi; \
    done

# Correr como usuario NO-root (defensa en profundidad — hallazgo Semgrep ToB
# `missing-user` / CWE-250: un proceso comprometido corriendo como root en el
# contenedor facilita escalar/escapar). La imagen node:alpine ya trae el user
# `node` (uid 1000). Le damos la propiedad SÓLO de los directorios donde el runtime
# escribe: uploads y wa-auth (volúmenes montados) y logs (el logger escribe archivos
# ahí sólo fuera de producción; en producción va todo a stdout).
# Los directorios de los volúmenes se crean ACÁ y con dueño node: si un volumen
# nombrado se monta sobre un path que no existe en la imagen, Docker lo crea
# root:root y el proceso (que corre como node) no puede escribir. Ya pasó con
# uploads y con wa-auth (las credenciales de WhatsApp).
RUN mkdir -p /app/uploads /app/wa-auth /app/logs \
    && chown node:node /app/uploads /app/wa-auth /app/logs
USER node

EXPOSE 3000

CMD ["npm", "start"]
