import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { vehiculosApi } from '../../api/vehiculos.api';
import type { Vehiculo, EstadoVehiculo } from '../../types/vehiculo.types';
import { waShareLink } from '../../utils/whatsapp';
import { formatFecha } from '../../utils/fecha';
import { useUIStore } from '../../store/uiStore';
import Button from '../../components/ui/Button';
import { GitCompare, MessageCircle, ExternalLink, Car, RefreshCw } from 'lucide-react';

interface Archivo { id: number; tipo?: string; url: string; esPrincipal?: boolean }

const ESTADO_LABEL: Record<EstadoVehiculo, string> = {
    preparacion: 'En preparación', publicado: 'Publicado', reservado: 'Reservado', vendido: 'Vendido', devuelto: 'Devuelto',
};

const money = (n?: number | null, m?: string) =>
    n != null && Number(n) ? `${m === 'USD' ? 'US$' : '$'}${Number(n).toLocaleString('es-AR')}` : 'Consultar';

const km = (n?: number | null) => (n != null ? `${Number(n).toLocaleString('es-AR')} km` : '—');

const fotoPrincipal = (v: Vehiculo): string | null => {
    const arr = (v.archivos as Archivo[] | undefined) ?? [];
    const fotos = arr.filter((a) => (a.tipo ?? 'foto') === 'foto' && a.url);
    return (fotos.find((f) => f.esPrincipal) ?? fotos[0])?.url ?? null;
};

const label = (v: Vehiculo) =>
    `${v.marca} ${v.modelo}${v.version ? ` ${v.version}` : ''}${v.anio ? ` (${v.anio})` : ''}${v.dominio ? ` — ${v.dominio}` : ''}`;

const ComparadorPage = () => {
    const navigate = useNavigate();
    const { addToast } = useUIStore();
    const [searchParams, setSearchParams] = useSearchParams();

    const [stock, setStock] = useState<Vehiculo[]>([]);
    const [loading, setLoading] = useState(true);
    const [slots, setSlots] = useState<string[]>(['', '', '']); // ids de vehículo por columna

    useEffect(() => {
        let vivo = true;
        (async () => {
            try {
                const res = await vehiculosApi.getAll({}, { limit: 500 });
                const list = (((res as unknown) as { results?: Vehiculo[] })?.results ?? []) as Vehiculo[];
                if (!vivo) return;
                setStock(list);
                // Deep-link ?ids=1,2,3 (desde el listado o un WhatsApp compartido). Se
                // deduplican: comparar un vehículo consigo mismo no tiene sentido.
                const ids = [...new Set((searchParams.get('ids') ?? '').split(',').map((s) => s.trim()).filter(Boolean))].slice(0, 3);
                if (ids.length) setSlots([ids[0] ?? '', ids[1] ?? '', ids[2] ?? '']);
            } catch {
                if (vivo) addToast('No se pudo cargar el stock', 'error');
            } finally {
                if (vivo) setLoading(false);
            }
        })();
        return () => { vivo = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const setSlot = (i: number, id: string) => {
        const next = [...slots];
        next[i] = id;
        setSlots(next);
        const ids = next.filter(Boolean);
        setSearchParams(ids.length ? { ids: ids.join(',') } : {}, { replace: true });
    };

    // Deduplicado por id: aunque las opciones ya bloquean elegir dos veces lo mismo,
    // un ?ids=5,5 armado a mano no debe generar columnas repetidas (keys duplicadas).
    const selected = useMemo(() => {
        const seen = new Set<number>();
        const out: Vehiculo[] = [];
        for (const id of slots) {
            const v = stock.find((x) => String(x.id) === id);
            if (v && !seen.has(v.id)) { seen.add(v.id); out.push(v); }
        }
        return out;
    }, [slots, stock]);

    // Highlights "mejor de": precio más bajo, año más nuevo, menos km.
    const minPrecio = useMemo(() => {
        const ps = selected.map((v) => (v.precioLista && Number(v.precioLista) ? Number(v.precioLista) : Infinity));
        return ps.length ? Math.min(...ps) : Infinity;
    }, [selected]);
    const maxAnio = useMemo(() => {
        const as = selected.map((v) => v.anio ?? -Infinity);
        return as.length ? Math.max(...as) : -Infinity;
    }, [selected]);
    const minKm = useMemo(() => {
        const ks = selected.map((v) => (v.kmIngreso != null ? v.kmIngreso : Infinity));
        return ks.length ? Math.min(...ks) : Infinity;
    }, [selected]);

    const compartir = () => {
        if (selected.length < 2) return;
        const lineas = ['Comparativa de unidades:', ''];
        selected.forEach((v, i) => {
            lineas.push(`${i + 1}) ${label(v)}`);
            const detalle = [
                `Precio: ${money(v.precioLista, v.moneda)}`,
                v.kmIngreso != null ? `${Number(v.kmIngreso).toLocaleString('es-AR')} km` : '',
                v.color || '',
            ].filter(Boolean).join(' · ');
            lineas.push(`   ${detalle}`);
        });
        lineas.push('', 'Escribime para más info o para coordinar una visita. ¡Gracias!');
        window.open(waShareLink(lineas.join('\n')), '_blank', 'noopener');
    };

    // Filas de la tabla comparativa. `best(v)` marca la celda ganadora.
    const filas: { label: string; render: (v: Vehiculo) => ReactNode; best?: (v: Vehiculo) => boolean }[] = [
        {
            label: 'Precio de lista',
            render: (v) => <span className="cmp-precio">{money(v.precioLista, v.moneda)}</span>,
            best: (v) => !!v.precioLista && Number(v.precioLista) === minPrecio && minPrecio !== Infinity,
        },
        { label: 'Año', render: (v) => v.anio ?? '—', best: (v) => v.anio != null && v.anio === maxAnio && maxAnio !== -Infinity },
        { label: 'Kilómetros', render: (v) => km(v.kmIngreso), best: (v) => (v.kmIngreso ?? Infinity) === minKm && minKm !== Infinity },
        { label: 'Versión', render: (v) => v.version || '—' },
        { label: 'Color', render: (v) => v.color || '—' },
        { label: 'Tipo', render: (v) => (v.tipo === 'CERO_KM' ? '0 km' : 'Usado') },
        { label: 'Dominio', render: (v) => v.dominio || 'S/D' },
        { label: 'Estado', render: (v) => <span className="cmp-chip">{ESTADO_LABEL[v.estado] ?? v.estado}</span> },
        { label: 'Sucursal', render: (v) => v.sucursal?.nombre || '—' },
        { label: 'Vence VTV', render: (v) => (v.vencimientoVtv ? formatFecha(v.vencimientoVtv) : '—') },
        { label: 'Vence seguro', render: (v) => (v.vencimientoSeguro ? formatFecha(v.vencimientoSeguro) : '—') },
    ];

    return (
        <div className="cmp-container">
            <header className="cmp-header">
                <div className="cmp-title">
                    <div className="cmp-badge"><GitCompare size={22} /></div>
                    <div>
                        <h1>Comparador de vehículos</h1>
                        <p>Elegí hasta 3 unidades del stock y compará specs, precio y documentación lado a lado.</p>
                    </div>
                </div>
                <div className="cmp-actions">
                    <Button variant="secondary" onClick={compartir} disabled={selected.length < 2} title={selected.length < 2 ? 'Elegí al menos 2 unidades' : 'Compartir la comparativa por WhatsApp'}>
                        <MessageCircle size={18} /> Compartir
                    </Button>
                </div>
            </header>

            {/* Selectores de columna */}
            <div className="cmp-slots">
                {[0, 1, 2].map((i) => (
                    <div className="cmp-slot" key={i}>
                        <label className="cmp-slot-lbl">Vehículo {i + 1}</label>
                        <select
                            className="cmp-select"
                            value={slots[i]}
                            onChange={(e) => setSlot(i, e.target.value)}
                            disabled={loading}
                        >
                            <option value="">{loading ? 'Cargando stock…' : '— Elegir —'}</option>
                            {stock.map((v) => (
                                <option
                                    key={v.id}
                                    value={v.id}
                                    // Ya elegido en otra columna: no se puede comparar consigo mismo.
                                    disabled={slots.some((s, j) => j !== i && s === String(v.id))}
                                >
                                    {label(v)}
                                </option>
                            ))}
                        </select>
                    </div>
                ))}
            </div>

            {loading ? (
                <div className="cmp-empty"><RefreshCw size={22} className="spin" /> Cargando…</div>
            ) : selected.length < 2 ? (
                <div className="cmp-empty">
                    <GitCompare size={48} style={{ opacity: 0.2 }} />
                    <p>Elegí al menos 2 vehículos para ver la comparación.</p>
                </div>
            ) : (
                <div className="cmp-table-wrap">
                    <table className="cmp-table">
                        <thead>
                            <tr>
                                <th className="cmp-attr"></th>
                                {selected.map((v) => (
                                    <th key={v.id} className="cmp-col-head">
                                        <div className="cmp-foto">
                                            {fotoPrincipal(v)
                                                ? <img src={fotoPrincipal(v)!} alt={label(v)} />
                                                : <div className="cmp-foto-ph"><Car size={34} /></div>}
                                        </div>
                                        <div className="cmp-col-title">{v.marca} {v.modelo}</div>
                                        <div className="cmp-col-sub">{v.version || ' '}</div>
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {filas.map((f) => (
                                <tr key={f.label}>
                                    <td className="cmp-attr">{f.label}</td>
                                    {selected.map((v) => (
                                        <td key={v.id} className={f.best?.(v) ? 'cmp-best' : ''}>{f.render(v)}</td>
                                    ))}
                                </tr>
                            ))}
                            <tr>
                                <td className="cmp-attr"></td>
                                {selected.map((v) => (
                                    <td key={v.id}>
                                        <Button variant="outline" size="sm" onClick={() => navigate(`/vehiculos/${v.id}`)}>
                                            <ExternalLink size={14} /> Ver ficha
                                        </Button>
                                    </td>
                                ))}
                            </tr>
                        </tbody>
                    </table>
                </div>
            )}

            <style>{`
                .cmp-container { display: flex; flex-direction: column; gap: 1.5rem; animation: fadeIn 0.4s ease-out; }
                .cmp-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; flex-wrap: wrap; }
                .cmp-title { display: flex; align-items: center; gap: 1rem; }
                .cmp-badge { width: 48px; height: 48px; border-radius: var(--radius-lg); background: linear-gradient(135deg, var(--accent-2), rgba(var(--accent-2-rgb), 0.75)); color: var(--text-white); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
                .cmp-title h1 { font-size: var(--text-xl); font-weight: 800; letter-spacing: -0.02em; }
                .cmp-title p { color: var(--text-secondary); font-size: var(--text-sm); margin-top: 0.15rem; }
                .cmp-slots { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; }
                .cmp-slot-lbl { display: block; font-size: var(--text-sm); font-weight: 600; color: var(--text-secondary); margin-bottom: 0.4rem; }
                .cmp-select { width: 100%; padding: 0.65rem 0.875rem; background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-md); color: var(--text-primary); font-size: var(--text-sm); outline: none; }
                .cmp-select:focus { border-color: var(--accent); }
                .cmp-empty { display: flex; flex-direction: column; align-items: center; gap: 0.9rem; padding: 3.5rem; color: var(--text-muted); text-align: center; border: 1px dashed var(--border); border-radius: var(--radius-lg); }
                .cmp-table-wrap { overflow-x: auto; border: 1px solid var(--border); border-radius: var(--radius-lg); }
                .cmp-table { width: 100%; border-collapse: collapse; min-width: 560px; }
                .cmp-table th, .cmp-table td { padding: 0.85rem 1rem; text-align: center; border-bottom: 1px solid var(--border); font-size: var(--text-base); }
                .cmp-attr { text-align: left !important; font-weight: 600; color: var(--text-secondary); font-size: var(--text-sm); background: var(--bg-secondary); white-space: nowrap; position: sticky; left: 0; }
                .cmp-col-head { vertical-align: top; }
                .cmp-foto { width: 100%; aspect-ratio: 16/10; border-radius: var(--radius-sm); overflow: hidden; background: var(--bg-secondary); display: flex; align-items: center; justify-content: center; margin-bottom: 0.5rem; }
                .cmp-foto img { width: 100%; height: 100%; object-fit: cover; }
                .cmp-foto-ph { color: var(--text-muted); }
                .cmp-col-title { font-weight: 800; font-size: var(--text-base); }
                .cmp-col-sub { font-size: var(--text-sm); color: var(--text-muted); }
                .cmp-precio { font-weight: 800; }
                .cmp-chip { padding: 0.15rem 0.6rem; border-radius: var(--radius-pill); font-size: var(--text-xs); font-weight: 700; background: var(--bg-secondary); color: var(--text-secondary); }
                .cmp-best { position: relative; color: var(--success); font-weight: 800; background: color-mix(in srgb, var(--success) 10%, transparent); }
                .spin { animation: spin 1s linear infinite; }
                @keyframes spin { to { transform: rotate(360deg); } }
                @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
                @media (max-width: 640px) { .cmp-slots { grid-template-columns: 1fr; } }
            `}</style>
        </div>
    );
};

export default ComparadorPage;
