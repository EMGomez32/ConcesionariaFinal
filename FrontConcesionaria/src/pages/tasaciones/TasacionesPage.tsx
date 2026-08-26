import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Gauge, Plus, Search, FileDown, MessageCircle, Trash2, Car, User, Coins } from 'lucide-react';
import { tasacionesApi } from '../../api/tasaciones.api';
import { clientesApi } from '../../api/clientes.api';
import { CONDICION_MAP, CONDICIONES, type Tasacion, type CreateTasacionDto, type UpdateTasacionDto, type CondicionTasacion } from '../../types/tasacion.types';
import type { PaginatedResponse } from '../../types/api.types';
import type { Cliente } from '../../types/cliente.types';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Textarea from '../../components/ui/Textarea';
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

    // "Tasar" una pendiente: el tasador le pone el valor a una que ya existe (nació
    // de una permuta en el mostrador). NO crea otra — actualiza la misma.
    const [tasarTarget, setTasarTarget] = useState<Tasacion | null>(null);
    const [tasarDominio, setTasarDominio] = useState('');
    const [tasarValor, setTasarValor] = useState('');
    const [tasarMoneda, setTasarMoneda] = useState<'ARS' | 'USD'>('ARS');
    const [tasarObs, setTasarObs] = useState('');

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

    const updateMut = useMutation({
        mutationFn: ({ id, data }: { id: number; data: UpdateTasacionDto }) => tasacionesApi.update(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['tasaciones'] });
            addToast('Tasación completada', 'success');
            setTasarTarget(null);
        },
        onError: (e) => addToast(getErrorMessage(e, 'No se pudo completar la tasación'), 'error'),
    });

    const deleteMut = useMutation({
        mutationFn: (id: number) => tasacionesApi.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['tasaciones'] });
            addToast('Tasación eliminada', 'success');
        },
        onError: (e) => addToast(getErrorMessage(e, 'Error al eliminar la tasación'), 'error'),
    });

    const abrirTasar = (t: Tasacion) => {
        setTasarTarget(t);
        setTasarDominio(t.dominio ?? '');
        setTasarValor(t.valorEstimado != null ? String(t.valorEstimado) : '');
        setTasarMoneda(t.moneda);
        setTasarObs(t.observaciones ?? '');
    };

    const guardarTasar = () => {
        if (!tasarTarget) return;
        // Dominio: sin la patente el tasador no sabe qué auto revisar. Se exige acá
        // también, porque una permuta vieja pudo quedar sin él.
        if (!tasarDominio.trim()) {
            addToast('El dominio es obligatorio para tasar', 'error');
            return;
        }
        const valor = Number(tasarValor);
        if (!tasarValor.trim() || !Number.isFinite(valor) || valor < 0) {
            addToast('Poné un valor de tasación válido', 'error');
            return;
        }
        updateMut.mutate({
            id: tasarTarget.id,
            data: {
                dominio: tasarDominio.trim(),
                valorEstimado: valor,
                moneda: tasarMoneda,
                observaciones: tasarObs.trim() || undefined,
            },
        });
    };

    const handleCrear = () => {
        if (!form.marca.trim() || !form.modelo.trim()) {
            addToast('Marca y modelo son obligatorios', 'error');
            return;
        }
        if (!form.dominio?.trim()) {
            addToast('El dominio es obligatorio: sin la patente el tasador no sabe qué auto revisar', 'error');
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
                    <Search size={18} className="text-muted" />
                    <input
                        type="text"
                        placeholder="Buscar por marca, modelo, dominio o cliente..."
                        value={searchTerm}
                        onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }}
                        className="w-full text-sm font-medium"
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
                                        {t.valorEstimado == null && (
                                            <button className="btn btn-primary btn-sm" type="button" onClick={() => abrirTasar(t)}>
                                                <Coins size={14} /> Tasar
                                            </button>
                                        )}
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
                        <Select
                            dense
                            label="Cliente (opcional)"
                            placeholder="Sin cliente"
                            options={clientes.map((c) => ({ value: c.id, label: c.nombre }))}
                            value={form.clienteId ?? ''}
                            onChange={(e) => set('clienteId', e.target.value ? Number(e.target.value) : undefined)}
                        />
                        <Input dense label="Fecha" type="date" value={form.fecha} onChange={(e) => set('fecha', e.target.value)} />
                        <Input dense label="Marca *" value={form.marca} onChange={(e) => set('marca', e.target.value)} placeholder="Toyota" />
                        <Input dense label="Modelo *" value={form.modelo} onChange={(e) => set('modelo', e.target.value)} placeholder="Corolla" />
                        <Input dense label="Año" type="number" value={form.anio ?? ''} onChange={(e) => set('anio', e.target.value ? Number(e.target.value) : undefined)} placeholder="2018" />
                        <Input dense label="Kilómetros" type="number" value={form.km ?? ''} onChange={(e) => set('km', e.target.value ? Number(e.target.value) : undefined)} placeholder="85000" />
                        <Input dense label="Dominio *" value={form.dominio ?? ''} onChange={(e) => set('dominio', e.target.value)} placeholder="AB123CD" />
                        <Select dense label="Condición" value={form.condicion} onChange={(e) => set('condicion', e.target.value as CondicionTasacion)}>
                            {CONDICIONES.map((k) => <option key={k} value={k}>{CONDICION_MAP[k].label}</option>)}
                        </Select>
                        <Input dense label="Valor estimado" type="number" step="0.01" value={form.valorEstimado ?? ''} onChange={(e) => set('valorEstimado', e.target.value ? Number(e.target.value) : undefined)} placeholder="12000000" />
                        <Select dense label="Moneda" value={form.moneda} onChange={(e) => set('moneda', e.target.value as 'ARS' | 'USD')}>
                            <option value="ARS">Pesos (ARS)</option>
                            <option value="USD">Dólares (USD)</option>
                        </Select>
                    </div>
                    <div style={{ marginTop: '0.75rem' }}>
                        <Textarea dense label="Observaciones" rows={2} value={form.observaciones ?? ''} onChange={(e) => set('observaciones', e.target.value)} placeholder="Detalles del estado, detalles a reparar, etc." style={{ resize: 'vertical' }} />
                    </div>
                </div>
            </Modal>

            {/* Tasar una pendiente: completa la MISMA tasación (no crea otra). */}
            <Modal
                isOpen={!!tasarTarget}
                onClose={() => setTasarTarget(null)}
                title="Tasar el usado"
                subtitle={tasarTarget ? `${tasarTarget.marca} ${tasarTarget.modelo}${tasarTarget.anio ? ` · ${tasarTarget.anio}` : ''}${tasarTarget.cliente?.nombre ? ` — ${tasarTarget.cliente.nombre}` : ''}` : ''}
                maxWidth="480px"
                footer={<>
                    <Button variant="secondary" onClick={() => setTasarTarget(null)}>Cancelar</Button>
                    <Button variant="primary" onClick={guardarTasar} loading={updateMut.isPending} disabled={updateMut.isPending}>Guardar tasación</Button>
                </>}
            >
                <div className="tas-form">
                    <div className="tas-form-grid">
                        <Input dense label="Dominio *" value={tasarDominio} onChange={(e) => setTasarDominio(e.target.value)} placeholder="AB123CD" />
                        <Input dense label="Valor estimado *" type="number" value={tasarValor} onChange={(e) => setTasarValor(e.target.value)} placeholder="12000000" />
                        <Select dense label="Moneda" value={tasarMoneda} onChange={(e) => setTasarMoneda(e.target.value as 'ARS' | 'USD')}>
                            <option value="ARS">Pesos (ARS)</option>
                            <option value="USD">Dólares (USD)</option>
                        </Select>
                    </div>
                    <div style={{ marginTop: '0.75rem' }}>
                        <Textarea dense label="Observaciones" rows={2} value={tasarObs} onChange={(e) => setTasarObs(e.target.value)} placeholder="Ajustes al valor, detalles a reparar, etc." style={{ resize: 'vertical' }} />
                    </div>
                </div>
            </Modal>

            <style>{`
                .tas-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 1rem; }
                .tas-card { padding: 1.1rem; display: flex; flex-direction: column; gap: 0.5rem; }
                .tas-card-head { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; }
                .tas-veh { display: inline-flex; align-items: center; gap: 0.4rem; font-weight: 700; color: var(--text-primary); font-size: var(--text-base); }
                .tas-valor { font-size: var(--text-xl); font-weight: 800; color: var(--accent); font-variant-numeric: tabular-nums; }
                .tas-meta { display: flex; flex-wrap: wrap; gap: 0.6rem; font-size: var(--text-sm); color: var(--text-muted); }
                .tas-cliente { display: inline-flex; align-items: center; gap: 0.3rem; font-size: var(--text-sm); color: var(--text-secondary); }
                .tas-obs { font-size: var(--text-sm); color: var(--text-secondary); margin: 0; white-space: pre-wrap; word-break: break-word; }
                .tas-actions { display: flex; align-items: center; gap: 0.5rem; margin-top: 0.35rem; }
                .tas-empty { text-align: center; padding: 2.5rem 1.5rem; color: var(--text-secondary); }
                .tas-form-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.75rem; }
                .tas-field { display: flex; flex-direction: column; gap: 0.3rem; }
                .tas-field > span { font-size: var(--text-xs); text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-secondary); font-weight: 700; }
                @media (max-width: 560px) { .tas-form-grid { grid-template-columns: 1fr; } }
            `}</style>
        </div>
    );
};

export default TasacionesPage;
