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

if (process.env.NODE_ENV === 'production' && process.env.SEED_DEMO_FORCE !== 'true') {
    console.error('Rechazado: NODE_ENV=production. Usá SEED_DEMO_FORCE=true si es una instancia de demo.');
    process.exit(1);
}

const connectionString = (process.env.DATABASE_URL || '').replace('prisma+postgres://', 'postgres://');
const pool = new Pool({ connectionString, max: 1 });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) } as any);

const NOMBRE_DEMO = 'Automotores del Valle (DEMO)';
const hoy = new Date();
const diasAtras = (n: number) => new Date(hoy.getTime() - n * 86400000);
const enDias = (n: number) => new Date(hoy.getTime() + n * 86400000);

async function main() {
    await prisma.$executeRawUnsafe(`SELECT set_config('app.is_super_admin', 'true', false)`);

    if (await prisma.concesionaria.findFirst({ where: { nombre: NOMBRE_DEMO } })) {
        console.log('La concesionaria demo ya existe. Nada que hacer.');
        return;
    }

    // Roles y plan (idempotente).
    for (const nombre of ['admin', 'vendedor', 'cobrador', 'postventa', 'lectura', 'super_admin']) {
        await prisma.rol.upsert({ where: { nombre: nombre as any }, update: {}, create: { nombre: nombre as any } });
    }
    const plan = await prisma.plan.upsert({
        where: { nombre: 'Free' }, update: {},
        create: { nombre: 'Free', precio: 0, moneda: 'ARS', maxUsuarios: 5, maxSucursales: 1, maxVehiculos: 50 },
    });

    const conc = await prisma.concesionaria.create({
        data: {
            nombre: NOMBRE_DEMO, cuit: '30-71234567-9', email: 'demo@autosdelvalle.test',
            subscription: { create: { planId: plan.id, status: 'active' } },
            sucursales: { create: { nombre: 'Casa Central', direccion: 'Av. San Martín 1250, Mendoza' } },
        },
        include: { sucursales: true },
    });
    const cid = conc.id;
    const sid = conc.sucursales[0].id;

    const adminRol = await prisma.rol.findUnique({ where: { nombre: 'admin' } });
    const admin = await prisma.usuario.create({
        data: {
            nombre: 'Admin Demo', email: 'admin@demo.com',
            passwordHash: await bcrypt.hash('demo1234', 10),
            concesionariaId: cid, sucursalId: sid,
            roles: { create: { rolId: adminRol!.id } },
        },
    });

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

    console.log('✅ Datos demo cargados:');
    console.log(`   Concesionaria: ${NOMBRE_DEMO}`);
    console.log('   Login: admin@demo.com / demo1234');
    console.log(`   ${vehiculos.length} vehículos, ${clientes.length} clientes, ${ventas.length} ventas, 1 financiación (2 cuotas en mora).`);
    console.log(`   ${financieras.length} financieras, ${solicitudesDef.length} solicitudes de financiación externa.`);
}

main()
    .catch((e) => { console.error('Error en seed-demo:', e); process.exit(1); })
    .finally(async () => { await prisma.$disconnect(); await pool.end(); });
