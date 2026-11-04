import { formatMoneda } from '../../utils/moneda';
import { formatFecha } from '../../utils/fecha';
import { FORMA_PAGO_LABEL, METODO_PAGO_LABEL } from './estados';
import type { FormaPagoVenta } from '../../types/venta.types';

/**
 * Recibo imprimible de una venta ("Imprimir recibo" del detalle).
 *
 * Es una vista de impresión del navegador, no un comprobante fiscal: la factura
 * AFIP sale de su propio panel y el comprobante PDF del backend sigue estando.
 * Sirve para darle al cliente en el mostrador un papel con lo que se pactó.
 */

export interface ReciboVentaDatos {
    id: number;
    fechaVenta: string;
    precioVenta: number | string;
    moneda?: string | null;
    formaPago: FormaPagoVenta | string;
    observaciones?: string | null;
    concesionaria?: { nombre?: string | null; cuit?: string | null; direccion?: string | null; telefono?: string | null } | null;
    sucursal?: string | null;
    cliente?: { nombre?: string | null; dni?: string | null; email?: string | null; telefono?: string | null } | null;
    vehiculo?: { marca?: string | null; modelo?: string | null; version?: string | null; anio?: number | null; dominio?: string | null } | null;
    vendedor?: string | null;
    pagos: { fecha?: string | null; metodo: string; referencia?: string | null; monto: number | string }[];
    extras: { descripcion?: string | null; monto: number | string }[];
    canjes: { descripcion: string; valorTomado: number | string }[];
}

export interface SaldoVenta {
    /** Precio de venta más los extras que se le cobran al cliente. */
    total: number;
    totalPagos: number;
    totalCanjes: number;
    /** Lo que falta cobrar: total − pagos − canjes. */
    saldo: number;
}

const n = (v: unknown) => {
    const x = Number(v);
    return Number.isFinite(x) ? x : 0;
};

/** Redondeo a centavos para que la resta no deje residuos de coma flotante. */
const centavos = (v: number) => Math.round(v * 100) / 100;

/**
 * Cuenta del recibo. El canje (la unidad que entrega el cliente) es parte de
 * pago: descuenta del saldo igual que un pago en efectivo.
 */
export const calcularSaldoVenta = (d: {
    precioVenta: number | string;
    pagos: readonly { monto: number | string }[];
    extras: readonly { monto: number | string }[];
    canjes: readonly { valorTomado: number | string }[];
}): SaldoVenta => {
    const total = centavos(n(d.precioVenta) + d.extras.reduce((s, e) => s + n(e.monto), 0));
    const totalPagos = centavos(d.pagos.reduce((s, p) => s + n(p.monto), 0));
    const totalCanjes = centavos(d.canjes.reduce((s, c) => s + n(c.valorTomado), 0));
    return { total, totalPagos, totalCanjes, saldo: centavos(total - totalPagos - totalCanjes) };
};

/** Escapa texto para meterlo en el HTML del recibo: los datos vienen de la base. */
export const escaparHtml = (s: unknown): string =>
    String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

export const htmlReciboVenta = (d: ReciboVentaDatos): string => {
    const m = (v: number | string) => escaparHtml(formatMoneda(v, d.moneda));
    const cuenta = calcularSaldoVenta(d);
    const nro = String(d.id).padStart(6, '0');
    const unidad = [d.vehiculo?.marca, d.vehiculo?.modelo, d.vehiculo?.version].filter(Boolean).join(' ');
    const conc = d.concesionaria;
    const filasPagos = d.pagos.map((p) => `
        <tr><td>${escaparHtml(p.fecha ? formatFecha(p.fecha) : '-')}</td>
        <td>${escaparHtml(METODO_PAGO_LABEL[p.metodo] ?? p.metodo)}${p.referencia ? ` · ${escaparHtml(p.referencia)}` : ''}</td>
        <td class="num">${m(p.monto)}</td></tr>`).join('');
    const filasCanjes = d.canjes.map((c) => `
        <tr><td>Canje</td><td>${escaparHtml(c.descripcion)}</td><td class="num">${m(c.valorTomado)}</td></tr>`).join('');
    const filasExtras = d.extras.map((e) => `
        <tr><td>${escaparHtml(e.descripcion || 'Extra')}</td><td class="num">${m(e.monto)}</td></tr>`).join('');

    return `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<title>Recibo de venta N° ${nro}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: Inter, -apple-system, 'Segoe UI', Roboto, sans-serif; color: #0f172a; margin: 32px; font-size: 13px; }
  header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 18px; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  h2 { font-size: 12px; text-transform: uppercase; letter-spacing: .08em; color: #475569; margin: 18px 0 6px; }
  .muted { color: #475569; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  table { width: 100%; border-collapse: collapse; }
  td, th { padding: 6px 4px; border-bottom: 1px solid #e2e6ef; text-align: left; }
  .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .total td { font-weight: 700; border-top: 2px solid #0f172a; border-bottom: none; }
  .firmas { display: grid; grid-template-columns: 1fr 1fr; gap: 48px; margin-top: 64px; }
  .firmas div { border-top: 1px solid #0f172a; padding-top: 6px; text-align: center; color: #475569; }
  .nota { margin-top: 24px; font-size: 11px; color: #475569; }
  @media print { body { margin: 12mm; } }
</style></head>
<body>
<header>
  <div>
    <h1>${escaparHtml(conc?.nombre || 'Concesionaria')}</h1>
    ${conc?.cuit ? `<div class="muted">CUIT ${escaparHtml(conc.cuit)}</div>` : ''}
    ${conc?.direccion ? `<div class="muted">${escaparHtml(conc.direccion)}</div>` : ''}
    ${conc?.telefono ? `<div class="muted">Tel. ${escaparHtml(conc.telefono)}</div>` : ''}
    ${d.sucursal ? `<div class="muted">Sucursal ${escaparHtml(d.sucursal)}</div>` : ''}
  </div>
  <div style="text-align:right">
    <h1>Recibo de venta</h1>
    <div>N° ${nro}</div>
    <div class="muted">Fecha: ${escaparHtml(formatFecha(d.fechaVenta))}</div>
  </div>
</header>

<div class="grid">
  <div>
    <h2>Cliente</h2>
    <div><strong>${escaparHtml(d.cliente?.nombre || '-')}</strong></div>
    ${d.cliente?.dni ? `<div class="muted">Documento: ${escaparHtml(d.cliente.dni)}</div>` : ''}
    ${d.cliente?.telefono ? `<div class="muted">Tel. ${escaparHtml(d.cliente.telefono)}</div>` : ''}
    ${d.cliente?.email ? `<div class="muted">${escaparHtml(d.cliente.email)}</div>` : ''}
  </div>
  <div>
    <h2>Unidad</h2>
    <div><strong>${escaparHtml(unidad || '-')}</strong>${d.vehiculo?.anio ? ` (${escaparHtml(d.vehiculo.anio)})` : ''}</div>
    <div class="muted">Dominio: ${escaparHtml(d.vehiculo?.dominio || 'sin dominio')}</div>
    ${d.vendedor ? `<div class="muted">Vendedor: ${escaparHtml(d.vendedor)}</div>` : ''}
  </div>
</div>

<h2>Operación</h2>
<table>
  <tr><td>Precio de venta</td><td class="num">${m(d.precioVenta)}</td></tr>
  ${filasExtras}
  <tr class="total"><td>Total</td><td class="num">${m(cuenta.total)}</td></tr>
</table>
<div class="muted" style="margin-top:6px">Forma de pago: ${escaparHtml(FORMA_PAGO_LABEL[d.formaPago as FormaPagoVenta] ?? d.formaPago)}</div>

<h2>Pagos y canjes</h2>
${d.pagos.length || d.canjes.length ? `<table>
  <tr><th>Fecha</th><th>Detalle</th><th class="num">Monto</th></tr>
  ${filasPagos}${filasCanjes}
</table>` : '<div class="muted">Todavía no hay pagos ni canjes registrados.</div>'}

<table style="margin-top:12px">
  <tr><td>Total pagado</td><td class="num">${m(cuenta.totalPagos)}</td></tr>
  ${cuenta.totalCanjes ? `<tr><td>Canjes tomados</td><td class="num">${m(cuenta.totalCanjes)}</td></tr>` : ''}
  <tr class="total"><td>Saldo</td><td class="num">${m(cuenta.saldo)}</td></tr>
</table>

${d.observaciones ? `<h2>Observaciones</h2><div>${escaparHtml(d.observaciones)}</div>` : ''}

<div class="firmas"><div>Firma del cliente</div><div>Firma y sello de la concesionaria</div></div>
<p class="nota">Este recibo no es una factura. La factura electrónica se emite aparte.</p>
</body></html>`;
};

/**
 * Abre el recibo en una ventana nueva y lanza la impresión. Devuelve `false`
 * si el navegador bloqueó la ventana emergente, para avisarle al usuario.
 */
export const imprimirReciboVenta = (d: ReciboVentaDatos): boolean => {
    const w = window.open('', '_blank', 'width=820,height=960');
    if (!w) return false;
    w.document.open();
    w.document.write(htmlReciboVenta(d));
    w.document.close();
    w.focus();
    // Esperar al layout para que el diálogo de impresión vea el contenido.
    w.setTimeout(() => w.print(), 250);
    return true;
};
