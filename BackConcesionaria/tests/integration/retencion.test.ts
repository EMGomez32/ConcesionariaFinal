import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { api, loginAsAdmin, authHeaders, unique } from './helpers';
import {
    planificarRetencion,
    aplicarRetencion,
    PLAZOS_POR_DEFECTO,
    CATEGORIAS,
} from '../../src/application/services/privacidad/retencion';

/**
 * Script de retención (PRIV-02) contra la base real: la simulación no toca nada, y
 * aplicar anonimiza el lead vencido, borra los adjuntos de la solicitud rechazada vieja y
 * purga el rastro y los tokens vencidos — y NO toca lo que no venció ni a un cliente con
 * una venta.
 *
 * Necesita DATABASE_URL (la conexión de migraciones, la misma que usa el script): los
 * datos se crean por la API y después se ENVEJECEN con SQL, que es la única forma de
 * tener un lead de hace tres años en una base de test. Todo va acotado a la concesionaria
 * del admin de prueba (`--concesionaria`), salvo los tokens, que son de plataforma.
 */

const DB_URL = process.env.DATABASE_URL;
const describirConBase = DB_URL ? describe : describe.skip;

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 0)]);
const telefonoUnico = () => `261${String(Date.now()).slice(-6)}${Math.floor(Math.random() * 10)}`;

describirConBase('Script de retención (PRIV-02)', () => {
    let pool: Pool;
    let poolPrisma: Pool;
    let db: PrismaClient;
    let adminToken: string;
    let tenantId: number;
    let adminId: number;
    let leadViejo: number;
    let leadNuevo: number;
    let solicitudVieja: number;
    let archivoViejo: number;
    let auditViejo: number;
    const ahora = new Date();
    const borrados: string[] = [];
    const borrarArchivo = async (k: string) => { borrados.push(k); };

    beforeAll(async () => {
        const conn = DB_URL!.replace('prisma+postgres://', 'postgres://');
        pool = new Pool({ connectionString: conn, max: 2 });
        poolPrisma = new Pool({ connectionString: conn, max: 1 });
        db = new PrismaClient({ adapter: new PrismaPg(poolPrisma) } as any);

        const ad = await loginAsAdmin();
        adminToken = ad.token;
        tenantId = ad.user.concesionariaId!;
        adminId = ad.user.id;

        const crear = async () => {
            const r = await api.post('/api/clientes', { nombre: unique('Lead'), telefono: telefonoUnico(), email: `${unique('l')}@prueba.test` }, authHeaders(adminToken));
            expect(r.status).toBe(201);
            return r.data.id as number;
        };
        leadViejo = await crear();
        leadNuevo = await crear();

        // Solicitud rechazada con un DNI adjunto.
        const fin = await api.post('/api/financieras', { nombre: unique('Banco Ret'), tipo: 'banco' }, authHeaders(adminToken));
        const sol = await api.post('/api/financiacion-solicitudes', { clienteId: leadNuevo, financieraId: fin.data.id }, authHeaders(adminToken));
        expect(sol.status).toBe(201);
        solicitudVieja = sol.data.id;
        const fd = new FormData();
        fd.append('file', new Blob([new Uint8Array(PNG)], { type: 'image/png' }), 'dni.png');
        const up = await api.post(`/api/financiacion-solicitudes/${solicitudVieja}/archivos/upload`, fd, {
            headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'multipart/form-data' },
        });
        expect(up.status).toBe(201);
        archivoViejo = up.data.id;

        // Envejecer: el lead hace 30 meses, la solicitud rechazada hace 8.
        await pool.query(
            `UPDATE clientes SET created_at = now() - interval '30 months', updated_at = now() - interval '30 months', ultima_interaccion_en = NULL WHERE id = $1`,
            [leadViejo],
        );
        await pool.query(
            `UPDATE solicitudes_financiacion SET estado = 'rechazada', fecha_respuesta = now() - interval '8 months', updated_at = now() - interval '8 months' WHERE id = $1`,
            [solicitudVieja],
        );
        // Una fila de auditoría de hace 3 años y un refresh token vencido.
        const a = await pool.query(
            `INSERT INTO audit_log (concesionaria_id, entidad, accion, detalle, created_at) VALUES ($1, 'Prueba', 'update', 'fila vieja de prueba', now() - interval '36 months') RETURNING id`,
            [tenantId],
        );
        auditViejo = a.rows[0].id;
        await pool.query(
            `INSERT INTO refresh_tokens (token, usuario_id, expires_at, is_revoked, created_at) VALUES ($1, $2, now() - interval '1 day', false, now() - interval '8 days')`,
            [unique('rt-vencido'), adminId],
        );
    });

    afterAll(async () => {
        await db?.$disconnect();
        await poolPrisma?.end();
        await pool?.end();
    });

    const opts = () => ({ plazos: PLAZOS_POR_DEFECTO, ahora, concesionariaId: tenantId, categorias: [...CATEGORIAS] });

    test('la simulación encuentra lo vencido y no modifica nada', async () => {
        const plan = await planificarRetencion(db, opts());
        const leads = plan.leads.map((l) => l.id);
        expect(leads).toContain(leadViejo);
        expect(leads).not.toContain(leadNuevo);
        expect(plan.adjuntos.map((a) => a.id)).toContain(archivoViejo);
        expect(plan.auditLog).toBeGreaterThanOrEqual(1);
        // Acotado a un tenant: lo de plataforma no se planifica.
        expect(plan.securityEvents).toBe(0);
        expect(plan.refreshTokens).toBe(0);

        const c = await pool.query('SELECT nombre, suprimido_en FROM clientes WHERE id = $1', [leadViejo]);
        expect(c.rows[0].suprimido_en).toBeNull();
        const arch = await pool.query('SELECT id FROM solicitud_financiacion_archivos WHERE id = $1', [archivoViejo]);
        expect(arch.rowCount).toBe(1);
    });

    test('un cliente con una venta no es un lead, aunque esté inactivo hace años', async () => {
        const conVenta = await pool.query(
            `SELECT c.id FROM clientes c WHERE c.concesionaria_id = $1 AND EXISTS (SELECT 1 FROM ventas v WHERE v.cliente_id = c.id) LIMIT 1`,
            [tenantId],
        );
        if (conVenta.rowCount === 0) return; // sin ventas en la base de prueba no hay qué comprobar
        const id = conVenta.rows[0].id;
        await pool.query(`UPDATE clientes SET created_at = now() - interval '30 months', updated_at = now() - interval '30 months', ultima_interaccion_en = NULL WHERE id = $1`, [id]);
        const plan = await planificarRetencion(db, opts());
        expect(plan.leads.map((l) => l.id)).not.toContain(id);
    });

    test('aplicar anonimiza el lead vencido, borra el adjunto viejo y el rastro vencido, y deja constancia', async () => {
        const plan = await planificarRetencion(db, opts());
        const r = await aplicarRetencion(db, plan, { ...opts(), borrarArchivo });
        expect(r.errores).toEqual([]);
        expect(r.leadsAnonimizados).toBeGreaterThanOrEqual(1);
        expect(r.adjuntosBorrados).toBeGreaterThanOrEqual(1);
        expect(r.auditLogBorrados).toBeGreaterThanOrEqual(1);
        expect(borrados.length).toBeGreaterThanOrEqual(1);

        const c = await pool.query('SELECT nombre, telefono, email, suprimido_en, deleted_at FROM clientes WHERE id = $1', [leadViejo]);
        expect(c.rows[0]).toMatchObject({ nombre: 'Titular suprimido', telefono: null, email: null });
        expect(c.rows[0].suprimido_en).not.toBeNull();
        expect(c.rows[0].deleted_at).not.toBeNull();

        const nuevo = await pool.query('SELECT nombre, suprimido_en FROM clientes WHERE id = $1', [leadNuevo]);
        expect(nuevo.rows[0].suprimido_en).toBeNull();

        expect((await pool.query('SELECT id FROM solicitud_financiacion_archivos WHERE id = $1', [archivoViejo])).rowCount).toBe(0);
        expect((await pool.query('SELECT id FROM audit_log WHERE id = $1', [auditViejo])).rowCount).toBe(0);

        // Rastro: la supresión en el audit del tenant y el resumen en security_events.
        const aud = await pool.query(`SELECT id FROM audit_log WHERE concesionaria_id = $1 AND entidad = 'Cliente' AND entidad_id = $2 AND accion = 'suprimir'`, [tenantId, leadViejo]);
        expect(aud.rowCount).toBe(1);
        const sec = await pool.query(`SELECT detalle FROM security_events WHERE accion = 'retencion' ORDER BY id DESC LIMIT 1`);
        expect(sec.rows[0].detalle).toMatch(/Script de retención aplicado/);

        // Idempotente: una segunda pasada no encuentra lo mismo.
        const otra = await planificarRetencion(db, opts());
        expect(otra.leads.map((l) => l.id)).not.toContain(leadViejo);
    });

    test('tokens de plataforma: sin --concesionaria se borran los refresh tokens vencidos', async () => {
        const plan = await planificarRetencion(db, { plazos: PLAZOS_POR_DEFECTO, ahora, concesionariaId: null, categorias: ['tokens'] });
        expect(plan.refreshTokens).toBeGreaterThanOrEqual(1);
        expect(plan.leads).toEqual([]);
        expect(plan.auditLog).toBe(0);
        const r = await aplicarRetencion(db, plan, { plazos: PLAZOS_POR_DEFECTO, ahora, concesionariaId: null, borrarArchivo });
        expect(r.refreshTokensBorrados).toBeGreaterThanOrEqual(1);
        const quedan = await pool.query('SELECT count(*)::int AS n FROM refresh_tokens WHERE expires_at < now()');
        expect(quedan.rows[0].n).toBe(0);
    });
});
