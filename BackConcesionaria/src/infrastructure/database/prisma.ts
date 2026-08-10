import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { extendedPrisma } from './prisma.extension';
import { env } from '../../config/env';

// Runtime de la app: usa el rol NO superusuario (APP_DATABASE_URL) para que la
// RLS de Postgres filtre de verdad. Si no está seteada, cae a DATABASE_URL
// (superusuario) — el aislamiento entonces lo da SÓLO la extensión en la capa app.
// Este cliente (extendido y raw) es el ÚNICO que debe usar la conexión de runtime;
// db push / init-rls / setup-app-role usan DATABASE_URL (admin) por su cuenta.
const connectionString = env.APP_DATABASE_URL || env.DATABASE_URL;
const pool = new Pool({ connectionString: connectionString.replace('prisma+postgres://', 'postgres://') });
const adapter = new PrismaPg(pool);
const prismaClient = new PrismaClient({ adapter, log: [{ emit: 'event', level: 'query' }, { emit: 'stdout', level: 'error' }, { emit: 'stdout', level: 'info' }, { emit: 'stdout', level: 'warn' }] });

const prisma = extendedPrisma(prismaClient);

export default prisma;
export { prismaClient as rawPrisma };
