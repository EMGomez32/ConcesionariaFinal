/**
 * init-rls.ts
 *
 * Idempotent migration that:
 *   1. Backfills `concesionaria_id` on sub-resource tables that were
 *      denormalized as part of enabling Postgres Row Level Security.
 *   2. Enables RLS + FORCE RLS on every tenant-scoped table.
 *   3. (Re)creates the `tenant_iso` policy that allows access only when:
 *        - the row's concesionaria_id matches `current_setting('app.tenant_id')`
 *        - OR the request flagged `current_setting('app.is_super_admin') = 'true'`
 *
 * Runs every time the backend starts. All statements use IF EXISTS / IF NOT
 * EXISTS guards or DROP POLICY IF EXISTS so re-runs are no-ops.
 *
 * Important: this script connects with the same role as the app (postgres
 * superuser by default). FORCE ROW LEVEL SECURITY ensures even superusers
 * are subject to policies, so the app must always set the session vars
 * before running queries — that's done by the Prisma client extension.
 *
 * To bypass during seed/migration runs, set `app.is_super_admin = 'true'`
 * at the start of the script (the seed does this).
 */
import 'dotenv/config';
import { Pool } from 'pg';

const connectionString = (process.env.DATABASE_URL || '').replace('prisma+postgres://', 'postgres://');

// Tables that store tenant-scoped data and must enforce isolation.
const TENANT_TABLES = [
    'sucursales',
    'usuarios',
    'clientes',
    'proveedores',
    'vehiculos',
    'vehiculo_archivos',
    'ingresos_vehiculo',
    'vehiculo_movimientos',
    'reservas',
    'categorias_gasto_vehiculo',
    'gastos_vehiculo',
    'categorias_gasto_fijo',
    'gastos_fijos',
    'presupuestos',
    'presupuesto_items',
    'presupuesto_extras',
    'presupuesto_canje',
    'ventas',
    'venta_extras',
    'venta_pagos',
    'venta_canje_vehiculo',
    'financiaciones',
    'cuotas',
    'pagos_cuota',
    'financieras',
    'solicitudes_financiacion',
    'solicitud_financiacion_archivos',
    'postventa_casos',
    'postventa_items',
    'tipos_postventa',
    'audit_log',
    'concesionaria_subscriptions',
    'invoices',
    'payments',
];

// Sub-resources that need concesionaria_id backfilled from a parent table.
// Each entry also feeds the BEFORE INSERT trigger created below so app code
// doesn't need to set concesionaria_id explicitly on inserts — the parent FK
// is enough.
type BackfillEntry = {
    /** child table */
    table: string;
    /** column in `table` that points at the parent */
    fk: string;
    /** parent table that holds concesionaria_id */
    parentTable: string;
    /** column in parentTable to join on */
    parentKey: string;
    /** custom backfill SQL (covers chained FKs like pagos_cuota → cuotas → financiaciones) */
    backfillSql: string;
};

const BACKFILL_PLAN: BackfillEntry[] = [
    { table: 'vehiculo_archivos', fk: 'vehiculo_id', parentTable: 'vehiculos', parentKey: 'id',
      backfillSql: `UPDATE vehiculo_archivos c SET concesionaria_id = p.concesionaria_id FROM vehiculos p WHERE c.vehiculo_id = p.id AND c.concesionaria_id IS NULL;` },
    { table: 'presupuesto_items', fk: 'presupuesto_id', parentTable: 'presupuestos', parentKey: 'id',
      backfillSql: `UPDATE presupuesto_items c SET concesionaria_id = p.concesionaria_id FROM presupuestos p WHERE c.presupuesto_id = p.id AND c.concesionaria_id IS NULL;` },
    { table: 'presupuesto_extras', fk: 'presupuesto_id', parentTable: 'presupuestos', parentKey: 'id',
      backfillSql: `UPDATE presupuesto_extras c SET concesionaria_id = p.concesionaria_id FROM presupuestos p WHERE c.presupuesto_id = p.id AND c.concesionaria_id IS NULL;` },
    { table: 'presupuesto_canje', fk: 'presupuesto_id', parentTable: 'presupuestos', parentKey: 'id',
      backfillSql: `UPDATE presupuesto_canje c SET concesionaria_id = p.concesionaria_id FROM presupuestos p WHERE c.presupuesto_id = p.id AND c.concesionaria_id IS NULL;` },
    { table: 'venta_extras', fk: 'venta_id', parentTable: 'ventas', parentKey: 'id',
      backfillSql: `UPDATE venta_extras c SET concesionaria_id = p.concesionaria_id FROM ventas p WHERE c.venta_id = p.id AND c.concesionaria_id IS NULL;` },
    { table: 'venta_pagos', fk: 'venta_id', parentTable: 'ventas', parentKey: 'id',
      backfillSql: `UPDATE venta_pagos c SET concesionaria_id = p.concesionaria_id FROM ventas p WHERE c.venta_id = p.id AND c.concesionaria_id IS NULL;` },
    { table: 'venta_canje_vehiculo', fk: 'venta_id', parentTable: 'ventas', parentKey: 'id',
      backfillSql: `UPDATE venta_canje_vehiculo c SET concesionaria_id = p.concesionaria_id FROM ventas p WHERE c.venta_id = p.id AND c.concesionaria_id IS NULL;` },
    { table: 'cuotas', fk: 'financiacion_id', parentTable: 'financiaciones', parentKey: 'id',
      backfillSql: `UPDATE cuotas c SET concesionaria_id = p.concesionaria_id FROM financiaciones p WHERE c.financiacion_id = p.id AND c.concesionaria_id IS NULL;` },
    // pagos_cuota: parent is cuotas (which now also has concesionaria_id after backfill).
    { table: 'pagos_cuota', fk: 'cuota_id', parentTable: 'cuotas', parentKey: 'id',
      backfillSql: `UPDATE pagos_cuota c SET concesionaria_id = q.concesionaria_id FROM cuotas q WHERE c.cuota_id = q.id AND c.concesionaria_id IS NULL;` },
    { table: 'solicitud_financiacion_archivos', fk: 'solicitud_id', parentTable: 'solicitudes_financiacion', parentKey: 'id',
      backfillSql: `UPDATE solicitud_financiacion_archivos c SET concesionaria_id = p.concesionaria_id FROM solicitudes_financiacion p WHERE c.solicitud_id = p.id AND c.concesionaria_id IS NULL;` },
    { table: 'postventa_items', fk: 'caso_id', parentTable: 'postventa_casos', parentKey: 'id',
      backfillSql: `UPDATE postventa_items c SET concesionaria_id = p.concesionaria_id FROM postventa_casos p WHERE c.caso_id = p.id AND c.concesionaria_id IS NULL;` },
    { table: 'invoices', fk: 'subscription_id', parentTable: 'concesionaria_subscriptions', parentKey: 'id',
      backfillSql: `UPDATE invoices c SET concesionaria_id = s.concesionaria_id FROM concesionaria_subscriptions s WHERE c.subscription_id = s.id AND c.concesionaria_id IS NULL;` },
    { table: 'payments', fk: 'invoice_id', parentTable: 'invoices', parentKey: 'id',
      backfillSql: `UPDATE payments c SET concesionaria_id = i.concesionaria_id FROM invoices i WHERE c.invoice_id = i.id AND c.concesionaria_id IS NULL;` },
];

async function tableExists(client: any, table: string): Promise<boolean> {
    const res = await client.query(
        `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1`,
        [table]
    );
    return res.rowCount > 0;
}

async function columnExists(client: any, table: string, column: string): Promise<boolean> {
    const res = await client.query(
        `SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2`,
        [table, column]
    );
    return res.rowCount > 0;
}

async function main() {
    const pool = new Pool({ connectionString });
    const client = await pool.connect();
    try {
        console.log('[init-rls] starting…');

        // Backfill phase: only for tables that already exist in the DB.
        for (const { table, backfillSql } of BACKFILL_PLAN) {
            if (!(await tableExists(client, table))) {
                console.log(`[init-rls] skip backfill for ${table} (table does not exist yet)`);
                continue;
            }
            if (!(await columnExists(client, table, 'concesionaria_id'))) {
                console.log(`[init-rls] skip backfill for ${table} (column not yet present — db push hasn't run)`);
                continue;
            }
            const r = await client.query(backfillSql);
            if (r.rowCount && r.rowCount > 0) {
                console.log(`[init-rls] backfilled ${r.rowCount} row(s) on ${table}`);
            }
        }

        // BEFORE INSERT triggers that derive concesionaria_id from the parent
        // when the app didn't set it (case: super_admin creating sub-resources).
        // These run BEFORE the RLS policy check, so the row passes WITH CHECK.
        for (const { table, fk, parentTable, parentKey } of BACKFILL_PLAN) {
            if (!(await tableExists(client, table))) continue;
            if (!(await tableExists(client, parentTable))) continue;
            if (!(await columnExists(client, table, 'concesionaria_id'))) continue;

            const fnName = `derive_concesionaria_${table}`;
            const trgName = `trg_${table}_derive_concesionaria`;

            await client.query(`
                CREATE OR REPLACE FUNCTION ${fnName}() RETURNS TRIGGER AS $$
                BEGIN
                    IF NEW.concesionaria_id IS NULL THEN
                        SELECT concesionaria_id INTO NEW.concesionaria_id
                        FROM ${parentTable}
                        WHERE ${parentKey} = NEW.${fk};
                    END IF;
                    RETURN NEW;
                END;
                $$ LANGUAGE plpgsql;
            `);
            await client.query(`DROP TRIGGER IF EXISTS ${trgName} ON ${table};`);
            await client.query(`
                CREATE TRIGGER ${trgName}
                BEFORE INSERT ON ${table}
                FOR EACH ROW EXECUTE FUNCTION ${fnName}();
            `);
        }

        // RLS enablement + policies.
        for (const table of TENANT_TABLES) {
            if (!(await tableExists(client, table))) continue;
            if (!(await columnExists(client, table, 'concesionaria_id'))) {
                console.log(`[init-rls] skip RLS for ${table} (no concesionaria_id column yet)`);
                continue;
            }

            await client.query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;`);
            await client.query(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY;`);
            await client.query(`DROP POLICY IF EXISTS tenant_iso ON ${table};`);
            await client.query(
                `CREATE POLICY tenant_iso ON ${table}
                 USING (
                     current_setting('app.is_super_admin', true) = 'true'
                     OR concesionaria_id = NULLIF(current_setting('app.tenant_id', true), '')::int
                 )
                 WITH CHECK (
                     current_setting('app.is_super_admin', true) = 'true'
                     OR concesionaria_id = NULLIF(current_setting('app.tenant_id', true), '')::int
                 );`
            );
        }

        console.log('[init-rls] done.');
    } finally {
        client.release();
        await pool.end();
    }
}

main().catch((e) => {
    console.error('[init-rls] failed:', e);
    process.exit(1);
});
