import { api, login, loginAsAdmin, loginAsSuperAdmin, authHeaders, unique, tryDelete } from './helpers';

/**
 * Derechos del titular de los datos (Ley 25.326 arts. 14-16; PRIV-05) por HTTP:
 * informe de acceso, supresión total y parcial, revocación del consentimiento, bloqueo,
 * registro de pedidos con su vencimiento legal y el rastro de exportaciones y accesos
 * de soporte (PRIV-10 / PRIV-13).
 *
 * Cada caso fabrica sus propios datos (teléfono y nombres únicos): la suite se puede
 * correr dos veces seguidas sobre la misma base.
 */

const PASSWORD = 'secret12345';
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 0)]);

const telefonoUnico = () => `261${String(Date.now()).slice(-6)}${Math.floor(Math.random() * 10)}`;
const hoyIso = () => new Date().toISOString().slice(0, 10);

describe('Derechos del titular (privacidad)', () => {
    let adminToken: string;
    let adminConcesionariaId: number;
    let saToken: string;
    let vendedorToken: string;
    let vendedorId: number;
    let lecturaToken: string;
    let lecturaId: number;
    let tenantBId: number;
    let clienteBId: number;
    const aLimpiar: string[] = [];

    const nuevoCliente = async (extra: Record<string, unknown> = {}) => {
        const res = await api.post('/api/clientes', {
            nombre: unique('Titular'),
            dni: String(20_000_000 + Math.floor(Math.random() * 9_999_999)),
            telefono: telefonoUnico(),
            email: `${unique('titular')}@prueba.test`,
            direccion: 'San Martín 123',
            observaciones: 'Consultó por un usado; trabaja en la municipalidad',
            ...extra,
        }, authHeaders(adminToken));
        expect(res.status).toBe(201);
        return res.data as { id: number; telefono: string; dni: string; nombre: string };
    };

    beforeAll(async () => {
        const ad = await loginAsAdmin();
        adminToken = ad.token;
        adminConcesionariaId = ad.user.concesionariaId!;
        saToken = (await loginAsSuperAdmin()).token;

        const roles = await api.get('/api/roles', authHeaders(adminToken));
        const idDeRol = (n: string) => (roles.data as Array<{ id: number; nombre: string }>).find((r) => r.nombre === n)!.id;
        for (const rol of ['vendedor', 'lectura'] as const) {
            const email = `${unique(`priv-${rol}`)}@demo.com`;
            const u = await api.post('/api/usuarios', { nombre: unique(rol), email, password: PASSWORD, roleIds: [idDeRol(rol)] }, authHeaders(adminToken));
            expect(u.status).toBe(201);
            const s = await login(email, PASSWORD);
            if (rol === 'vendedor') { vendedorToken = s.token; vendedorId = u.data.id; }
            else { lecturaToken = s.token; lecturaId = u.data.id; }
        }

        const t = await api.post('/api/concesionarias', { nombre: unique('TenantPriv'), cuit: `20-${Date.now()}-9` }, authHeaders(saToken));
        expect(t.status).toBe(201);
        tenantBId = t.data.id;
        const cb = await api.post('/api/clientes', { nombre: unique('Cliente B'), telefono: telefonoUnico(), concesionariaId: tenantBId }, authHeaders(saToken));
        expect(cb.status).toBe(201);
        clienteBId = cb.data.id;
    });

    afterAll(async () => {
        for (const ruta of aLimpiar.reverse()) await tryDelete(ruta, saToken);
        await tryDelete(`/api/clientes/${clienteBId}`, saToken);
        await tryDelete(`/api/concesionarias/${tenantBId}`, saToken);
        if (vendedorId) await tryDelete(`/api/usuarios/${vendedorId}`, adminToken);
        if (lecturaId) await tryDelete(`/api/usuarios/${lecturaId}`, adminToken);
    });

    // ─────────────────────────────────────────────────────────────────────────
    describe('informe de acceso (art. 14)', () => {
        let cliente: { id: number; dni: string };

        beforeAll(async () => {
            cliente = await nuevoCliente();
            const seg = await api.post('/api/cliente-seguimientos', {
                clienteId: cliente.id, tipo: 'llamada', fecha: hoyIso(), nota: 'Le interesa financiar en 12 cuotas',
            }, authHeaders(adminToken));
            expect(seg.status).toBe(201);
        });

        test('el admin descarga el JSON con la ficha y todo lo vinculado', async () => {
            const res = await api.get(`/api/privacidad/clientes/${cliente.id}/informe`, authHeaders(adminToken));
            expect(res.status).toBe(200);
            expect(res.headers['content-disposition']).toMatch(/attachment; filename="datos-titular-\d+-/);
            expect(res.headers['cache-control']).toBe('no-store');
            expect(res.data.titular.documento).toBe(cliente.dni);
            expect(res.data.responsable.id).toBe(adminConcesionariaId);
            expect(res.data.seguimientos).toHaveLength(1);
            expect(res.data.seguimientos[0].nota).toBe('Le interesa financiar en 12 cuotas');
            for (const seccion of ['atenciones', 'tasaciones', 'presupuestos', 'reservas', 'ventas', 'financiaciones',
                'solicitudesFinanciacion', 'postventa', 'conversaciones', 'preguntasMercadoLibre', 'pedidosDeDerechos']) {
                expect(Array.isArray(res.data[seccion])).toBe(true);
            }
            expect(res.data.titular.consentimientoContacto).toMatchObject({ otorgado: false, revocadoEn: null });
        });

        test('la descarga queda en la auditoría (acción export)', async () => {
            const res = await api.get('/api/auditoria?accion=export&entidad=Cliente&limit=50', authHeaders(adminToken));
            expect(res.status).toBe(200);
            const fila = res.data.results.find((r: any) => r.entidadId === cliente.id);
            expect(fila).toBeDefined();
            expect(fila.detalle).toMatch(/derecho de acceso/);
        });

        test('vendedor y lectura reciben 403', async () => {
            expect((await api.get(`/api/privacidad/clientes/${cliente.id}/informe`, authHeaders(vendedorToken))).status).toBe(403);
            expect((await api.get(`/api/privacidad/clientes/${cliente.id}/informe`, authHeaders(lecturaToken))).status).toBe(403);
        });

        test('el admin de otro tenant no lo ve (404) y el super_admin lo saca con el responsable correcto', async () => {
            expect((await api.get(`/api/privacidad/clientes/${clienteBId}/informe`, authHeaders(adminToken))).status).toBe(404);
            const sa = await api.get(`/api/privacidad/clientes/${clienteBId}/informe`, authHeaders(saToken));
            expect(sa.status).toBe(200);
            expect(sa.data.responsable.id).toBe(tenantBId);
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    describe('supresión (art. 16)', () => {
        let financieraId: number;

        beforeAll(async () => {
            const f = await api.post('/api/financieras', { nombre: unique('Banco Priv'), tipo: 'banco' }, authHeaders(adminToken));
            expect(f.status).toBe(201);
            financieraId = f.data.id;
        });

        test('total: sin operaciones, se anonimiza todo y se borran los adjuntos', async () => {
            const c = await nuevoCliente();
            await api.post('/api/cliente-seguimientos', { clienteId: c.id, tipo: 'whatsapp', fecha: hoyIso(), nota: 'Me pasó su sueldo' }, authHeaders(adminToken));
            const sol = await api.post('/api/financiacion-solicitudes', { clienteId: c.id, financieraId, montoSolicitado: 1000000 }, authHeaders(adminToken));
            expect(sol.status).toBe(201);
            const fd = new FormData();
            fd.append('file', new Blob([new Uint8Array(PNG)], { type: 'image/png' }), 'dni.png');
            fd.append('tipo', 'dni');
            const up = await api.post(`/api/financiacion-solicitudes/${sol.data.id}/archivos/upload`, fd, {
                headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'multipart/form-data' },
            });
            expect(up.status).toBe(201);

            // Sin la confirmación fuerte, no.
            const sinConfirmar = await api.post(`/api/privacidad/clientes/${c.id}/suprimir`, { motivo: 'Pedido por mail' }, authHeaders(adminToken));
            expect(sinConfirmar.status).toBe(400);
            // Ni el vendedor.
            const vend = await api.post(`/api/privacidad/clientes/${c.id}/suprimir`, { motivo: 'Pedido por mail', confirmacion: 'SUPRIMIR' }, authHeaders(vendedorToken));
            expect(vend.status).toBe(403);

            const res = await api.post(`/api/privacidad/clientes/${c.id}/suprimir`, { motivo: 'Pedido por mail del titular', confirmacion: 'SUPRIMIR' }, authHeaders(adminToken));
            expect(res.status).toBe(200);
            expect(res.data.modo).toBe('total');
            expect(res.data.suprimido.seguimientos).toBe(1);
            expect(res.data.adjuntosBorrados).toBe(1);
            expect(res.data.explicacion).toMatch(/todos los datos/);

            // La ficha salió de los listados...
            expect((await api.get(`/api/clientes/${c.id}`, authHeaders(adminToken))).status).toBe(404);
            // ...y lo que queda guardado está anonimizado (el informe la sigue leyendo).
            const inf = await api.get(`/api/privacidad/clientes/${c.id}/informe`, authHeaders(adminToken));
            expect(inf.status).toBe(200);
            expect(inf.data.titular).toMatchObject({ nombre: 'Titular suprimido', documento: null, telefono: null, email: null, direccion: null, observaciones: null });
            expect(inf.data.titular.suprimidoEn).toBeTruthy();
            expect(inf.data.seguimientos[0].nota).not.toContain('sueldo');
            expect(inf.data.solicitudesFinanciacion[0].archivos).toHaveLength(0);
            const arch = await api.get(`/api/financiacion-solicitudes/${sol.data.id}/archivos`, authHeaders(adminToken));
            expect(arch.data).toEqual([]);

            // Irreversible y una sola vez.
            const otra = await api.post(`/api/privacidad/clientes/${c.id}/suprimir`, { motivo: 'Pedido por mail del titular', confirmacion: 'SUPRIMIR' }, authHeaders(adminToken));
            expect(otra.status).toBe(409);
            expect(otra.data.error).toBe('TITULAR_SUPRIMIDO');

            const aud = await api.get('/api/auditoria?accion=suprimir&entidad=Cliente&limit=50', authHeaders(adminToken));
            expect(aud.data.results.some((r: any) => r.entidadId === c.id && /Supresión total/.test(r.detalle))).toBe(true);
        });

        test('parcial: con una venta se conservan los datos que exige la ley y la ficha queda bloqueada', async () => {
            const c = await nuevoCliente();
            const veh = await api.post('/api/vehiculos', {
                marca: unique('MPriv'), modelo: 'V', anio: 2020, concesionariaId: adminConcesionariaId, sucursalId: 1,
                fechaIngreso: '2026-04-25T00:00:00Z', tipo: 'USADO', precioCompra: 5000, precioLista: 6000, estado: 'publicado', origen: 'compra',
            }, authHeaders(saToken));
            expect(veh.status).toBe(201);
            const venta = await api.post('/api/ventas', {
                sucursalId: 1, clienteId: c.id, vendedorId: 2, vehiculoId: veh.data.id, precioVenta: 6000, moneda: 'ARS',
                formaPago: 'contado', fechaVenta: '2026-04-25T00:00:00Z',
            }, authHeaders(saToken));
            expect(venta.status).toBe(201);
            aLimpiar.push(`/api/vehiculos/${veh.data.id}`, `/api/ventas/${venta.data.id}`);

            const res = await api.post(`/api/privacidad/clientes/${c.id}/suprimir`, { motivo: 'Pedido presencial del titular', confirmacion: 'SUPRIMIR' }, authHeaders(adminToken));
            expect(res.status).toBe(200);
            expect(res.data.modo).toBe('parcial');
            expect(res.data.obligaciones.ventas).toBe(1);
            expect(res.data.explicacion).toMatch(/PARCIAL/);
            expect(res.data.conservado.join(' ')).toMatch(/documento/);

            const ficha = await api.get(`/api/clientes/${c.id}`, authHeaders(adminToken));
            expect(ficha.status).toBe(200);
            expect(ficha.data.nombre).toBe(c.nombre);
            expect(ficha.data.dni).toBe(c.dni);
            expect(ficha.data.telefono).toBeNull();
            expect(ficha.data.email).toBeNull();
            expect(ficha.data.observaciones).toBeNull();
            expect(ficha.data.bloqueadoEn).toBeTruthy();
            expect(ficha.data.suprimidoEn).toBeTruthy();

            // La venta no se tocó.
            const v = await api.get(`/api/ventas/${venta.data.id}`, authHeaders(adminToken));
            expect(v.status).toBe(200);
            expect(Number(v.data.precioVenta)).toBe(6000);

            // Una ficha suprimida no se desbloquea.
            const des = await api.post(`/api/privacidad/clientes/${c.id}/desbloquear`, { motivo: 'Lo pidió el titular' }, authHeaders(adminToken));
            expect(des.status).toBe(409);
        });

        test('dar de baja una solicitud de financiación borra sus adjuntos (PRIV-02)', async () => {
            const c = await nuevoCliente();
            const sol = await api.post('/api/financiacion-solicitudes', { clienteId: c.id, financieraId }, authHeaders(adminToken));
            expect(sol.status).toBe(201);
            const fd = new FormData();
            fd.append('file', new Blob([new Uint8Array(PNG)], { type: 'image/png' }), 'recibo.png');
            const up = await api.post(`/api/financiacion-solicitudes/${sol.data.id}/archivos/upload`, fd, {
                headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'multipart/form-data' },
            });
            expect(up.status).toBe(201);
            expect((await api.get(`/api/financiacion-solicitudes/${sol.data.id}/archivos`, authHeaders(adminToken))).data).toHaveLength(1);

            expect((await api.delete(`/api/financiacion-solicitudes/${sol.data.id}`, authHeaders(adminToken))).status).toBe(204);
            // Antes el adjunto seguía saliendo (firmado) de una solicitud dada de baja.
            expect((await api.get(`/api/financiacion-solicitudes/${sol.data.id}/archivos`, authHeaders(adminToken))).data).toEqual([]);
            const aud = await api.get('/api/auditoria?accion=delete&entidad=SolicitudFinanciacionArchivo&limit=20', authHeaders(adminToken));
            expect(aud.data.results.some((r: any) => r.detalle.includes(`solicitud ${sol.data.id}`))).toBe(true);
        });

        test('un admin no suprime clientes de otro tenant (404)', async () => {
            const res = await api.post(`/api/privacidad/clientes/${clienteBId}/suprimir`, { motivo: 'Intento cruzado', confirmacion: 'SUPRIMIR' }, authHeaders(adminToken));
            expect(res.status).toBe(404);
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    describe('consentimiento, bloqueo y agenda', () => {
        test('evidencia: completar datos en la atención guarda la versión del texto informado', async () => {
            const c = await nuevoCliente({ email: undefined, direccion: undefined });
            const at = await api.post('/api/atenciones', { nombre: c.nombre, telefono: c.telefono }, authHeaders(adminToken));
            expect([200, 201]).toContain(at.status);
            const atencionId = at.data.atencion?.id ?? at.data.id;
            const r = await api.patch(`/api/atenciones/${atencionId}/cliente`, {
                email: `${unique('ok')}@prueba.test`, direccion: 'Belgrano 1', consentimientoContacto: true, consentimientoVersion: 'contacto-v1',
            }, authHeaders(adminToken));
            expect(r.status).toBe(200);
            const ficha = await api.get(`/api/clientes/${c.id}`, authHeaders(adminToken));
            expect(ficha.data.consentimientoContacto).toBe(true);
            expect(ficha.data.consentimientoVersion).toBe('contacto-v1');
            expect(ficha.data.consentimientoEn).toBeTruthy();

            const mala = await api.patch(`/api/atenciones/${atencionId}/cliente`, { consentimientoVersion: 'inventada' }, authHeaders(adminToken));
            expect(mala.status).toBe(400);
            await api.patch(`/api/atenciones/${atencionId}/cierre`, { resultado: 'sin_unidad' }, authHeaders(adminToken));
        });

        test('revocar el consentimiento lo saca de la agenda de seguimientos', async () => {
            const c = await nuevoCliente();
            const seg = await api.post('/api/cliente-seguimientos', {
                clienteId: c.id, tipo: 'llamada', fecha: hoyIso(), nota: 'Llamar', proximoContacto: hoyIso(),
            }, authHeaders(adminToken));
            expect(seg.status).toBe(201);
            const enAgenda = async () => {
                const r = await api.get('/api/reportes/proximos-seguimientos?dias=7', authHeaders(adminToken));
                expect(r.status).toBe(200);
                return r.data.items.some((i: any) => i.clienteId === c.id);
            };
            expect(await enAgenda()).toBe(true);

            // lectura no puede; el vendedor sí (el cliente no tiene dueño: está en su vista).
            expect((await api.post(`/api/privacidad/clientes/${c.id}/revocar-consentimiento`, {}, authHeaders(lecturaToken))).status).toBe(403);
            const rev = await api.post(`/api/privacidad/clientes/${c.id}/revocar-consentimiento`, { motivo: 'Pidió que no lo llamen' }, authHeaders(vendedorToken));
            expect(rev.status).toBe(200);
            expect(rev.data.consentimientoContacto).toBe(false);
            expect(rev.data.consentimientoRevocadoEn).toBeTruthy();
            expect(await enAgenda()).toBe(false);

            const aud = await api.get('/api/auditoria?accion=revocar_consentimiento&limit=50', authHeaders(adminToken));
            expect(aud.data.results.some((r: any) => r.entidadId === c.id)).toBe(true);
        });

        test('bloquear: sólo admin y con motivo; el bloqueado no recibe datos en la atención', async () => {
            const c = await nuevoCliente({ email: undefined, direccion: undefined });
            expect((await api.post(`/api/privacidad/clientes/${c.id}/bloquear`, { motivo: 'Pidió el bloqueo' }, authHeaders(vendedorToken))).status).toBe(403);
            expect((await api.post(`/api/privacidad/clientes/${c.id}/bloquear`, {}, authHeaders(adminToken))).status).toBe(400);
            const b = await api.post(`/api/privacidad/clientes/${c.id}/bloquear`, { motivo: 'Pidió el bloqueo por carta' }, authHeaders(adminToken));
            expect(b.status).toBe(200);
            expect(b.data.bloqueadoEn).toBeTruthy();

            const at = await api.post('/api/atenciones', { nombre: c.nombre, telefono: c.telefono }, authHeaders(adminToken));
            expect([200, 201]).toContain(at.status);
            const atencionId = at.data.atencion?.id ?? at.data.id;
            const r = await api.patch(`/api/atenciones/${atencionId}/cliente`, {
                email: `${unique('x')}@prueba.test`, consentimientoContacto: true,
            }, authHeaders(adminToken));
            expect(r.status).toBe(409);
            expect(r.data.error).toBe('TITULAR_BLOQUEADO');
            await api.patch(`/api/atenciones/${atencionId}/cierre`, { resultado: 'sin_unidad' }, authHeaders(adminToken));

            const d = await api.post(`/api/privacidad/clientes/${c.id}/desbloquear`, { motivo: 'El titular volvió a operar' }, authHeaders(adminToken));
            expect(d.status).toBe(200);
            expect(d.data.bloqueadoEn).toBeNull();
        });

        test('un admin no bloquea ni revoca clientes de otro tenant (404)', async () => {
            expect((await api.post(`/api/privacidad/clientes/${clienteBId}/bloquear`, { motivo: 'cruzado' }, authHeaders(adminToken))).status).toBe(404);
            expect((await api.post(`/api/privacidad/clientes/${clienteBId}/revocar-consentimiento`, {}, authHeaders(adminToken))).status).toBe(404);
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    describe('registro de pedidos de titulares', () => {
        test('acceso vence a los 10 días corridos y supresión a los 5 hábiles', async () => {
            // Fechas pasadas a propósito: una recepción futura se rechaza.
            // Lunes 5-oct-2026 + 10 corridos = jueves 15.
            const a = await api.post('/api/privacidad/solicitudes', { tipo: 'acceso', titularNombre: 'Ana Titular', recibidaEl: '2026-10-05' }, authHeaders(adminToken));
            expect(a.status).toBe(201);
            expect(a.data.venceEl).toBe('2026-10-15');
            // Viernes 9-oct-2026 + 5 hábiles = viernes 16.
            const s = await api.post('/api/privacidad/solicitudes', { tipo: 'supresion', titularNombre: 'Ana Titular', recibidaEl: '2026-10-09' }, authHeaders(adminToken));
            expect(s.status).toBe(201);
            expect(s.data.venceEl).toBe('2026-10-16');
            expect(s.data.concesionariaId).toBe(adminConcesionariaId);
        });

        test('un pedido viejo sin resolver figura como vencido y se cierra sólo con la resolución escrita', async () => {
            const c = await nuevoCliente();
            const s = await api.post('/api/privacidad/solicitudes', {
                tipo: 'rectificacion', titularNombre: c.nombre, clienteId: c.id, canal: 'mail', recibidaEl: '2025-01-06',
            }, authHeaders(adminToken));
            expect(s.status).toBe(201);
            expect(s.data.vencida).toBe(true);
            expect(s.data.registradaPor).toBeTruthy();

            const lista = await api.get('/api/privacidad/solicitudes?abiertas=true&limit=200', authHeaders(adminToken));
            expect(lista.status).toBe(200);
            expect(lista.data.vencidas).toBeGreaterThanOrEqual(1);
            expect(lista.data.results.some((r: any) => r.id === s.data.id && r.vencida)).toBe(true);

            const sinRes = await api.patch(`/api/privacidad/solicitudes/${s.data.id}`, { estado: 'resuelta' }, authHeaders(adminToken));
            expect(sinRes.status).toBe(400);
            const ok = await api.patch(`/api/privacidad/solicitudes/${s.data.id}`, { estado: 'resuelta', resolucion: 'Se corrigió el domicilio y se le avisó por mail' }, authHeaders(adminToken));
            expect(ok.status).toBe(200);
            expect(ok.data.estado).toBe('resuelta');
            expect(ok.data.vencida).toBe(false);
            expect(ok.data.atendidaPor).toBeTruthy();
            // Cerrado no se reabre.
            expect((await api.patch(`/api/privacidad/solicitudes/${s.data.id}`, { estado: 'en_curso' }, authHeaders(adminToken))).status).toBe(409);
        });

        test('validación: tipo inválido, fecha futura y cliente de otro tenant', async () => {
            expect((await api.post('/api/privacidad/solicitudes', { tipo: 'olvido', titularNombre: 'X Y' }, authHeaders(adminToken))).status).toBe(400);
            const manana = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
            expect((await api.post('/api/privacidad/solicitudes', { tipo: 'acceso', titularNombre: 'X Y', recibidaEl: manana }, authHeaders(adminToken))).status).toBe(400);
            expect((await api.post('/api/privacidad/solicitudes', { tipo: 'acceso', titularNombre: 'X Y', clienteId: clienteBId }, authHeaders(adminToken))).status).toBe(400);
        });

        test('sólo admin; y el registro de un tenant no se ve desde otro', async () => {
            expect((await api.get('/api/privacidad/solicitudes', authHeaders(vendedorToken))).status).toBe(403);
            expect((await api.post('/api/privacidad/solicitudes', { tipo: 'acceso', titularNombre: 'X Y' }, authHeaders(vendedorToken))).status).toBe(403);

            const enB = await api.post('/api/privacidad/solicitudes', { tipo: 'acceso', titularNombre: 'Titular de B', concesionariaId: tenantBId }, authHeaders(saToken));
            expect(enB.status).toBe(201);
            expect(enB.data.concesionariaId).toBe(tenantBId);
            const lista = await api.get('/api/privacidad/solicitudes?limit=200', authHeaders(adminToken));
            expect(lista.data.results.some((r: any) => r.id === enB.data.id)).toBe(false);
            expect((await api.get(`/api/privacidad/solicitudes/${enB.data.id}`, authHeaders(adminToken))).status).toBe(404);
            expect((await api.patch(`/api/privacidad/solicitudes/${enB.data.id}`, { estado: 'en_curso' }, authHeaders(adminToken))).status).toBe(404);
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    describe('rastro de exportaciones y accesos de soporte', () => {
        test('el CSV de clientes deja quién, cuántas filas y los filtros con PII enmascarados', async () => {
            const c = await nuevoCliente();
            const res = await api.get(`/api/clientes/export/csv?search=${encodeURIComponent(c.dni)}`, authHeaders(adminToken));
            expect(res.status).toBe(200);
            // El rastro se escribe al terminar la respuesta: margen para el insert.
            await new Promise((r) => setTimeout(r, 300));
            const aud = await api.get('/api/auditoria?accion=export&entidad=Exportacion&limit=20', authHeaders(adminToken));
            const fila = aud.data.results.find((r: any) => /clientes-/.test(r.detalle) && r.detalle.includes(`search=[${c.dni.length} caracteres]`));
            expect(fila).toBeDefined();
            expect(fila.detalle).toMatch(/1 fila\(s\)/);
            expect(fila.detalle).not.toContain(c.dni);
        });

        test('una lectura del super_admin sobre clientes del tenant aparece en la auditoría de ese tenant', async () => {
            const c = await nuevoCliente();
            expect((await api.get(`/api/clientes/${c.id}`, authHeaders(saToken))).status).toBe(200);
            await new Promise((r) => setTimeout(r, 300));
            const aud = await api.get('/api/auditoria?accion=acceso_soporte&limit=50', authHeaders(adminToken));
            expect(aud.status).toBe(200);
            // Deduplicado por ventana: puede ser el registro de esta lectura o el de otra
            // lectura de soporte de clientes de los últimos 30 minutos.
            const hace31 = Date.now() - 31 * 60_000;
            const fila = aud.data.results.find((r: any) => r.entidad === 'AccesoSoporte' && /"clientes"/.test(r.detalle) && new Date(r.createdAt).getTime() > hace31);
            expect(fila).toBeDefined();
            expect(fila.concesionariaId).toBe(adminConcesionariaId);
            // Sin la query (podría ser una búsqueda por DNI).
            expect(fila.detalle).not.toContain('?');
        });

        test('las lecturas del propio admin no se registran como soporte', async () => {
            const antes = await api.get('/api/auditoria?accion=acceso_soporte&limit=200', authHeaders(adminToken));
            await api.get('/api/clientes?limit=5', authHeaders(adminToken));
            await new Promise((r) => setTimeout(r, 300));
            const despues = await api.get('/api/auditoria?accion=acceso_soporte&limit=200', authHeaders(adminToken));
            expect(despues.data.totalResults).toBe(antes.data.totalResults);
        });
    });
});
