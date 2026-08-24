import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Inbox, Phone, RefreshCw, Users, TrendingUp, MessageCircle, Check } from 'lucide-react';
import {
    reportesApi,
    type ConsultaSinAtenderItem,
    type ConsultaPorVendedorItem,
    type ConsultaPorCanalItem,
} from '../../api/reportes.api';
import { clientesApi } from '../../api/clientes.api';
import { seguimientosApi } from '../../api/seguimientos.api';
import { waLink } from '../../utils/whatsapp';
import { usuariosApi } from '../../api/usuarios.api';
import { useUIStore } from '../../store/uiStore';
import { getErrorMessage } from '../../utils/getErrorMessage';
import DataTable, { type Column } from '../../components/ui/DataTable';
import Button from '../../components/ui/Button';
import Badge, { type BadgeVariant } from '../../components/ui/Badge';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import PageTitle from '../../components/ui/PageTitle';

// Canal de origen → etiqueta legible + variante de Badge. 'sin_registro' es el
// agrupador del backend para los clientes sin origen cargado.
const CANAL: Record<string, { label: string; variant: BadgeVariant }> = {
    deruedas: { label: 'DeRuedas', variant: 'warning' },
    instagram: { label: 'Instagram', variant: 'violet' },
    facebook: { label: 'Facebook', variant: 'info' },
    whatsapp: { label: 'WhatsApp', variant: 'success' },
    web: { label: 'Web', variant: 'cyan' },
    mostrador: { label: 'Mostrador', variant: 'default' },
    referido: { label: 'Referido', variant: 'default' },
    otro: { label: 'Otro', variant: 'default' },
    sin_registro: { label: 'Sin registro', variant: 'default' },
};

const canalDe = (origen: string | null): { label: string; variant: BadgeVariant } =>
    CANAL[origen ?? 'sin_registro'] ?? { label: origen ?? 'Sin registro', variant: 'default' };

// Formato "es-AR" con 1 decimal (horas promedio y % de conversión).
const unDecimal = (n: number) =>
    n.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

const ConsultasPage = () => {
    const qc = useQueryClient();
    const { addToast } = useUIStore();

    // Rango por fecha de alta del cliente. Vacío = sin acotar (todo el historial).
    const [desde, setDesde] = useState('');
    const [hasta, setHasta] = useState('');

    const { data, isLoading, isError, refetch, isFetching } = useQuery({
        queryKey: ['reportes', 'consultas', desde, hasta],
        queryFn: () =>
            reportesApi.consultas({
                ...(desde ? { desde } : {}),
                ...(hasta ? { hasta } : {}),
            }),
    });

    // Vendedores para el select de reasignación (mismo criterio que ClientesPage).
    const { data: vendedoresData } = useQuery({
        queryKey: ['usuarios-vendedores'],
        queryFn: () => usuariosApi.getAll({}, { limit: 200 }),
        staleTime: 5 * 60 * 1000,
    });
    const vendedores = ((vendedoresData as { results?: { id: number; nombre: string }[] })?.results ?? []);

    // Ids de cliente con una reasignación en vuelo: el disabled es POR FILA (un
    // useMutation solo comparte variables con la última llamada).
    const [reasignando, setReasignando] = useState<Set<number>>(new Set());
    const reasignar = useMutation({
        mutationFn: ({ clienteId, vendedorAsignadoId }: { clienteId: number; vendedorAsignadoId: number }) =>
            clientesApi.update(clienteId, { vendedorAsignadoId }),
        onMutate: ({ clienteId }) => setReasignando((s) => new Set(s).add(clienteId)),
        onSuccess: () => {
            addToast('Vendedor reasignado correctamente', 'success');
            qc.invalidateQueries({ queryKey: ['reportes', 'consultas'] });
            qc.invalidateQueries({ queryKey: ['clientes'] });
        },
        onError: (e) => addToast(getErrorMessage(e, 'No se pudo reasignar el vendedor'), 'error'),
        onSettled: (_d, _e, { clienteId }) =>
            setReasignando((s) => { const n = new Set(s); n.delete(clienteId); return n; }),
    });

    // ── Contacto en un click ────────────────────────────────────────────────
    // "Contactado" registra el seguimiento (alimenta la métrica de primer
    // contacto) y mueve el lead a 'contactado': sale de esta lista solo.
    const hoyISO = () => {
        const d = new Date();
        const p2 = (n: number) => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
    };
    const [contactando, setContactando] = useState<Set<number>>(new Set());
    const contactar = useMutation({
        mutationFn: async ({ clienteId, porWhatsapp }: { clienteId: number; porWhatsapp: boolean }) => {
            await seguimientosApi.create({
                clienteId,
                tipo: porWhatsapp ? 'whatsapp' : 'otro',
                fecha: hoyISO(),
                nota: 'Primer contacto desde el panel de consultas',
            });
            await clientesApi.update(clienteId, { estadoLead: 'contactado' });
        },
        onMutate: ({ clienteId }) => setContactando((s) => new Set(s).add(clienteId)),
        onSuccess: () => {
            addToast('Contacto registrado: el lead pasó a "contactado"', 'success');
            qc.invalidateQueries({ queryKey: ['reportes', 'consultas'] });
            qc.invalidateQueries({ queryKey: ['clientes'] });
            qc.invalidateQueries({ queryKey: ['dashboard'] });
        },
        onError: (e) => addToast(getErrorMessage(e, 'No se pudo registrar el contacto'), 'error'),
        onSettled: (_d, _e, { clienteId }) =>
            setContactando((s) => { const n = new Set(s); n.delete(clienteId); return n; }),
    });

    // Borrador de WhatsApp plantillado (waLink NO envía nada: abre el chat con
    // el mensaje redactado y el vendedor revisa y manda).
    const plantillaWa = (c: ConsultaSinAtenderItem) => {
        const nombre = (c.nombre || '').trim().split(/\s+/)[0] || 'Hola';
        const veh = c.vehiculo ? ` sobre el ${c.vehiculo}` : '';
        return `Hola ${nombre}! Recibimos tu consulta${veh}. ¿Seguís interesado/a? Quedo a disposición para coordinar. `;
    };

    // ── Columnas ────────────────────────────────────────────────────────────

    const sinAtenderCols: Column<ConsultaSinAtenderItem & { id: number }>[] = [
        {
            header: 'Cliente',
            accessor: (c) => (
                <div>
                    <Link to={`/clientes/${c.clienteId}`} className="consulta-cliente">{c.nombre}</Link>
                    {c.telefono && (
                        <div className="flex items-center gap-2 text-muted text-xs">
                            <Phone size={12} className="text-accent" />
                            <span>{c.telefono}</span>
                        </div>
                    )}
                </div>
            ),
        },
        {
            header: 'Canal',
            accessor: (c) => {
                const k = canalDe(c.origen);
                return <Badge variant={k.variant}>{k.label}</Badge>;
            },
        },
        {
            header: 'Vendedor',
            accessor: (c) =>
                c.vendedorNombre
                    ? <span className="text-xs">{c.vendedorNombre}</span>
                    : <span className="text-secondary text-xs italic">Sin asignar</span>,
        },
        {
            header: 'Vehículo',
            accessor: (c) => c.vehiculo ?? <span className="text-secondary">—</span>,
        },
        {
            header: 'Días sin atender',
            align: 'center',
            accessor: (c) => (
                <span className={`font-black ${c.diasSinAtender > 2 ? 'text-danger' : c.diasSinAtender > 1 ? 'text-warning' : ''}`}>
                    {c.diasSinAtender}
                </span>
            ),
        },
        {
            header: 'Reasignar',
            accessor: (c) => (
                <Select
                    dense
                    placeholder="Asignar a…"
                    value={c.vendedorId ?? ''}
                    options={vendedores.map((v) => ({ value: v.id, label: v.nombre }))}
                    disabled={reasignando.has(c.clienteId)}
                    aria-label={`Reasignar vendedor de ${c.nombre}`}
                    style={{ minWidth: 150 }}
                    onChange={(e) => {
                        if (!e.target.value) return;
                        reasignar.mutate({ clienteId: c.clienteId, vendedorAsignadoId: Number(e.target.value) });
                    }}
                />
            ),
        },
        {
            header: 'Contacto',
            align: 'right',
            accessor: (c) => {
                const link = waLink(c.telefono, plantillaWa(c));
                return (
                    <div className="flex items-center justify-end gap-2">
                        {link ? (
                            <a
                                href={link}
                                target="_blank"
                                rel="noreferrer"
                                className="btn btn-secondary btn-sm"
                                title={`Abrir WhatsApp con el mensaje redactado para ${c.nombre}`}
                            >
                                <MessageCircle size={14} /> WhatsApp
                            </a>
                        ) : null}
                        <Button
                            variant="secondary"
                            size="sm"
                            loading={contactando.has(c.clienteId)}
                            title="Registra el primer contacto y pasa el lead a 'contactado'"
                            onClick={() => contactar.mutate({ clienteId: c.clienteId, porWhatsapp: !!link })}
                        >
                            <Check size={14} /> Contactado
                        </Button>
                    </div>
                );
            },
        },
    ];

    const porVendedorCols: Column<ConsultaPorVendedorItem & { id: number }>[] = [
        { header: 'Vendedor', accessor: 'nombre' },
        { header: 'Nuevo', align: 'center', accessor: 'nuevo' },
        { header: 'Contactado', align: 'center', accessor: 'contactado' },
        { header: 'Negociando', align: 'center', accessor: 'negociando' },
        { header: 'Ganado', align: 'center', accessor: (v) => <span className="text-success">{v.ganado}</span> },
        { header: 'Perdido', align: 'center', accessor: (v) => <span className="text-danger">{v.perdido}</span> },
        { header: 'Total', align: 'center', accessor: (v) => <span className="font-black">{v.total}</span> },
        {
            header: '1er contacto (hs prom.)',
            align: 'center',
            accessor: (v) =>
                v.horasPrimerContactoPromedio == null
                    ? <span className="text-secondary">—</span>
                    : unDecimal(v.horasPrimerContactoPromedio),
        },
    ];

    const porCanalCols: Column<ConsultaPorCanalItem & { id: string }>[] = [
        {
            header: 'Canal',
            accessor: (c) => {
                const k = canalDe(c.origen);
                return <Badge variant={k.variant}>{k.label}</Badge>;
            },
        },
        { header: 'Total', align: 'center', accessor: 'total' },
        { header: 'En curso', align: 'center', accessor: 'enCurso' },
        { header: 'Ganados', align: 'center', accessor: (c) => <span className="text-success">{c.ganados}</span> },
        { header: 'Perdidos', align: 'center', accessor: (c) => <span className="text-danger">{c.perdidos}</span> },
        {
            header: 'Conversión',
            align: 'center',
            accessor: (c) => (
                <span className={`font-black ${c.tasaConversion >= 0.2 ? 'text-success' : ''}`}>
                    {unDecimal(c.tasaConversion * 100)}%
                </span>
            ),
        },
    ];

    return (
        <div className="page-container animate-fade-in">
            <PageTitle title="Consultas" />
            <header className="page-header">
                <div className="header-title">
                    <div className="flex items-center gap-3 mb-1">
                        <div className="icon-badge primary shadow-glow">
                            <Inbox size={22} />
                        </div>
                        <h1>Consultas</h1>
                    </div>
                    <p>Leads entrantes de todos los canales: sin atender, gestión por vendedor y conversión por canal.</p>
                </div>
            </header>

            {/* Filtros: rango por fecha de alta del cliente. */}
            <div className="card glass filters-bar mb-6" style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <Input dense label="Desde" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
                <Input dense label="Hasta" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
                <Button variant="secondary" onClick={() => refetch()} loading={isFetching}>
                    <RefreshCw size={16} /> Actualizar
                </Button>
            </div>

            {/* ── Sin atender ── */}
            <section className="consultas-section">
                <h2 className="consultas-h2">Sin atender</h2>
                <DataTable
                    columns={sinAtenderCols}
                    data={(data?.sinAtender ?? []).map((it) => ({ ...it, id: it.clienteId }))}
                    isLoading={isLoading}
                    isError={isError}
                    errorMessage="No se pudieron cargar las consultas sin atender"
                    onRetry={() => refetch()}
                    emptyMessage="No hay consultas sin atender. ✓"
                    emptyIcon={<Inbox size={40} className="text-secondary" />}
                />
            </section>

            {/* ── Gestión por vendedor ── */}
            <section className="consultas-section">
                <h2 className="consultas-h2">Gestión por vendedor</h2>
                <DataTable
                    columns={porVendedorCols}
                    data={(data?.porVendedor ?? []).map((it) => ({ ...it, id: it.vendedorId }))}
                    isLoading={isLoading}
                    isError={isError}
                    errorMessage="No se pudo cargar la gestión por vendedor"
                    onRetry={() => refetch()}
                    emptyMessage="No hay consultas gestionadas en el rango seleccionado"
                    emptyIcon={<Users size={40} className="text-secondary" />}
                />
            </section>

            {/* ── Conversión por canal ── */}
            <section className="consultas-section">
                <h2 className="consultas-h2">Conversión por canal</h2>
                <DataTable
                    columns={porCanalCols}
                    data={(data?.porCanal ?? []).map((it) => ({ ...it, id: it.origen }))}
                    isLoading={isLoading}
                    isError={isError}
                    errorMessage="No se pudo cargar la conversión por canal"
                    onRetry={() => refetch()}
                    emptyMessage="No hay consultas registradas en el rango seleccionado"
                    emptyIcon={<TrendingUp size={40} className="text-secondary" />}
                />
            </section>

            <style>{`
                .consultas-section { margin-bottom: 2rem; }
                .consultas-h2 { font-size: var(--text-lg); margin: 0 0 0.75rem; }
                .consulta-cliente { font-weight: 700; color: var(--accent); text-decoration: none; }
                .consulta-cliente:hover { text-decoration: underline; }
            `}</style>
        </div>
    );
};

export default ConsultasPage;
