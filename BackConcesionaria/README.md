# BackConcesionaria

Proyecto Node.js con Prisma ORM

## Instalación

```bash
npm install
```

## Configuración

1. Configura tu base de datos en `prisma.config.ts` o `.env`
2. Define tus modelos en `prisma/schema.prisma`
3. Ejecuta las migraciones:

```bash
npx prisma migrate dev --name init
```

## Generar Cliente Prisma

```bash
npx prisma generate
```

## Ejecutar

```bash
npm run dev
```

## Comandos útiles de Prisma

- `npx prisma studio` - Abre una interfaz visual para ver y editar datos
- `npx prisma migrate dev` - Crea una nueva migración y aplica cambios
- `npx prisma db push` - Sincroniza el schema sin crear migraciones
- `npx prisma db pull` - Obtiene el schema desde una base de datos existente
