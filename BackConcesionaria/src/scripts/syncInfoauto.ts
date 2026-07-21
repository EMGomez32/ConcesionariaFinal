/**
 * Sync incremental del catálogo InfoAuto desde la API pública de argautos.com.
 *
 * La API es gratuita pero con cuota: anónimo ~30 requests/día y 3 requests/min
 * por IP. Con API key (plan Starter/Pro) los límites suben a 1.000/5.000 por
 * día. Este script consume la cuota disponible del día y guarda el progreso en
 * la propia base (campos *_synced_at), así que se puede correr todos los días
 * (cron) y retoma donde quedó hasta completar:
 *
 *   1. marcas            (1 request)
 *   2. modelos por marca (1 request por marca, ~54)
 *   3. versiones por modelo (1 request por modelo, ~744)
 *   4. precios por versión  (1 request por versión, ~5.800)
 *   5. re-sync de precios con más de ARGAUTOS_PRICE_REFRESH_DAYS días
 *
 * Uso:  npm run sync:infoauto        (dev)
 *       node dist/scripts/syncInfoauto.js   (producción)
 *
 * Env opcionales:
 *   ARGAUTOS_API_KEY             Bearer token si tenés plan Starter/Pro
 *   ARGAUTOS_MAX_REQUESTS        corta después de N requests (default: hasta agotar cuota)
 *   ARGAUTOS_PRICE_REFRESH_DAYS  edad máxima de precios antes de refrescar (default 30)
 */
import 'dotenv/config';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

const BASE_URL = 'https://argautos.com/api/v1';
const API_KEY = process.env.ARGAUTOS_API_KEY;
const MAX_REQUESTS = Number(process.env.ARGAUTOS_MAX_REQUESTS) || Infinity;
const PRICE_REFRESH_DAYS = Number(process.env.ARGAUTOS_PRICE_REFRESH_DAYS) || 30;
const PER_PAGE = 100;

const connectionString = (process.env.DATABASE_URL || '').replace('prisma+postgres://', 'postgres://');
if (!connectionString) {
    console.error('Falta DATABASE_URL en el entorno.');
    process.exit(1);
}
// Cliente plano, sin las extensiones de tenancy/softDelete de src/prisma: este
// catálogo es global y el script corre fuera del request context de la app.
const pool = new Pool({ connectionString });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) } as any);

/** Se lanza cuando la API agotó la cuota diaria o alcanzamos MAX_REQUESTS. */
class QuotaExhausted extends Error {}

let requestsUsed = 0;
let quotaRemaining: number | null = null;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function apiGet(path: string, params: Record<string, string | number> = {}): Promise<any> {
    if (requestsUsed >= MAX_REQUESTS) throw new QuotaExhausted('ARGAUTOS_MAX_REQUESTS alcanzado');
    if (quotaRemaining !== null && quotaRemaining <= 0) throw new QuotaExhausted('Cuota diaria de la API agotada');

    const url = new URL(`${BASE_URL}${path}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));

    for (let attempt = 1; ; attempt++) {
        const res = await fetch(url, {
            headers: {
                Accept: 'application/json',
                ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}),
            },
        });
        requestsUsed++;

        const dailyRemaining = res.headers.get('X-DailyQuota-Remaining');
        if (dailyRemaining !== null) quotaRemaining = Number(dailyRemaining);
        const rateRemaining = Number(res.headers.get('X-RateLimit-Remaining') ?? '1');

        if (res.status === 429) {
            const retryAfter = Number(res.headers.get('Retry-After') ?? '60');
            if (quotaRemaining !== null && quotaRemaining <= 0) {
                throw new QuotaExhausted('Cuota diaria de la API agotada (429)');
            }
            if (attempt >= 4) throw new Error(`429 persistente en ${path}`);
            console.log(`  rate limit: esperando ${retryAfter}s...`);
            await sleep((retryAfter + 1) * 1000);
            continue;
        }
        if (!res.ok) throw new Error(`GET ${url.pathname} -> HTTP ${res.status}`);

        // Si no quedan requests en la ventana por minuto, esperamos a que renueve.
        if (rateRemaining <= 0) await sleep(61_000);

        return res.json();
    }
}

/** Recorre todas las páginas de un listado paginado y devuelve el data completo. */
async function apiGetAllPages(path: string, params: Record<string, string | number> = {}): Promise<any[]> {
    const all: any[] = [];
    for (let page = 1; ; page++) {
        const body = await apiGet(path, { ...params, per_page: PER_PAGE, page });
        all.push(...body.data);
        if (!body.meta || page >= body.meta.last_page) return all;
    }
}

async function syncBrands(): Promise<void> {
    const count = await prisma.infoautoBrand.count();
    if (count > 0) return;
    console.log('Sincronizando marcas...');
    const brands = await apiGetAllPages('/infoauto/brands');
    for (const b of brands) {
        await prisma.infoautoBrand.upsert({
            where: { id: b.id },
            create: { id: b.id, name: b.name, modelsCount: b.models_count },
            update: { name: b.name, modelsCount: b.models_count },
        });
    }
    console.log(`  ${brands.length} marcas guardadas`);
}

async function syncModels(): Promise<void> {
    const pending = await prisma.infoautoBrand.findMany({
        where: { modelsSyncedAt: null },
        orderBy: { id: 'asc' },
    });
    for (const brand of pending) {
        const models = await apiGetAllPages(`/infoauto/brands/${brand.id}/models`);
        for (const m of models) {
            await prisma.infoautoModel.upsert({
                where: { id: m.id },
                create: { id: m.id, brandId: brand.id, name: m.name, versionsCount: m.versions_count },
                update: { name: m.name, versionsCount: m.versions_count },
            });
        }
        await prisma.infoautoBrand.update({
            where: { id: brand.id },
            data: { modelsSyncedAt: new Date() },
        });
        console.log(`Modelos de ${brand.name}: ${models.length}`);
    }
}

async function syncVersions(): Promise<void> {
    const pending = await prisma.infoautoModel.findMany({
        where: { versionsSyncedAt: null },
        orderBy: { id: 'asc' },
        include: { brand: { select: { name: true } } },
    });
    for (const model of pending) {
        const versions = await apiGetAllPages(`/infoauto/models/${model.id}/versions`);
        for (const v of versions) {
            await prisma.infoautoVersion.upsert({
                where: { id: v.id },
                create: { id: v.id, modelId: model.id, name: v.name, availableYears: v.available_years ?? [] },
                update: { name: v.name, availableYears: v.available_years ?? [] },
            });
        }
        await prisma.infoautoModel.update({
            where: { id: model.id },
            data: { versionsSyncedAt: new Date() },
        });
        console.log(`Versiones de ${model.brand.name} ${model.name}: ${versions.length}`);
    }
}

async function syncPricesFor(versions: { id: number; name: string }[]): Promise<void> {
    for (const version of versions) {
        const body = await apiGet(`/infoauto/versions/${version.id}/prices`, { currency: 'USD' });
        for (const p of body.data ?? []) {
            await prisma.infoautoPrice.upsert({
                where: { versionId_year: { versionId: version.id, year: p.year } },
                create: {
                    versionId: version.id,
                    year: p.year,
                    priceUsd: p.price,
                    exchangeRate: p.exchange_rate,
                    recordedAt: p.recorded_at ? new Date(p.recorded_at) : null,
                },
                update: {
                    priceUsd: p.price,
                    exchangeRate: p.exchange_rate,
                    recordedAt: p.recorded_at ? new Date(p.recorded_at) : null,
                },
            });
        }
        await prisma.infoautoVersion.update({
            where: { id: version.id },
            data: { pricesSyncedAt: new Date() },
        });
        console.log(`Precios de ${version.name}: ${(body.data ?? []).length} años`);
    }
}

async function syncPrices(): Promise<void> {
    // Primero versiones que nunca tuvieron precios; después las más viejas que
    // superaron la ventana de refresco.
    const never = await prisma.infoautoVersion.findMany({
        where: { pricesSyncedAt: null },
        orderBy: { id: 'asc' },
        select: { id: true, name: true },
    });
    await syncPricesFor(never);

    const staleBefore = new Date(Date.now() - PRICE_REFRESH_DAYS * 24 * 60 * 60 * 1000);
    const stale = await prisma.infoautoVersion.findMany({
        where: { pricesSyncedAt: { lt: staleBefore } },
        orderBy: { pricesSyncedAt: 'asc' },
        select: { id: true, name: true },
    });
    await syncPricesFor(stale);
}

async function printProgress(): Promise<void> {
    const [brands, brandsSynced, models, modelsSynced, versions, versionsSynced, prices] = await Promise.all([
        prisma.infoautoBrand.count(),
        prisma.infoautoBrand.count({ where: { modelsSyncedAt: { not: null } } }),
        prisma.infoautoModel.count(),
        prisma.infoautoModel.count({ where: { versionsSyncedAt: { not: null } } }),
        prisma.infoautoVersion.count(),
        prisma.infoautoVersion.count({ where: { pricesSyncedAt: { not: null } } }),
        prisma.infoautoPrice.count(),
    ]);
    console.log('--- Progreso del catálogo ---');
    console.log(`Marcas: ${brands} (modelos bajados para ${brandsSynced})`);
    console.log(`Modelos: ${models} (versiones bajadas para ${modelsSynced})`);
    console.log(`Versiones: ${versions} (precios bajados para ${versionsSynced})`);
    console.log(`Precios: ${prices}`);
    console.log(`Requests usados en esta corrida: ${requestsUsed}` +
        (quotaRemaining !== null ? ` (cuota diaria restante: ${quotaRemaining})` : ''));
}

async function main(): Promise<void> {
    console.log(`Sync InfoAuto — ${API_KEY ? 'con API key' : 'anónimo (cuota ~30 requests/día)'}`);
    try {
        await syncBrands();
        await syncModels();
        await syncVersions();
        await syncPrices();
        console.log('Catálogo completo y al día.');
    } catch (err) {
        if (err instanceof QuotaExhausted) {
            console.log(`Corte por cuota: ${err.message}. Volvé a correr el sync mañana; retoma solo.`);
        } else {
            throw err;
        }
    } finally {
        await printProgress();
        await prisma.$disconnect();
        await pool.end();
    }
}

main().catch(async (err) => {
    console.error('Sync falló:', err);
    await prisma.$disconnect().catch(() => undefined);
    await pool.end().catch(() => undefined);
    process.exit(1);
});
