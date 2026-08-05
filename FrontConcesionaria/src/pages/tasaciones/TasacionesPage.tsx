import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Gauge, Plus, Search, FileDown, MessageCircle, Trash2, Car, User } from 'lucide-react';
import { tasacionesApi } from '../../api/tasaciones.api';
import { clientesApi } from '../../api/clientes.api';
import { CONDICION_MAP, CONDICIONES, type Tasacion, type CreateTasacionDto, type CondicionTasacion } from '../../types/tasacion.types';
import type { PaginatedResponse } from '../../types/api.types';
import type { Cliente } from '../../types/cliente.types';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import PageTitle from '../../components/ui/PageTitle';
import { useUIStore } from '../../store/uiStore';
import { useConfirm } from '../../hooks/useConfirm';
import { useDebounce } from '../../hooks/useDebounce';
import { getErrorMessage } from '../../utils/getErrorMessage';
import { formatFecha } from '../../utils/fecha';
import { waLink, waShareLink } from '../../utils/whatsapp';

// Fecha local YYYY-MM-DD (no toISOString: de noche en UTC-3 daría mañana).
const hoyLocal = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const money = (n: number, moneda = 'ARS') =>
    `${moneda === 'USD' ? 'US$' : '$'}${Number(n || 0).toLocaleString('es-AR', { maximumFractionDigits: 0 })}`;

const emptyForm = (): CreateTasacionDto => ({
    marca: '', modelo: '', fecha: hoyLocal(), condicion: 'bueno', moneda: 'ARS',
});

const extractList = <T,>(res: unknown): T[] =>
    Array.isArray(res) ? (res as T[]) : ((res as { results?: T[] })?.results ?? []);

const TasacionesPage = () => {
    const queryClient = useQueryClient();
    const { addToast } = useUIStore();
    const confirm = useConfirm();

    const [searchTerm, setSearchTerm] = useState('');
    const debouncedSearch = useDebounce(searchTerm, 400);
    const [page, setPage] = useState(1);
    const [modalOpen, setModalOpen] = useState(false);
    const [form, setForm] = useState<CreateTasacionDto>(emptyForm());
    const [descargando, setDescargando] = useState<number | null>(null);

    const { data, isLoading } = useQuery<PaginatedResponse<Tasacion>>({
        queryKey: ['tasaciones', page, debouncedSearch],
        queryFn: () => tasacionesApi.getAll(debouncedSearch.trim() ? { search: debouncedSearch } : {}, { page, limit: 12 }) as unknown as Promise<PaginatedResponse<Tasacion>>,
    });
    const tasaciones = data?.results ?? [];
    const totalPages = data?.totalPages ?? 1;

    // Si al borrar (o filtrar) la página actual quedó fuera de rango, la ajustamos:
    // si no, borrar la última fila de la última página dejaba una página vacía sin
    // controles de paginación para volver.
    useEffect(() => {
        if (data && page > totalPages) setPage(Math.max(1, totalPages));
    }, [data, page, totalPages]);

    // Clientes para el selector (opcional).
    const { data: clientesRes } = useQuery({
        queryKey: ['clientes', 'todos-para-tasacion'],
        queryFn: () => clientesApi.getAll({}, { limit: 1000 }),
        staleTime: 1000 * 60 * 5,
    });
    const clientes = extractList<Cliente>(clientesRes);

    const createMut = useMutation({
        mutationFn: (payload: CreateTasacionDto) => tasacionesApi.create(payload),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['tasaciones'] });
            addToast('Tasación registrada', 'success');
            setModalOpen(false);
            setForm(emptyForm());
            setPage(1);
        },
        onError: (e) => addToast(getErrorMessage(e, 'Error al registrar la tasación'), 'error'),
    });

    const deleteMut = useMutation({
        mutationFn: (id: number) => tasacionesApi.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['tasaciones'] });
            addToast('Tasación eliminada', 'success');
        },
        onError: (e) => addToast(getErrorMessage(e, 'Error al eliminar la tasación'), 'error'),
    });

    const handleCrear = () => {
        if (!form.marca.trim() || !form.modelo.trim()) {
            addToast('Marca y modelo son obligatorios', 'error');
            return;
        }
        const payload: CreateTasacionDto = {
            marca: form.marca.trim(),
            modelo: form.modelo.trim(),
            fecha: form.fecha,
            condicion: form.condicion,
            moneda: form.moneda,
            clienteId: form.clienteId || undefined,
            anio: form.anio || undefined,
            km: form.km || undefined,
            dominio: form.dominio?.trim() || undefined,
            valorEstimado: form.valorEstimado ?? undefined,
            observaciones: form.observaciones?.trim() || undefined,
        };
        createMut.mutate(payload);
    };

    const handlePdf = async (t: Tasacion) => {
        setDescargando(t.id);
        try {
            const blob = await tasacionesApi.pdf(t.id) as unknown as Blob;
            const url = window.URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `tasacion-${t.id}.pdf`);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
        } catch {
            addToast('No se pudo generar el PDF', 'error');
        } finally {
            setDescargando(null);
        }
    };

    // Borrador de WhatsApp (el usuario revisa y manda; nunca se envía solo).
    const waHref = (t: Tasacion): string => {
        const veh = `${t.marca} ${t.modelo}${t.anio ? ` ${t.anio}` : ''}`.trim();
        const valor = t.valorEstimado != null ? ` Valor estimado: ${money(t.valorEstimado, t.moneda)}.` : '';
        const msg = `Hola${t.cliente?.nombre ? ` ${t.cliente.nombre}` : ''}, te paso la tasación de tu ${veh}.${valor} Es orientativa y sujeta a inspección. ¡Cualquier duda quedamos a disposición!`;
        return waLink(t.cliente?.telefono, msg) ?? waShareLink(msg);
    };

    const set = <K extends keyof CreateTasacionDto>(k: K, v: CreateTasacionDto[K]) => setForm((p) => ({ ...p, [k]: v }));

    return (
        <div className="page-container animate-fade-in">
            <PageTitle title="Tasaciones" />
            <header className="page-header">
                <div className="header-title">
                    <div className="flex items-center gap-3 mb-1">
                        <div className="icon-badge primary shadow-glow"><Gauge size={22} /></div>
                        <h1>Tasaciones de usados</h1>
                    </div>
                    <p>Valuá el vehículo que trae un cliente y entregale la tasación en PDF.</p>
                </div>
                <Button variant="primary" onClick={() => { setForm(emptyForm()); setModalOpen(true); }}>
                    <Plus size={18} /> Nueva tasación
                </Button>
            </header>

            <div className="card glass filters-bar mb-6">
                <div className="search-box">
                    <Search size={18} className="text-slate-500" />
                    <input
                        type="text"
                        placeholder="Buscar por marca, modelo, dominio o cliente..."
                        value={searchTerm}
                        onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }}
                        className="bg-transparent border-none outline-none text-white w-full text-sm font-medium"
                    />
                </div>
            </div>

            {isLoading ? (
                <div className="tas-grid">
                    {Array.from({ length: 4 }).map((_, i) => <div key={i} className="card tas-card"><span className="skeleton skeleton-text" style={{ width: '60%' }} /></div>)}
                </div>
            ) : tasaciones.length === 0 ? (
                <div className="card glass tas-empty">
                    <Gauge size={30} style={{ opacity: 0.4, marginBottom: '0.5rem' }} />
                    <div>No hay tasaciones registradas.</div>
                </div>
            ) : (
                <>
                    <div className="tas-grid">
                        {tasaciones.map((t) => {
                            const c = CONDICION_MAP[t.condicion] ?? { label: t.condicion, variant: 'info' as const };
                            return (
                                <div key={t.id} className="card tas-card">
                                    <div className="tas-card-head">
                                        <span className="tas-veh"><Car size={15} /> {t.marca} {t.modelo}{t.anio ? ` · ${t.anio}` : ''}</span>
                                        <Badge variant={c.variant}>{c.label}</Badge>
                                    </div>
                                    <div className="tas-valor">{t.valorEstimado != null ? money(t.valorEstimado, t.moneda) : 'A convenir'}</div>
                                    <div className="tas-meta">
                                        {t.dominio && <span>Dominio: {t.dominio}</span>}
                                        {t.km != null && <span>{Number(t.km).toLocaleString('es-AR')} km</span>}
                                        <span>{formatFecha(t.fecha)}</span>
                                    </div>
                                    {t.cliente && <div className="tas-cliente"><User size={13} /> {t.cliente.nombre}</div>}
                                    {t.observaciones && <p className="tas-obs">{t.observaciones}</p>}
                                    <div className="tas-actions">
                                        <button className="btn btn-secondary btn-sm" type="button" disabled={descargando === t.id} onClick={() => handlePdf(t)}>
                                            <FileDown size={14} /> {descargando === t.id ? 'Generando…' : 'PDF'}
                                        </button>
                                        <a className="btn btn-secondary btn-sm" href={waHref(t)} target="_blank" rel="noopener noreferrer">
                                            <MessageCircle size={14} /> WhatsApp
                                        </a>
                                        <button
                                            className="btn btn-ghost btn-sm"
                                            type="button"
                                            onClick={() => confirm({ title: 'Eliminar tasación', message: `¿Eliminar la tasación de ${t.marca} ${t.modelo}?`, type: 'danger', onConfirm: async () => { await deleteMut.mutateAsync(t.id); } })}
                                            title="Eliminar"
                                            style={{ marginLeft: 'auto' }}
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    {totalPages > 1 && (
                        <div className="flex items-center justify-center gap-3" style={{ marginTop: '1.25rem' }}>
                            <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Anterior</Button>
                            <span className="text-muted text-sm">Página {page} de {totalPages}</span>
                            <Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Siguiente</Button>
                        </div>
                    )}
                </>
            )}

            <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="Nueva tasación" subtitle="Valuación del usado que trae el cliente" maxWidth="560px"
                footer={<>
                    <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancelar</Button>
                    <Button variant="primary" onClick={handleCrear} loading={createMut.isPending} disabled={createMut.isPending}>Guardar</Button>
                </>}
            >
                <div className="tas-form">
                    <div className="tas-form-grid">
                        <label className="tas-field"><span>Cliente (opcional)</span>
                            <select className="form-input" value={form.clienteId ?? ''} onChange={(e) => set('clienteId', e.target.value ? Number(e.target.value) : undefined)}>
                                <option value="">Sin cliente</option>
                                {clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                            </select>
                        </label>
                        <label className="tas-field"><span>Fecha</span>
                            <input className="form-input" type="date" value={form.fecha} onChange={(e) => set('fecha', e.target.value)} />
                        </label>
                        <label className="tas-field"><span>Marca *</span>
                            <input className="form-input" value={form.marca} onChange={(e) => set('marca', e.target.value)} placeholder="Toyota" />
                        </label>
                        <label className="tas-field"><span>Modelo *</span>
                            <input className="form-input" value={form.modelo} onChange={(e) => set('modelo', e.target.value)} placeholder="Corolla" />
                        </label>
                        <label className="tas-field"><span>Año</span>
                            <input className="form-input" type="number" value={form.anio ?? ''} onChange={(e) => set('anio', e.target.value ? Number(e.target.value) : undefined)} placeholder="2018" />
                        </label>
                        <label className="tas-field"><span>Kilómetros</span>
                            <input className="form-input" type="number" value={form.km ?? ''} onChange={(e) => set('km', e.target.value ? Number(e.target.value) : undefined)} placeholder="85000" />
                        </label>
                        <label className="tas-field"><span>Dominio</span>
                            <input className="form-input" value={form.dominio ?? ''} onChange={(e) => set('dominio', e.target.value)} placeholder="AB123CD" />
                        </label>
                        <label className="tas-field"><span>Condición</span>
                            <select className="form-input" value={form.condicion} onChange={(e) => set('condicion', e.target.value as CondicionTasacion)}>
                                {CONDICIONES.map((k) => <option key={k} value={k}>{CONDICION_MAP[k].label}</option>)}
                            </select>
                        </label>
                        <label className="tas-field"><span>Valor estimado</span>
                            <input className="form-input" type="number" step="0.01" value={form.valorEstimado ?? ''} onChange={(e) => set('valorEstimado', e.target.value ? Number(e.target.value) : undefined)} placeholder="12000000" />
                        </label>
                        <label className="tas-field"><span>Moneda</span>
                            <select className="form-input" value={form.moneda} onChange={(e) => set('moneda', e.target.value as 'ARS' | 'USD')}>
                                <option value="ARS">Pesos (ARS)</option>
                                <option value="USD">Dólares (USD)</option>
                            </select>
                        </label>
                    </div>
                    <label className="tas-field" style={{ marginTop: '0.75rem' }}><span>Observaciones</span>
                        <textarea className="form-input" rows={2} value={form.observaciones ?? ''} onChange={(e) => set('observaciones', e.target.value)} placeholder="Detalles del estado, detalles a reparar, etc." style={{ resize: 'vertical' }} />
                    </label>
                </div>
            </Modal>

            <style>{`
                .tas-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 1rem; }
                .tas-card { padding: 1.1rem; display: flex; flex-direction: column; gap: 0.5rem; }
                .tas-card-head { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; }
                .tas-veh { display: inline-flex; align-items: center; gap: 0.4rem; font-weight: 700; color: var(--text-primary); font-size: 0.95rem; }
                .tas-valor { font-size: 1.4rem; font-weight: 800; color: var(--accent); font-variant-numeric: tabular-nums; }
                .tas-meta { display: flex; flex-wrap: wrap; gap: 0.6rem; font-size: 0.78rem; color: var(--text-muted); }
                .tas-cliente { display: inline-flex; align-items: center; gap: 0.3rem; font-size: 0.82rem; color: var(--text-secondary); }
                .tas-obs { font-size: 0.82rem; color: var(--text-secondary); margin: 0; white-space: pre-wrap; word-break: break-word; }
                .tas-actions { display: flex; align-items: center; gap: 0.5rem; margin-top: 0.35rem; }
                .tas-empty { text-align: center; padding: 2.5rem 1.5rem; color: var(--text-secondary); }
                .tas-form-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.75rem; }
                .tas-field { display: flex; flex-direction: column; gap: 0.3rem; }
                .tas-field > span { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-secondary); font-weight: 700; }
                @media (max-width: 560px) { .tas-form-grid { grid-template-columns: 1fr; } }
            `}</style>
        </div>
    );
};

export default TasacionesPage;
