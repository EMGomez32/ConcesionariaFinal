/**
 * seed-demo.ts — carga un set de datos DEMO realista para presentaciones:
 * concesionaria, sucursal, admin, vehículos (ARS y USD), clientes, ventas con
 * pagos, una financiación con cuotas (algunas en mora) y gastos.
 *
 * Uso (en una instancia dedicada a demos, NO en la de un cliente real):
 *   docker compose exec backend npx ts-node prisma/seed-demo.ts
 *
 * Seguridad: se niega a correr con NODE_ENV=production salvo SEED_DEMO_FORCE=true.
 * Es idempotente: si la concesionaria demo ya existe, no hace nada.
 */
import 'dotenv/config';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { normalizarTelefono } from '../src/domain/services/telefono';

if (process.env.NODE_ENV === 'production' && process.env.SEED_DEMO_FORCE !== 'true') {
    console.error('Rechazado: NODE_ENV=production. Usá SEED_DEMO_FORCE=true si es una instancia de demo.');
    process.exit(1);
}

const connectionString = (process.env.DATABASE_URL || '').replace('prisma+postgres://', 'postgres://');
const pool = new Pool({ connectionString, max: 1 });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) } as any);

const NOMBRE_DEMO = 'Automotores del Valle (DEMO)';
// Llenar una concesionaria QUE YA EXISTE en vez de crear una nueva por nombre.
const TENANT_OBJETIVO = process.env.SEED_DEMO_TENANT_ID ? Number(process.env.SEED_DEMO_TENANT_ID) : null;
// Dominio de los emails demo. Se pasa para respetar la convencion de un tenant
// que ya existe (p.ej. demo.com -> admin@demo.com, vendedor@demo.com, ...).
const EMAIL_DOMAIN = (process.env.SEED_DEMO_EMAIL_DOMAIN || 'autosdelvalle.test').trim();
// Contrasena de TODAS las cuentas demo. Es conocida y compartida a proposito:
// son cuentas de demostracion. Configurable para no dejar la del repo en una
// instancia accesible desde afuera.
const PASSWORD_DEMO = process.env.SEED_DEMO_PASSWORD || 'demo1234';
// Pisar la contrasena de un usuario que YA existe es destructivo, asi que no
// pasa por default: hay que pedirlo explicito.
const RESET_PASS = process.env.SEED_DEMO_RESET_PASS === 'true';
// Nombre de la concesionaria que se termino cargando: con SEED_DEMO_TENANT_ID
// no es NOMBRE_DEMO, y el resumen final tiene que decir la verdad.
let nombreCargado = NOMBRE_DEMO;
const hoy = new Date();
const diasAtras = (n: number) => new Date(hoy.getTime() - n * 86400000);
const enDias = (n: number) => new Date(hoy.getTime() + n * 86400000);

/**
 * Crea (o repone) UN usuario demo con un rol.
 *
 * Centraliza los tres casos que aparecen al sembrar sobre una base que ya vive:
 * el usuario no existe, existe sano, o existe pero está apagado — `activo=false`
 * o con `deletedAt`. Los dos últimos se ven igual desde afuera (el login devuelve
 * 401) y son la razón por la que este bloque no puede ser un simple `create`.
 */
async function asegurarUsuarioDemo(opts: {
    email: string; nombre: string; rol: string; cid: number; sid?: number;
}): Promise<any> {
    const rol = await prisma.rol.findUnique({ where: { nombre: opts.rol as any } });
    if (!rol) throw new Error(`Falta el rol ${opts.rol}: corré el bloque de roles primero.`);

    const existente = await prisma.usuario.findFirst({ where: { email: opts.email } });
    if (!existente) {
        const creado = await prisma.usuario.create({
            data: {
                nombre: opts.nombre, email: opts.email,
                passwordHash: await bcrypt.hash(PASSWORD_DEMO, 10),
                concesionariaId: opts.cid, sucursalId: opts.sid,
                roles: { create: { rolId: rol.id } },
            },
        });
        console.log(`   ${opts.rol.padEnd(9)} creado:  ${opts.email}`);
        return creado;
    }

    // El vínculo usuario-rol también tiene soft-delete, y el UNIQUE(usuario, rol)
    // impide recrearlo: si está borrado hay que revivirlo, no insertarlo de nuevo.
    const vinculo = await prisma.usuarioRol.findFirst({
        where: { usuarioId: existente.id, rolId: rol.id },
    });
    if (!vinculo) {
        await prisma.usuarioRol.create({ data: { usuarioId: existente.id, rolId: rol.id } });
        console.log(`   ${opts.email}: se le agregó el rol ${opts.rol}`);
    } else if (vinculo.deletedAt != null) {
        await prisma.usuarioRol.update({ where: { id: vinculo.id }, data: { deletedAt: null } });
        console.log(`   ${opts.email}: se revivió el rol ${opts.rol}`);
    }

    // `activo=false` y `deletedAt` son dos apagados distintos y hay que mirar los
    // dos: una cuenta puede estar viva y desactivada, o activa y borrada. En
    // producción aparecieron las dos formas.
    const apagado = existente.deletedAt != null || !existente.activo;
    if (RESET_PASS) {
        await prisma.usuario.update({
            where: { id: existente.id },
            data: {
                passwordHash: await bcrypt.hash(PASSWORD_DEMO, 10),
                activo: true,
                deletedAt: null,
                concesionariaId: existente.concesionariaId ?? opts.cid,
                sucursalId: existente.sucursalId ?? opts.sid,
            },
        });
        console.log(
            `   ${opts.rol.padEnd(9)} repuesto: ${opts.email}` +
            (apagado ? ' (estaba apagado — se reactivó)' : ''),
        );
    } else if (apagado) {
        console.log(
            `   ⚠ ${opts.email}: existe pero está APAGADO (${existente.deletedAt ? 'borrado' : 'inactivo'}) ` +
            '— NO va a poder entrar. Correr con SEED_DEMO_RESET_PASS=true para reactivarlo.',
        );
    } else {
        console.log(`   ${opts.rol.padEnd(9)} ya existía: ${opts.email} (contraseña intacta)`);
    }
    return prisma.usuario.findUnique({ where: { id: existente.id } });
}

/**
 * Una cuenta por rol, para poder mirar la app desde cada puesto.
 *
 * Son cuentas de DEMOSTRACIÓN: comparten una contraseña conocida. No van en una
 * instancia con datos reales — para eso está el aviso del encabezado del archivo.
 */
async function seedUsuariosPorRol(cid: number, sid?: number) {
    const def = [
        { rol: 'admin', nombre: 'Admin Demo' },
        { rol: 'vendedor', nombre: 'Sofía Ramírez' },
        { rol: 'cobrador', nombre: 'Nadia Bustos' },
        { rol: 'postventa', nombre: 'Hernán Villalba' },
        { rol: 'lectura', nombre: 'Consulta Demo' },
        { rol: 'tasador', nombre: 'Diego Peralta' },
    ];
    const creados: Record<string, any> = {};
    for (const d of def) {
        creados[d.rol] = await asegurarUsuarioDemo({
            email: `${d.rol}@${EMAIL_DOMAIN}`, nombre: d.nombre, rol: d.rol, cid, sid,
        });
    }
    // El SEGUNDO vendedor va aparte: no es "otro rol", es lo que hace visible la
    // cartera. Sin dos vendedores no hay aviso de "este cliente es de otro" ni
    // reasignación que mirar.
    creados.vendedor2 = await asegurarUsuarioDemo({
        email: `vendedor2@${EMAIL_DOMAIN}`, nombre: 'Martín Acuña', rol: 'vendedor', cid, sid,
    });
    return creados;
}

async function main() {
    await prisma.$executeRawUnsafe(`SELECT set_config('app.is_super_admin', 'true', false)`);

    // Roles y plan (idempotente). Van primero porque los necesitan los DOS
    // caminos de abajo, no sólo el que crea la concesionaria.
    for (const nombre of ['admin', 'vendedor', 'cobrador', 'postventa', 'lectura', 'super_admin', 'tasador']) {
        await prisma.rol.upsert({ where: { nombre: nombre as any }, update: {}, create: { nombre: nombre as any } });
    }
    const plan = await prisma.plan.upsert({
        where: { nombre: 'Free' }, update: {},
        create: { nombre: 'Free', precio: 0, moneda: 'ARS', maxUsuarios: 5, maxSucursales: 1, maxVehiculos: 50 },
    });

    let cid: number;
    let sid: number;
    let admin: any;

    if (TENANT_OBJETIVO) {
        // ── Modo "llenar una concesionaria QUE YA EXISTE" ─────────────────────
        // Para eso está `SEED_DEMO_TENANT_ID`. En la instancia de producción la
        // concesionaria de demostración ya está creada, con otro nombre y con
        // usuarios reales colgando, así que crear una nueva por nombre dejaría
        // dos demos y llenaría la equivocada.
        const t = await prisma.concesionaria.findUnique({ where: { id: TENANT_OBJETIVO } });
        if (!t) throw new Error(`No existe la concesionaria ${TENANT_OBJETIVO}.`);
        const suc = await prisma.sucursal.findFirst({
            where: { concesionariaId: t.id }, orderBy: { id: 'asc' },
        });
        if (!suc) throw new Error(`La concesionaria ${t.id} no tiene sucursales: creá una antes.`);
        // Usuario al que se le atribuyen los registros demo (vendedor de las
        // ventas, cobrador de la financiación, quien registró los movimientos).
        // Se exige ACTIVO a propósito: colgar las ventas de una cuenta
        // deshabilitada deja las fichas mostrando a alguien que no puede entrar.
        const ref = await prisma.usuario.findFirst({
            where: { concesionariaId: t.id, activo: true, deletedAt: null },
            orderBy: { id: 'asc' },
        });
        if (!ref) throw new Error(`La concesionaria ${t.id} no tiene usuarios activos.`);
        cid = t.id; sid = suc.id; admin = ref; nombreCargado = t.nombre;
        console.log(`Llenando la concesionaria ${cid} — ${t.nombre}`);
        console.log(`   sucursal ${sid}, registros a nombre de ${ref.email}`);

        // Si ya tiene stock, el bloque grande ya corrió alguna vez: repetirlo
        // duplicaría vehículos y ventas. Sólo se completa el módulo nuevo.
        if (await prisma.vehiculo.count({ where: { concesionariaId: cid } }) > 0) {
            console.log('   ya tiene vehículos: se completa sólo el módulo del vendedor.');
            await seedModuloVendedor(cid);
            return;
        }
    } else {
        // ── Modo "crear la concesionaria demo por nombre" (el de siempre) ─────
        // La demo puede existir de ANTES del módulo del vendedor. En ese caso no
        // se rehace nada de lo viejo (sería duplicar ventas, cuotas y casos de
        // postventa), pero sí se completa lo que falte.
        const existente = await prisma.concesionaria.findFirst({ where: { nombre: NOMBRE_DEMO } });
        if (existente) {
            console.log('La concesionaria demo ya existe: se completa sólo lo que falte.');
            await seedModuloVendedor(existente.id);
            return;
        }

        const conc = await prisma.concesionaria.create({
            data: {
                nombre: NOMBRE_DEMO, cuit: '30-71234567-9', email: 'demo@autosdelvalle.test',
                subscription: { create: { planId: plan.id, status: 'active' } },
                sucursales: { create: { nombre: 'Casa Central', direccion: 'Av. San Martín 1250, Mendoza' } },
            },
            include: { sucursales: true },
        });
        cid = conc.id;
        sid = conc.sucursales[0].id;

        const adminRol = await prisma.rol.findUnique({ where: { nombre: 'admin' } });
        admin = await prisma.usuario.create({
            data: {
                nombre: 'Admin Demo', email: 'admin@autosdelvalle.test',
                passwordHash: await bcrypt.hash('demo1234', 10),
                concesionariaId: cid, sucursalId: sid,
                roles: { create: { rolId: adminRol!.id } },
            },
        });
    }

    // Vehículos (mezcla de monedas y estados).
    const vehData = [
        { marca: 'Toyota', modelo: 'Hilux SRV 4x4', anio: 2021, dominio: 'AD123FG', color: 'Gris', km: 68000, compra: 28000, lista: 34000, moneda: 'USD', estado: 'vendido' },
        { marca: 'Volkswagen', modelo: 'Amarok Highline', anio: 2020, dominio: 'AC456HJ', color: 'Blanco', km: 92000, compra: 24000, lista: 29000, moneda: 'USD', estado: 'publicado' },
        { marca: 'Ford', modelo: 'Focus SE', anio: 2018, dominio: 'AB789KL', color: 'Rojo', km: 74000, compra: 9500000, lista: 12500000, moneda: 'ARS', estado: 'publicado' },
        { marca: 'Chevrolet', modelo: 'Onix LTZ', anio: 2022, dominio: 'AE012MN', color: 'Negro', km: 31000, compra: 14000000, lista: 17500000, moneda: 'ARS', estado: 'vendido' },
        { marca: 'Fiat', modelo: 'Cronos Drive', anio: 2021, dominio: 'AD345PQ', color: 'Plata', km: 45000, compra: 11000000, lista: 14000000, moneda: 'ARS', estado: 'reservado' },
        { marca: 'Renault', modelo: 'Duster Iconic', anio: 2019, dominio: 'AC678RS', color: 'Azul', km: 88000, compra: 12000, lista: 15000, moneda: 'USD', estado: 'vendido' },
        // En preparación: todavía no se publica, pero ya se le puede tramitar el
        // crédito. Es el caso que hace visible el filtro del selector de vehículos.
        { marca: 'Peugeot', modelo: '208 Feline', anio: 2023, dominio: 'AF901TU', color: 'Blanco', km: 12000, compra: 15000000, lista: 19000000, moneda: 'ARS', estado: 'preparacion' },
    ];
    const vehiculos = [];
    for (const v of vehData) {
        vehiculos.push(await prisma.vehiculo.create({
            data: {
                concesionariaId: cid, sucursalId: sid, marca: v.marca, modelo: v.modelo,
                anio: v.anio, dominio: v.dominio, color: v.color, kmIngreso: v.km,
                tipo: 'USADO', origen: 'compra', estado: v.estado as any,
                fechaIngreso: diasAtras(120), precioCompra: v.compra, precioLista: v.lista, moneda: v.moneda,
            },
        }));
    }

    // Clientes.
    const cliData = [
        { nombre: 'Juan Pérez', dni: '28345678', tel: '2615551234', email: 'juanperez@mail.test' },
        { nombre: 'María Gómez', dni: '30987654', tel: '2615555678', email: 'mgomez@mail.test' },
        { nombre: 'Carlos Díaz', dni: '25111222', tel: '2615559012', email: 'cdiaz@mail.test' },
        { nombre: 'Lucía Fernández', dni: '33444555', tel: '2615553456', email: 'lfernandez@mail.test' },
    ];
    const clientes = [];
    for (const c of cliData) {
        clientes.push(await prisma.cliente.create({
            data: { concesionariaId: cid, nombre: c.nombre, dni: c.dni, telefono: c.tel, email: c.email },
        }));
    }

    // Proveedores externos: son las contrapartes comerciales y, sobre todo, los
    // lugares a los que se envían las unidades a preparar. El `tipo` debe ser uno
    // de los valores de FrontConcesionaria/src/constants/proveedorTipos.ts.
    const proveedores = [];
    for (const p of [
        { nombre: 'Autopartes del Sur SA', tipo: 'importadora', telefono: '3415551234', email: 'ventas@autopartessur.test', direccion: 'Av. Pellegrini 1200, Rosario', activo: true },
        { nombre: 'Taller Mecánico El Piñón', tipo: 'mecanico', telefono: '3415559876', email: 'contacto@elpinon.test', direccion: 'Bv. Oroño 850, Rosario', activo: true },
        { nombre: 'Lavadero Brillo Total', tipo: 'lavadero', telefono: '3415554321', email: 'hola@brillototal.test', direccion: 'San Martín 445, Rosario', activo: true },
        { nombre: 'Chapa y Pintura Del Valle', tipo: 'chapa_pintura', telefono: '3415557788', email: 'info@cypdelvalle.test', direccion: 'Ruta 9 Km 12, Funes', activo: true },
        { nombre: 'Gomería El Rayo', tipo: 'gomeria', telefono: '3415552211', email: 'turnos@elrayo.test', direccion: 'Av. Francia 2300, Rosario', activo: true },
    ]) {
        proveedores.push(await prisma.proveedor.create({ data: { concesionariaId: cid, ...p } }));
    }

    // Categoría de gasto + gastos sobre vehículos.
    const catGasto = await prisma.categoriaGastoVehiculo.create({
        data: { concesionariaId: cid, nombre: 'Acondicionamiento' },
    });
    await prisma.gastoVehiculo.createMany({
        data: [
            { concesionariaId: cid, vehiculoId: vehiculos[0].id, categoriaId: catGasto.id, proveedorId: proveedores[1].id, fecha: diasAtras(90), monto: 800, moneda: 'USD', descripcion: 'Service y neumáticos' },
            { concesionariaId: cid, vehiculoId: vehiculos[3].id, categoriaId: catGasto.id, proveedorId: proveedores[2].id, fecha: diasAtras(60), monto: 350000, moneda: 'ARS', descripcion: 'Pulido y detailing' },
            { concesionariaId: cid, vehiculoId: vehiculos[5].id, categoriaId: catGasto.id, proveedorId: proveedores[3].id, fecha: diasAtras(40), monto: 500, moneda: 'USD', descripcion: 'Chapa y pintura' },
        ],
    });

    // Presupuestos. El total no es una columna: sale de items + extras - canje.
    // Se arma uno por cada estado interesante del ciclo comercial.
    await prisma.presupuesto.create({
        data: {
            concesionariaId: cid, sucursalId: sid, nroPresupuesto: `PRES-${hoy.getFullYear()}-001`,
            clienteId: clientes[0].id, vendedorId: admin.id,
            fechaCreacion: diasAtras(8), validoHasta: diasAtras(-7),
            estado: 'enviado', moneda: 'USD',
            observaciones: 'Incluye grabado de cristales y patentamiento.',
            items: { create: [{ concesionariaId: cid, vehiculoId: vehiculos[1].id, precioLista: 21500, descuento: 500, precioFinal: 21000 }] },
            extras: { create: [{ concesionariaId: cid, descripcion: 'Grabado de cristales', monto: 150 }] },
        },
    });

    // Con canje: el total resta el valor tomado por la unidad usada.
    await prisma.presupuesto.create({
        data: {
            concesionariaId: cid, sucursalId: sid, nroPresupuesto: `PRES-${hoy.getFullYear()}-002`,
            clienteId: clientes[1].id, vendedorId: admin.id,
            fechaCreacion: diasAtras(3), validoHasta: diasAtras(-12),
            estado: 'borrador', moneda: 'USD',
            observaciones: 'Entrega su usado en parte de pago.',
            items: { create: [{ concesionariaId: cid, vehiculoId: vehiculos[2].id, precioLista: 18000, descuento: 0, precioFinal: 18000 }] },
            canje: { create: { concesionariaId: cid, descripcion: 'Fiat Cronos 2018', anio: 2018, km: 85000, dominio: 'AB123CD', valorTomado: 6500 } },
        },
    });

    // Movimientos de stock: los envíos a preparación apuntan al proveedor
    // externo que recibe la unidad. Uno sigue afuera (sin fechaRetorno) y otro
    // ya volvió, para que se vea el ciclo completo.
    await prisma.vehiculoMovimiento.createMany({
        data: [
            {
                concesionariaId: cid, vehiculoId: vehiculos[1].id, desdeSucursalId: sid,
                tipo: 'preparacion', proveedorDestinoId: proveedores[1].id,
                fecha: diasAtras(5), motivo: 'Service de 20.000 km antes de publicar',
                registradoPorId: admin.id,
            },
            {
                concesionariaId: cid, vehiculoId: vehiculos[2].id, desdeSucursalId: sid,
                tipo: 'preparacion', proveedorDestinoId: proveedores[2].id,
                fecha: diasAtras(12), fechaRetorno: diasAtras(10),
                motivo: 'Lavado y detailing pre-entrega',
                registradoPorId: admin.id,
            },
        ],
    });

    // Ventas (con pagos). Vehículos vendidos: índices 0, 3, 5.
    const ventasDef = [
        { veh: 0, cli: 0, precio: 33500, moneda: 'USD', forma: 'contado', dias: 30, pago: 33500 },
        { veh: 3, cli: 1, precio: 17200000, moneda: 'ARS', forma: 'financiado_propio', dias: 20, pago: 6000000 },
        { veh: 5, cli: 2, precio: 14800, moneda: 'USD', forma: 'contado', dias: 10, pago: 14800 },
    ];
    const ventas = [];
    for (const vd of ventasDef) {
        const venta = await prisma.venta.create({
            data: {
                concesionariaId: cid, sucursalId: sid, vehiculoId: vehiculos[vd.veh].id,
                clienteId: clientes[vd.cli].id, vendedorId: admin.id,
                fechaVenta: diasAtras(vd.dias), precioVenta: vd.precio, moneda: vd.moneda,
                formaPago: vd.forma as any, estadoEntrega: 'entregada',
                pagos: { create: { concesionariaId: cid, fecha: diasAtras(vd.dias), monto: vd.pago, metodo: 'transferencia' } },
            },
        });
        ventas.push(venta);
    }

    // Financiación propia sobre la venta 2 (ARS), con 12 cuotas: 2 vencidas en mora.
    const montoFin = 11200000;
    const cuotaMonto = Math.round(montoFin / 12);
    const fin = await prisma.financiacion.create({
        data: {
            concesionariaId: cid, sucursalId: sid, ventaId: ventas[1].id,
            clienteId: clientes[1].id, cobradorId: admin.id,
            fechaInicio: diasAtras(20), montoFinanciado: montoFin, moneda: 'ARS',
            cuotas: 12, diaVencimiento: 10, estado: 'activa',
        },
    });
    const cuotas = [];
    for (let i = 1; i <= 12; i++) {
        // Cuotas 1 y 2 ya vencidas y sin pagar (mora); el resto a futuro.
        const vencimiento = i <= 2 ? diasAtras((3 - i) * 30 + 5) : enDias((i - 2) * 30);
        const enMora = i <= 2;
        cuotas.push({
            concesionariaId: cid, financiacionId: fin.id, nroCuota: i,
            montoCuota: cuotaMonto, saldoCuota: cuotaMonto,
            vencimiento, estado: (enMora ? 'vencida' : 'pendiente') as any,
        });
    }
    await prisma.cuota.createMany({ data: cuotas });

    // Gastos fijos: los costos recurrentes de la concesionaria. Se imputan a un
    // período (año/mes), no a una fecha exacta.
    const catFijasDef = ['Alquiler', 'Servicios', 'Sueldos', 'Marketing', 'Seguros'];
    const catFijas = [];
    for (const nombre of catFijasDef) {
        catFijas.push(await prisma.categoriaGastoFijo.create({
            data: { concesionariaId: cid, nombre },
        }));
    }

    const gastosFijos = [];
    // Tres meses de historia, para que el filtro por período tenga qué mostrar.
    for (let atras = 0; atras < 3; atras++) {
        const ref = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth() - atras, 1));
        const anio = ref.getUTCFullYear();
        const mes = ref.getUTCMonth() + 1;
        gastosFijos.push(
            { cat: 0, desc: 'Alquiler del salón de ventas', monto: 1800000, moneda: 'ARS' },
            { cat: 1, desc: 'Luz, agua e internet', monto: 320000, moneda: 'ARS' },
            { cat: 2, desc: 'Sueldos y cargas sociales', monto: 6500000, moneda: 'ARS' },
            { cat: 3, desc: 'Publicidad en portales', monto: 450000, moneda: 'ARS' },
        );
        for (const g of gastosFijos.splice(0, 4)) {
            await prisma.gastoFijo.create({
                data: {
                    concesionariaId: cid, sucursalId: sid,
                    categoriaId: catFijas[g.cat].id,
                    anio, mes, descripcion: g.desc, monto: g.monto, moneda: g.moneda,
                },
            });
        }
        // Un gasto en USD por mes: hace visible que los totales no se pueden sumar
        // mezclando monedas.
        await prisma.gastoFijo.create({
            data: {
                concesionariaId: cid, sucursalId: sid,
                categoriaId: catFijas[4].id,
                anio, mes, descripcion: 'Seguro de la flota (póliza en USD)', monto: 850, moneda: 'USD',
            },
        });
    }

    // Catálogo de tipos de reclamo. Existe para estandarizar: antes el tipo era
    // texto libre y cada variante ortográfica aparecía como un tipo distinto.
    const tiposPostventaDef = [
        { nombre: 'Mecánica', activo: true },
        { nombre: 'Climatización', activo: true },
        { nombre: 'Tapicería', activo: true },
        { nombre: 'Electricidad', activo: true },
        { nombre: 'Chapa y pintura', activo: true },
        // Archivado: se sigue viendo en los casos viejos pero no se ofrece al
        // crear uno nuevo. Deja el caso a la vista en el ABM.
        { nombre: 'Garantía extendida (discontinuado)', activo: false },
    ];
    const tiposPostventa = [];
    for (const t of tiposPostventaDef) {
        tiposPostventa.push(await prisma.tipoPostventa.create({
            data: { concesionariaId: cid, ...t },
        }));
    }

    // Postventa: reclamos sobre unidades ya vendidas. `ventaId` es obligatorio en
    // el schema, así que cada caso cuelga de una venta real y toma de ella el
    // cliente y el vehículo (si no, el caso hablaría de un auto que esa persona
    // nunca compró).
    const casosDef = [
        { venta: 0, tipo: 0, estado: 'pendiente', dias: 12, desc: 'Ruido en tren delantero al pasar lomos de burro.', items: [] as { d: string; m: number }[] },
        {
            venta: 1, tipo: 1, estado: 'en_curso', dias: 20, desc: 'Aire acondicionado no enfría.',
            items: [{ d: 'Carga de gas + detección de fuga', m: 85000 }, { d: 'Reemplazo de o-rings', m: 22000 }],
        },
        {
            venta: 2, tipo: 2, estado: 'resuelto', dias: 40, desc: 'Tapizado de butaca con costura floja.',
            items: [{ d: 'Retapizado de butaca conductor', m: 130000 }],
        },
    ];
    for (const c of casosDef) {
        const vd = ventasDef[c.venta];
        const caso = await prisma.postventaCaso.create({
            data: {
                concesionariaId: cid, sucursalId: sid,
                ventaId: ventas[c.venta].id,
                clienteId: clientes[vd.cli].id,
                vehiculoId: vehiculos[vd.veh].id,
                estado: c.estado as any,
                tipoId: tiposPostventa[c.tipo].id,
                descripcion: c.desc,
                fechaReclamo: diasAtras(c.dias),
                fechaCierre: c.estado === 'resuelto' ? diasAtras(c.dias - 15) : null,
            },
        });
        for (const it of c.items) {
            await prisma.postventaItem.create({
                data: {
                    concesionariaId: cid, casoId: caso.id,
                    fecha: diasAtras(c.dias - 2),
                    descripcion: it.d, monto: it.m,
                },
            });
        }
    }

    // Financiación externa: entidades a las que se les pide crédito.
    const financierasDef = [
        { nombre: 'Banco Nación', tipo: 'banco', contacto: 'Mesa de créditos', telefono: '0810-666-4444', email: 'creditos@bna.test' },
        { nombre: 'Santander Prendarios', tipo: 'banco', contacto: 'Laura Gómez', telefono: '11-4000-1234', email: 'prendarios@santander.test' },
        { nombre: 'Credicuotas', tipo: 'financiera', contacto: 'Diego Ruiz', telefono: '11-5555-8899', email: 'altas@credicuotas.test' },
        { nombre: 'Plan Rombo', tipo: 'otra', contacto: 'Atención concesionarios', telefono: '0800-333-7766', email: null },
    ];
    const financieras = [];
    for (const f of financierasDef) {
        financieras.push(await prisma.financiera.create({
            data: { concesionariaId: cid, ...f, tipo: f.tipo as any },
        }));
    }

    // Una solicitud por estado, para ver el circuito completo en la UI.
    // `veh: null` = pre-aprobación: el cliente pregunta cuánto le prestan antes
    // de elegir la unidad.
    const solicitudesDef = [
        // Borrador: todavía no se mandó, sin fechas.
        { fin: 0, cli: 0, veh: 1, monto: 8500000, plazo: 48, tasa: 6.5, estado: 'borrador', envio: null, resp: null, aprob: null, tasaF: null, obs: 'Falta adjuntar recibo de sueldo.' },
        // Enviada: se mandó, esperando acuse.
        { fin: 1, cli: 1, veh: 2, monto: 12000000, plazo: 36, tasa: 7.25, estado: 'enviada', envio: 4, resp: null, aprob: null, tasaF: null, obs: 'Enviada por el portal de la financiera.' },
        // Pre-aprobación: sin auto elegido todavía.
        { fin: 2, cli: 2, veh: null, monto: 5400000, plazo: 24, tasa: 9, estado: 'pendiente', envio: 9, resp: null, aprob: null, tasaF: null, obs: 'Pre-aprobación: el cliente todavía no eligió unidad.' },
        // Aprobada por menos de lo pedido: el caso que hace visible montoAprobado vs montoSolicitado.
        { fin: 0, cli: 3, veh: 4, monto: 9000000, plazo: 36, tasa: 6.75, estado: 'aprobada', envio: 20, resp: 12, aprob: 7500000, tasaF: 7.1, obs: 'Aprobada por un monto menor al solicitado.' },
        // Rechazada.
        { fin: 2, cli: 1, veh: 6, monto: 15000000, plazo: 60, tasa: 8.5, estado: 'rechazada', envio: 30, resp: 25, aprob: null, tasaF: null, obs: 'Rechazada por relación cuota/ingreso.' },
    ];
    for (const s of solicitudesDef) {
        await prisma.solicitudFinanciacion.create({
            data: {
                concesionariaId: cid, sucursalId: sid,
                clienteId: clientes[s.cli % clientes.length].id,
                financieraId: financieras[s.fin].id,
                vehiculoId: s.veh !== null ? vehiculos[s.veh % vehiculos.length].id : null,
                estado: s.estado as any,
                montoSolicitado: s.monto, plazoCuotas: s.plazo, tasaEstimada: s.tasa,
                fechaEnvio: s.envio ? diasAtras(s.envio) : null,
                fechaRespuesta: s.resp ? diasAtras(s.resp) : null,
                montoAprobado: s.aprob, tasaFinal: s.tasaF,
                observaciones: s.obs,
            },
        });
    }

    await seedModuloVendedor(cid);

    console.log('✅ Datos demo cargados:');
    console.log(`   Concesionaria: ${nombreCargado}${TENANT_OBJETIVO ? ` (id ${TENANT_OBJETIVO})` : ''}`);
    if (!TENANT_OBJETIVO) console.log('   Login admin:    admin@autosdelvalle.test / demo1234');
    console.log(`   Cuentas (contraseña ${PASSWORD_DEMO}):`);
    for (const r of ['admin', 'vendedor', 'vendedor2', 'cobrador', 'postventa', 'lectura']) {
        console.log(`     ${r.padEnd(10)} ${r}@${EMAIL_DOMAIN}`);
    }
    console.log(`   ${vehiculos.length} vehículos, ${clientes.length} clientes, ${ventas.length} ventas, 1 financiación (2 cuotas en mora).`);
    console.log(`   ${financieras.length} financieras, ${solicitudesDef.length} solicitudes de financiación externa.`);
}

/**
 * Módulo del vendedor / atención presencial.
 *
 * Va aparte del bloque de arriba y es IDEMPOTENTE POR SU CUENTA, a propósito: la
 * concesionaria demo puede haberse creado ANTES de que este módulo existiera, y
 * en ese caso rehacer el bloque grande duplicaría ventas, cuotas y casos de
 * postventa. Por eso esta función no recibe los arrays en memoria — busca en la
 * base lo que necesita y crea sólo lo que falta.
 */
async function seedModuloVendedor(cid: number) {
    const sucursal = await prisma.sucursal.findFirst({ where: { concesionariaId: cid } });
    const sid = sucursal?.id ?? undefined;

    // Una cuenta por rol (y el segundo vendedor). Es lo que permite mirar la app
    // desde cada puesto en vez de deducir los permisos leyendo el codigo.
    const usuarios = await seedUsuariosPorRol(cid, sid);
    const vendedores = [usuarios.vendedor, usuarios.vendedor2];

    // El plazo de retención de cartera lo define cada concesionaria. 21 días en
    // vez del default de 30 para que la demo tenga un número propio y se vea que
    // el campo existe y es configurable.
    await prisma.concesionaria.update({
        where: { id: cid },
        data: { diasRetencionCliente: 21 },
    });

    // Si ya hay atenciones, el módulo ya se sembró: no se duplica.
    if (await prisma.atencion.count({ where: { concesionariaId: cid } }) > 0) {
        console.log('   atenciones demo ya presentes: no se duplican.');
        return;
    }

    // Clientes existentes: se les completa lo que el módulo necesita para
    // funcionar (teléfono normalizado, dueño de cartera, última interacción).
    // NO se les inventa `apellido`: partir el `nombre` viejo por el primer espacio
    // adivina mal, que es justo lo que la migración decidió no hacer.
    const clientesViejos = await prisma.cliente.findMany({
        where: { concesionariaId: cid }, orderBy: { id: 'asc' },
    });
    for (const [i, c] of clientesViejos.entries()) {
        await prisma.cliente.update({
            where: { id: c.id },
            data: {
                telefonoNormalizado: normalizarTelefono(c.telefono),
                // Alternados entre los dos vendedores; el último queda SIN dueño
                // para mostrar el caso "cliente libre" del filtro de cartera.
                vendedorAsignadoId: i < clientesViejos.length - 1 ? vendedores[i % 2].id : null,
                vendedorAsignadoEn: i < clientesViejos.length - 1 ? diasAtras(15 + i) : null,
                ultimaInteraccionEn: diasAtras(5 + i * 3),
                consentimientoContacto: true,
                consentimientoEn: diasAtras(15 + i),
            },
        });
    }

    // Clientes NUEVOS con nombre y apellido separados: así se ve la forma nueva
    // de la ficha conviviendo con las viejas, que siguen mostrando el nombre entero.
    const nuevosDef = [
        { nombre: 'Valeria', apellido: 'Sosa', dni: '35876123', tel: '2615557788', email: 'vsosa@mail.test', vend: 0 },
        { nombre: 'Ignacio', apellido: 'Ledesma', dni: '31229087', tel: '+54 9 261 555-4433', email: 'iledesma@mail.test', vend: 1 },
    ];
    const clientesNuevos = [];
    for (const c of nuevosDef) {
        // Por email: si el modulo se resembro parcialmente, no se duplican.
        const ya = await prisma.cliente.findFirst({ where: { concesionariaId: cid, email: c.email } });
        if (ya) { clientesNuevos.push(ya); continue; }
        clientesNuevos.push(await prisma.cliente.create({
            data: {
                concesionariaId: cid, nombre: c.nombre, apellido: c.apellido,
                dni: c.dni, telefono: c.tel, telefonoNormalizado: normalizarTelefono(c.tel),
                email: c.email,
                vendedorAsignadoId: vendedores[c.vend].id,
                vendedorAsignadoEn: diasAtras(9),
                ultimaInteraccionEn: diasAtras(2),
                consentimientoContacto: true, consentimientoEn: diasAtras(9),
            },
        }));
    }

    const clientes = [...clientesViejos, ...clientesNuevos];
    const vehiculos = await prisma.vehiculo.findMany({
        where: { concesionariaId: cid }, orderBy: { id: 'asc' },
    });
    if (!vehiculos.length || !clientes.length) {
        console.log('   sin vehículos o clientes: se omiten las atenciones.');
        return;
    }
    const veh = (i: number) => vehiculos[i % vehiculos.length];
    const cli = (i: number) => clientes[i % clientes.length];

    // Una atención por cada estado interesante del flujo del salón.
    const visitaAbierta = await prisma.atencion.create({
        data: {
            concesionariaId: cid, clienteId: cli(0).id, vendedorId: vendedores[0].id,
            motivo: 'consulta_general', estado: 'abierta',
            iniciadaEn: new Date(Date.now() - 40 * 60000),
            modoBusqueda: 'presupuesto', moneda: 'ARS',
            presupuestoMin: 12000000, presupuestoMax: 18000000,
            anticipo: 4000000, cuotaMaxima: 450000, tipoFinanciamiento: 'credito',
            presupuestoRealCalculado: 16000000,
            observaciones: 'Vino con la señora. Busca algo familiar, prioriza baúl grande.',
            vehiculos: {
                create: [
                    { concesionariaId: cid, vehiculoId: veh(2).id, tipo: 'buscada', accion: 'vista', nivelInteres: 'alto' },
                    {
                        concesionariaId: cid, vehiculoId: veh(4).id, tipo: 'sugerida', accion: 'vista',
                        nivelInteres: 'medio', motivoSugerencia: 'Mismo segmento, más equipada y dentro del presupuesto real.',
                    },
                ],
            },
        },
    });

    const visitaTestDrive = await prisma.atencion.create({
        data: {
            concesionariaId: cid, clienteId: cli(1).id, vendedorId: vendedores[0].id,
            motivo: 'unidad_puntual', estado: 'cerrada', resultado: 'test_drive',
            iniciadaEn: diasAtras(6), cerradaEn: diasAtras(6),
            modoBusqueda: 'unidad', moneda: 'USD',
            presupuestoMin: 18000, presupuestoMax: 24000, tipoFinanciamiento: 'contado',
            observaciones: 'Probó la unidad. Queda en confirmar con la esposa esta semana.',
            vehiculos: {
                create: [
                    { concesionariaId: cid, vehiculoId: veh(1).id, tipo: 'buscada', accion: 'test_drive', nivelInteres: 'alto' },
                ],
            },
        },
    });

    // Vuelve por una visita anterior: es el caso que encadena atenciones y el que
    // dispara el aviso de cartera si lo atiende otro vendedor.
    await prisma.atencion.create({
        data: {
            concesionariaId: cid, clienteId: cli(1).id, vendedorId: vendedores[1].id,
            motivo: 'vuelve_por_atencion_anterior', atencionAnteriorId: visitaTestDrive.id,
            estado: 'abierta', iniciadaEn: new Date(Date.now() - 15 * 60000),
            modoBusqueda: 'unidad', moneda: 'USD',
            observaciones: 'Volvió por la unidad que probó. Lo atendió otro vendedor: el dueño es Sofía.',
            vehiculos: {
                create: [
                    { concesionariaId: cid, vehiculoId: veh(1).id, tipo: 'buscada', accion: 'cotizada', nivelInteres: 'alto' },
                ],
            },
        },
    });

    // Permuta a tasar: la atención enlaza la Tasacion, no la duplica.
    const visitaPermuta = await prisma.atencion.create({
        data: {
            concesionariaId: cid, clienteId: cli(2).id, vendedorId: vendedores[1].id,
            motivo: 'consulta_general', estado: 'cerrada', resultado: 'permuta_a_tasar',
            iniciadaEn: diasAtras(3), cerradaEn: diasAtras(3),
            modoBusqueda: 'modelo', moneda: 'ARS',
            presupuestoMin: 9000000, presupuestoMax: 15000000, tipoFinanciamiento: 'contado',
            observaciones: 'Entrega su usado. Queda pendiente la tasación del taller.',
            vehiculos: {
                create: [
                    { concesionariaId: cid, vehiculoId: veh(4).id, tipo: 'buscada', accion: 'vista', nivelInteres: 'medio' },
                ],
            },
        },
    });
    await prisma.tasacion.create({
        data: {
            concesionariaId: cid, clienteId: cli(2).id, atencionId: visitaPermuta.id,
            marca: 'Volkswagen', modelo: 'Gol Trend', anio: 2016, km: 118000, dominio: 'AA456BC',
            condicion: 'regular', estado: 'sin_tasar', moneda: 'ARS', fecha: diasAtras(3),
            observaciones: 'Permuta ofrecida en el mostrador. Falta que la vea el taller.',
        },
    });

    // Cerrada POR EL SISTEMA: es lo que alimenta la alerta "dejaste N atenciones
    // sin cerrar". Sin esta marca no hay forma de distinguirla de un cierre real.
    await prisma.atencion.create({
        data: {
            concesionariaId: cid, clienteId: cli(3).id, vendedorId: vendedores[0].id,
            motivo: 'consulta_general', estado: 'cerrada', resultado: 'se_retiro',
            cerradaAutomaticamente: true,
            iniciadaEn: diasAtras(2), cerradaEn: diasAtras(2),
            observaciones: 'La cerró el barrido de fin de día.',
        },
    });

    // Autorización de precio mínimo: una por estado, para ver el circuito entero.
    // La PENDIENTE es la que deja algo para hacer al entrar como admin.
    await prisma.solicitudPrecioMinimo.create({
        data: {
            concesionariaId: cid, vehiculoId: veh(1).id, atencionId: visitaTestDrive.id,
            solicitanteId: vendedores[0].id, estado: 'pendiente',
            motivo: 'El cliente ofrece USD 27.500 y se lo lleva hoy. ¿Lo autorizás?',
            moneda: 'USD', solicitadaEn: new Date(Date.now() - 90 * 60000),
        },
    });
    const adminDemo = await prisma.usuario.findFirst({ where: { email: 'admin@autosdelvalle.test' } });
    await prisma.solicitudPrecioMinimo.create({
        data: {
            concesionariaId: cid, vehiculoId: veh(2).id,
            solicitanteId: vendedores[1].id, resueltaPorId: adminDemo?.id,
            estado: 'autorizada', precioAutorizado: 11800000, moneda: 'ARS',
            motivo: 'Pide un descuento por pago contado.',
            respuesta: 'Autorizado hasta ese número, vence en 48 hs.',
            solicitadaEn: diasAtras(4), resueltaEn: diasAtras(4), venceEl: enDias(1),
        },
    });
    await prisma.solicitudPrecioMinimo.create({
        data: {
            concesionariaId: cid, vehiculoId: veh(4).id,
            solicitanteId: vendedores[0].id, resueltaPorId: adminDemo?.id,
            estado: 'rechazada', moneda: 'ARS',
            motivo: 'Ofrece 10.500.000 en efectivo.',
            respuesta: 'No llega: la unidad tiene gastos de preparación arriba.',
            solicitadaEn: diasAtras(7), resueltaEn: diasAtras(6),
        },
    });

    console.log('   módulo del vendedor: 5 atenciones, 1 tasación de permuta, 3 solicitudes de precio mínimo.');
}

main()
    .catch((e) => { console.error('Error en seed-demo:', e); process.exit(1); })
    .finally(async () => { await prisma.$disconnect(); await pool.end(); });
