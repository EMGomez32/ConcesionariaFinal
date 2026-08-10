/**
 * setup-app-role.ts
 *
 * Crea/actualiza el rol de aplicación `app_rw` (NO superusuario, NOBYPASSRLS) y le
 * da los privilegios mínimos, para que la app pueda correr con un rol al que la
 * Row Level Security SÍ se le aplica (un superusuario la saltea siempre). Idempotente.
 *
 * Corre en el arranque DESPUÉS de `prisma db push` (para granting sobre las tablas
 * recién creadas) y `init-rls`, con la conexión ADMIN (DATABASE_URL, superusuario).
 * El runtime de la app usa APP_DATABASE_URL (app_rw), no esta conexión.
 *
 * Se OMITE si no hay APP_DB_PASSWORD: así el arranque no rompe mientras no se hizo
 * el cutover (la app sigue conectando con DATABASE_URL). Para activar el rol:
 *   - poner APP_DB_PASSWORD y APP_DATABASE_URL (postgresql://app_rw:<pwd>@db:5432/<db>)
 *     en el .env y redeployar.
 * Para revertir: quitar APP_DATABASE_URL (la app vuelve al superusuario).
 */
import 'dotenv/config';
import { Pool } from 'pg';

const connectionString = (process.env.DATABASE_URL || '').replace('prisma+postgres://', 'postgres://');
const APP_ROLE = 'app_rw';

async function main() {
    const pwd = process.env.APP_DB_PASSWORD?.trim() || undefined;
    const appUrl = process.env.APP_DATABASE_URL?.trim() || undefined;

    // Las dos variables del cutover van JUNTAS o ninguna:
    //  - ninguna → se omite (la app sigue con DATABASE_URL, backward-compat).
    //  - sólo una → misconfiguración: se ABORTA el arranque con mensaje claro, en
    //    vez de crear un rol que nadie usa (pwd sin url) o dejar que el runtime
    //    intente conectar como app_rw inexistente (url sin pwd → endpoints en 500).
    if (!pwd && !appUrl) {
        console.log('[setup-app-role] APP_DB_PASSWORD/APP_DATABASE_URL no seteadas — se omite (la app sigue con el rol de DATABASE_URL).');
        return;
    }
    if (!pwd || !appUrl) {
        console.error(
            `[setup-app-role] Config inconsistente: APP_DATABASE_URL y APP_DB_PASSWORD deben setearse JUNTAS (o ninguna). Falta ${!pwd ? 'APP_DB_PASSWORD' : 'APP_DATABASE_URL'}. Corregí el .env.`,
        );
        process.exit(1);
    }

    const pool = new Pool({ connectionString });
    const client = await pool.connect();
    try {
        console.log('[setup-app-role] starting…');

        // La password se pasa por una GUC parametrizada (seguro contra inyección) y
        // el DO block la interpola en el DDL con format('%L') (quoting correcto).
        // CREATE/ALTER ROLE no aceptan parámetros bind, de ahí este rodeo.
        await client.query(`SELECT set_config('app.new_role_pwd', $1, false)`, [pwd]);
        await client.query(`
            DO $$
            DECLARE pwd text := current_setting('app.new_role_pwd');
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${APP_ROLE}') THEN
                    EXECUTE format('CREATE ROLE ${APP_ROLE} LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE INHERIT PASSWORD %L', pwd);
                    RAISE NOTICE 'rol ${APP_ROLE} creado';
                ELSE
                    -- Reafirma TODAS las negaciones (no sólo super/bypassrls) para
                    -- que el rol converja al set mínimo aunque haya driftado.
                    EXECUTE format('ALTER ROLE ${APP_ROLE} WITH LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE PASSWORD %L', pwd);
                    RAISE NOTICE 'rol ${APP_ROLE} actualizado';
                END IF;
            END $$;
        `);
        // Limpiar la GUC para no dejar la password en la sesión.
        await client.query(`SELECT set_config('app.new_role_pwd', '', false)`);

        // Privilegios mínimos sobre el schema actual.
        await client.query(`GRANT USAGE ON SCHEMA public TO ${APP_ROLE}`);
        await client.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${APP_ROLE}`);
        await client.query(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${APP_ROLE}`);

        // Privilegios por defecto para objetos FUTUROS creados por el rol admin
        // actual (el que corre db push): así una tabla nueva queda accesible sin
        // re-correr esto. (Igual se re-corre cada arranque, cubriendo lo existente.)
        await client.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${APP_ROLE}`);
        await client.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO ${APP_ROLE}`);

        // Sanity: el rol NO debe ser superusuario ni BYPASSRLS (si no, la RLS no
        // filtraría) ni tener CREATEDB/CREATEROLE (privilegios de más).
        const check = await client.query(
            `SELECT rolsuper, rolbypassrls, rolcreatedb, rolcreaterole FROM pg_roles WHERE rolname = $1`,
            [APP_ROLE],
        );
        const row = check.rows[0];
        if (!row || row.rolsuper || row.rolbypassrls || row.rolcreatedb || row.rolcreaterole) {
            throw new Error(
                `[setup-app-role] ${APP_ROLE} quedó con privilegios de más ` +
                `(super=${row?.rolsuper} bypassrls=${row?.rolbypassrls} createdb=${row?.rolcreatedb} createrole=${row?.rolcreaterole})`,
            );
        }

        console.log(`[setup-app-role] done. ${APP_ROLE} listo (NOSUPERUSER, NOBYPASSRLS, grants aplicados).`);
    } finally {
        client.release();
        await pool.end();
    }
}

main().catch((e) => {
    console.error('[setup-app-role] failed:', e);
    process.exit(1);
});
