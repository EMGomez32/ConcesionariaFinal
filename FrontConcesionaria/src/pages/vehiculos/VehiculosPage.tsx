import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useVehiculos, useChangeVehiculoEstado, useDeleteVehiculo } from '../../hooks/useVehiculos';
import { vehiculosApi } from '../../api/vehiculos.api';
import { useSucursales } from '../../hooks/useSucursales';
import { useConfirm } from '../../hooks/useConfirm';
import { useDebounce } from '../../hooks/useDebounce';
import type { Vehiculo, EstadoVehiculo, TipoVehiculo, VehiculoFilter } from '../../types/vehiculo.types';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import { useUIStore } from '../../store/uiStore';
import { useAuthStore } from '../../store/authStore';
import { Plus, Edit, Trash2, RefreshCw, Car, ChevronDown, FileText, FileDown } from 'lucide-react';
import Modal from '../../components/ui/Modal';
import Select from '../../components/ui/Select';
import PageTitle from '../../components/ui/PageTitle';
import { Listado, ListadoTabla, CampoFiltro, BusquedaListado, type ColumnaListado } from '../../components/listado';
import { formatMoneda } from '../../utils/moneda';
import type { ApiError } from '../../types/api.types';
import {
    ESTADO_VEHICULO,
    EN_STOCK,
    NEXT_ESTADOS,
    diasEnStock,
    antiguedadVariant,
    formatKm,
    descripcionVehiculo,
} from './vehiculoTextos';

// Filtro de estado. "stock" (por defecto) = lo que está en la concesionaria:
// en preparación, publicado o reservado. Así la lista no abre con las vendidas
// arriba (antes el orden por alta reciente las mezclaba con el stock vivo) y
// cuenta lo mismo que "Vehículos en stock" del Inicio.
type FiltroEstado = 'stock' | '' | EstadoVehiculo;
const FILTRO_ESTADO_DEFECTO: FiltroEstado = 'stock';

const estadoParaApi = (f: FiltroEstado): VehiculoFilter['estado'] =>
    f === 'stock' ? EN_STOCK : f === '' ? undefined : f;

const TEXTO_ANTIGUEDAD: Record<ReturnType<typeof antiguedadVariant>, string> = {
    success: 'var(--success)',
    info: 'var(--info)',
    warning: 'var(--warning)',
    danger: 'var(--danger)',
};

const VehiculosPage: React.FC = () => {
    const navigate = useNavigate();
    const { addToast } = useUIStore();
    // El export CSV es admin/vendedor en el backend: ocultamos el botón para los
    // demás roles (si no, sería un botón muerto que siempre da 403).
    const user = useAuthStore((s) => s.user);
    const puedeExportar = !!user?.roles?.some((r) => r === 'admin' || r === 'super_admin' || r === 'vendedor');
    const confirm = useConfirm();

    const [searchTerm, setSearchTerm] = useState('');
    const debouncedSearch = useDebounce(searchTerm, 500);
    const [filterEstado, setFilterEstado] = useState<FiltroEstado>(FILTRO_ESTADO_DEFECTO);
    const [filterTipo, setFilterTipo] = useState('');
    const [filterSucursal, setFilterSucursal] = useState('');
    const [orden, setOrden] = useState<'recientes' | 'antiguedad'>('recientes');
    const [page, setPage] = useState(1);
    const [catalogando, setCatalogando] = useState(false);
    const [exportando, setExportando] = useState(false);

    // Cualquier cambio de filtro/búsqueda/orden vuelve a la página 1: si el nuevo
    // resultado tiene menos páginas, quedarse en la página actual dejaba una
    // página vacía. Se observa `debouncedSearch` (no `searchTerm`) para resetear
    // recién cuando la búsqueda realmente se aplica, no en cada tecla. `page` no
    // va en las deps a propósito: si no, se resetearía sola al paginar.
    useEffect(() => {
        setPage(1);
    }, [debouncedSearch, filterEstado, filterTipo, filterSucursal, orden]);

    const { data: sucursales = [] } = useSucursales();

    const filtros: VehiculoFilter = {
        search: debouncedSearch || undefined,
        estado: estadoParaApi(filterEstado),
        tipo: filterTipo ? (filterTipo as TipoVehiculo) : undefined,
        sucursalId: filterSucursal ? Number(filterSucursal) : undefined,
    };
    // "Antigüedad" = los que más tiempo llevan en stock primero (ingreso más
    // viejo). Así la página 1 muestra las unidades a priorizar/repreciar.
    const ordenApi = orden === 'antiguedad'
        ? { sortBy: 'fechaIngreso', sortOrder: 'asc' as const }
        : { sortBy: 'createdAt', sortOrder: 'desc' as const };

    const { data: payload, isLoading: loading, isFetching, isError, refetch } = useVehiculos(filtros, {
        page,
        limit: 20,
        ...ordenApi,
    });

    const vehiculos = payload?.results || [];
    const totalPages = payload?.totalPages || 1;
    const totalResults = payload?.totalResults ?? 0;

    // Filtros distintos del valor por defecto (el orden no filtra).
    const filtrosActivos = [filterEstado !== FILTRO_ESTADO_DEFECTO, !!filterTipo, !!filterSucursal].filter(Boolean).length;
    // Para el estado vacío: con el filtro por defecto y sin búsqueda, una lista
    // vacía es "no hay unidades en stock", no "tus filtros no devuelven nada".
    const hayFiltros = !!debouncedSearch || filtrosActivos > 0;

    const limpiarFiltros = () => {
        setSearchTerm('');
        setFilterEstado(FILTRO_ESTADO_DEFECTO);
        setFilterTipo('');
        setFilterSucursal('');
    };

    const changeEstadoMutation = useChangeVehiculoEstado();
    const deleteMutation = useDeleteVehiculo();

    // Descarga el catálogo PDF con los MISMOS filtros/orden que la lista visible
    // ("exportar lo que se está viendo"). Mismo patrón de descarga de blob que la ficha.
    const handleCatalogo = async () => {
        setCatalogando(true);
        try {
            const blob = await vehiculosApi.catalogoPdf(filtros, ordenApi) as unknown as Blob;
            const url = window.URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', 'catalogo-vehiculos.pdf');
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
        } catch {
            addToast('No se pudo generar el catálogo. Probá de nuevo.', 'error');
        } finally {
            setCatalogando(false);
        }
    };

    // Export CSV del stock con el MISMO filtro actual (exporta "lo que se ve").
    const handleExportCsv = async () => {
        setExportando(true);
        try {
            const res = await vehiculosApi.exportCsv(filtros);
            const url = window.URL.createObjectURL(new Blob([res.data], { type: 'text/csv' }));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', 'stock-vehiculos.csv');
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
            // El backend avisa por header si el export se topó con el límite (5000).
            const total = res.headers?.['x-export-truncated'];
            if (total) addToast(`Se exportaron las primeras 5000 unidades de ${total}. Filtrá para acotar el CSV.`, 'info');
        } catch {
            addToast('No se pudo exportar el stock. Probá de nuevo.', 'error');
        } finally {
            setExportando(false);
        }
    };

    const [estadoModal, setEstadoModal] = useState<{ vehiculo: Vehiculo } | null>(null);
    const [nuevoEstado, setNuevoEstado] = useState<EstadoVehiculo | ''>('');

    const handleDelete = async (v: Vehiculo) => {
        await confirm({
            title: 'Dar de baja la unidad',
            message: `¿Dar de baja ${v.marca} ${v.modelo}${v.dominio ? ` (${v.dominio})` : ''}? Deja de aparecer en el stock.`,
            type: 'danger',
            confirmLabel: 'Dar de baja',
            onConfirm: async () => {
                await deleteMutation.mutateAsync(v.id);
                addToast('Unidad dada de baja', 'success');
            }
        });
    };

    const openEstadoModal = (v: Vehiculo) => {
        setEstadoModal({ vehiculo: v });
        setNuevoEstado('');
    };

    const handleCambiarEstado = async () => {
        if (!estadoModal || !nuevoEstado) return;
        try {
            await changeEstadoMutation.mutateAsync({ id: estadoModal.vehiculo.id, estado: nuevoEstado as EstadoVehiculo });
            addToast(`Estado cambiado a "${ESTADO_VEHICULO[nuevoEstado as EstadoVehiculo].label}"`, 'success');
            setEstadoModal(null);
        } catch (err: unknown) {
            const apiError = err as ApiError;
            addToast(apiError?.message || 'No se pudo cambiar el estado', 'error');
        }
    };

    const nombre = (v: Vehiculo) => `${v.marca} ${v.modelo}`;

    const columns: ColumnaListado<Vehiculo>[] = [
        {
            clave: 'vehiculo',
            titulo: 'Vehículo',
            flexible: true,
            tarjeta: 'titulo',
            celda: (v) => (
                <>
                    <span className="listado-principal">{nombre(v)}</span>
                    <span className="listado-secundario">{descripcionVehiculo(v)}</span>
                </>
            ),
        },
        {
            clave: 'anio',
            titulo: 'Año y km',
            celda: (v) => {
                const km = formatKm(v.kmIngreso, v.tipo);
                return (
                    <>
                        <span className="listado-nowrap">{v.anio ?? 'Año sin cargar'}</span>
                        {km && <span className="listado-secundario">{km}</span>}
                    </>
                );
            },
        },
        {
            clave: 'sucursal',
            titulo: 'Sucursal',
            celda: (v) => (
                <span className="listado-principal" style={{ fontWeight: 500, maxWidth: '13ch' }} title={v.sucursal?.nombre}>
                    {v.sucursal?.nombre ?? 'Sin sucursal'}
                </span>
            ),
        },
        {
            clave: 'precio',
            titulo: 'Precio',
            alinear: 'right',
            celda: (v) => (
                v.precioLista
                    ? <span className="listado-nowrap" style={{ fontWeight: 700 }}>{formatMoneda(v.precioLista, v.moneda)}</span>
                    : <span className="text-muted listado-nowrap">Sin precio</span>
            ),
        },
        {
            clave: 'estado',
            titulo: 'Estado',
            celda: (v) => {
                const meta = ESTADO_VEHICULO[v.estado] ?? { label: v.estado, variant: 'default' as const };
                const siguientes = NEXT_ESTADOS[v.estado] ?? [];
                if (siguientes.length === 0) return <Badge variant={meta.variant}>{meta.label}</Badge>;
                return (
                    <button
                        type="button"
                        className="listado-badge-btn"
                        onClick={() => openEstadoModal(v)}
                        aria-label={`Estado: ${meta.label}. Cambiar estado de ${nombre(v)}`}
                    >
                        <Badge variant={meta.variant}>{meta.label}</Badge>
                        <ChevronDown size={12} aria-hidden="true" />
                    </button>
                );
            },
        },
        {
            clave: 'antiguedad',
            titulo: 'En stock',
            alinear: 'right',
            celda: (v) => {
                // Una unidad vendida/devuelta ya no envejece en el stock.
                if (!EN_STOCK.includes(v.estado)) return <span className="text-muted">—</span>;
                const d = diasEnStock(v.fechaIngreso);
                return (
                    <span className="listado-nowrap" style={{ fontWeight: 700, color: TEXTO_ANTIGUEDAD[antiguedadVariant(d)] }}>
                        {d} {d === 1 ? 'día' : 'días'}
                    </span>
                );
            },
        },
        {
            clave: 'acciones',
            titulo: 'Acciones',
            alinear: 'right',
            ancho: '1%',
            tarjeta: 'acciones',
            celda: (v) => (
                <div className="listado-acciones-fila">
                    <button type="button" className="icon-btn" aria-label={`Editar ${nombre(v)}`} title="Editar" onClick={() => navigate(`/vehiculos/${v.id}/editar`)}>
                        <Edit size={14} aria-hidden="true" />
                    </button>
                    <button type="button" className="icon-btn danger" aria-label={`Dar de baja ${nombre(v)}`} title="Dar de baja" onClick={() => handleDelete(v)}>
                        <Trash2 size={14} aria-hidden="true" />
                    </button>
                </div>
            ),
        },
    ];

    const estadoActual = estadoModal ? ESTADO_VEHICULO[estadoModal.vehiculo.estado] : null;

    return (
        <div className="page-container animate-fade-in">
            <PageTitle title="Vehículos" />
            <Listado
                titulo="Vehículos"
                subtitulo="Las unidades de tu concesionaria"
                icono={<Car size={22} />}
                clave="vehiculos"
                tourFiltros="veh-filtros"
                acciones={(
                    <>
                        <Button variant="secondary" className="btn-icono" onClick={() => refetch()} disabled={isFetching} aria-label="Actualizar la lista" title="Actualizar">
                            <RefreshCw size={18} className={isFetching ? 'animate-spin' : ''} aria-hidden="true" />
                        </Button>
                        {/* Catálogo PDF del filtro actual (exporta "lo que se está viendo"). */}
                        <Button data-tour="veh-catalogo" variant="secondary" onClick={handleCatalogo} loading={catalogando} title="Catálogo PDF de las unidades del filtro actual">
                            <FileText size={18} aria-hidden="true" />
                            Catálogo PDF
                        </Button>
                        {/* Export CSV del filtro actual (para Excel/planilla). admin/vendedor. */}
                        {puedeExportar && (
                            <Button variant="secondary" onClick={handleExportCsv} loading={exportando} title="Exportar las unidades del filtro actual a CSV (Excel)">
                                <FileDown size={18} aria-hidden="true" />
                                CSV
                            </Button>
                        )}
                    </>
                )}
                accionPrincipal={(
                    // "Nuevo vehículo" y no "Ingresar vehículo": "Ingresos" es otro ítem
                    // del menú (el registro de cómo entró cada unidad) y el botón se
                    // confundía con él. Además coincide con el título del formulario.
                    <Button data-tour="veh-nuevo" variant="primary" onClick={() => navigate('/vehiculos/nuevo')}>
                        <Plus size={18} aria-hidden="true" />
                        Nuevo vehículo
                    </Button>
                )}
                busqueda={(
                    <BusquedaListado
                        valor={searchTerm}
                        onChange={setSearchTerm}
                        placeholder="Buscar por marca, modelo o dominio"
                    />
                )}
                filtrosActivos={filtrosActivos}
                onLimpiarFiltros={limpiarFiltros}
                resumen={!loading && !isError ? `${totalResults.toLocaleString('es-AR')} ${totalResults === 1 ? 'unidad' : 'unidades'}` : undefined}
                filtros={(
                    <>
                        <CampoFiltro etiqueta="Estado">
                            <select className="form-input" value={filterEstado} onChange={e => setFilterEstado(e.target.value as FiltroEstado)}>
                                <option value="stock">En stock (sin vendidas)</option>
                                <option value="">Todos los estados</option>
                                {(Object.keys(ESTADO_VEHICULO) as EstadoVehiculo[]).map(k => (
                                    <option key={k} value={k}>{ESTADO_VEHICULO[k].label}</option>
                                ))}
                            </select>
                        </CampoFiltro>
                        <CampoFiltro etiqueta="Tipo">
                            <select className="form-input" value={filterTipo} onChange={e => setFilterTipo(e.target.value)}>
                                <option value="">Usados y 0 km</option>
                                <option value="USADO">Usado</option>
                                <option value="CERO_KM">0 km</option>
                            </select>
                        </CampoFiltro>
                        <CampoFiltro etiqueta="Sucursal">
                            <select className="form-input" value={filterSucursal} onChange={e => setFilterSucursal(e.target.value)}>
                                <option value="">Todas las sucursales</option>
                                {sucursales.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                            </select>
                        </CampoFiltro>
                        <CampoFiltro etiqueta="Ordenar por">
                            <select className="form-input" value={orden} onChange={e => setOrden(e.target.value as 'recientes' | 'antiguedad')}>
                                <option value="recientes">Ingreso más reciente</option>
                                <option value="antiguedad">Más tiempo en stock</option>
                            </select>
                        </CampoFiltro>
                    </>
                )}
            >
                <div data-tour="veh-tabla">
                    <ListadoTabla
                        etiqueta="Vehículos"
                        columnas={columns}
                        filas={vehiculos}
                        cargando={loading}
                        error={isError}
                        mensajeError="No se pudieron cargar los vehículos"
                        onReintentar={() => refetch()}
                        hayFiltros={hayFiltros}
                        onLimpiarFiltros={limpiarFiltros}
                        vacio={filterEstado === 'stock'
                            ? {
                                titulo: 'No hay unidades en stock',
                                descripcion: 'Cargá una unidad nueva o mirá también las vendidas.',
                                icono: <Car size={32} aria-hidden="true" />,
                                accion: (
                                    <div className="flex gap-2" style={{ flexWrap: 'wrap', justifyContent: 'center' }}>
                                        <Button variant="secondary" size="sm" onClick={() => setFilterEstado('')}>Ver todas</Button>
                                        <Button variant="primary" size="sm" onClick={() => navigate('/vehiculos/nuevo')}>
                                            <Plus size={16} aria-hidden="true" /> Nuevo vehículo
                                        </Button>
                                    </div>
                                ),
                            }
                            : {
                                titulo: 'Todavía no cargaste vehículos',
                                descripcion: 'Cuando des de alta una unidad, aparece acá.',
                                icono: <Car size={32} aria-hidden="true" />,
                                accion: (
                                    <Button variant="primary" size="sm" onClick={() => navigate('/vehiculos/nuevo')}>
                                        <Plus size={16} aria-hidden="true" /> Nuevo vehículo
                                    </Button>
                                ),
                            }}
                        onFilaClick={(v) => navigate(`/vehiculos/${v.id}`)}
                        etiquetaFila={(v) => `Abrir la ficha de ${nombre(v)}${v.dominio ? `, dominio ${v.dominio}` : ''}`}
                        pagina={page}
                        totalPaginas={totalPages}
                        onPaginaChange={setPage}
                    />
                </div>
            </Listado>

            <Modal
                isOpen={!!estadoModal}
                onClose={() => setEstadoModal(null)}
                title="Cambiar estado"
                subtitle={estadoModal ? `${nombre(estadoModal.vehiculo)}${estadoModal.vehiculo.dominio ? ` · ${estadoModal.vehiculo.dominio}` : ''} · hoy: ${estadoActual?.label ?? ''}` : undefined}
                maxWidth="440px"
                footer={(
                    <>
                        <Button variant="secondary" onClick={() => setEstadoModal(null)}>Cancelar</Button>
                        <Button variant="primary" onClick={handleCambiarEstado} loading={changeEstadoMutation.isPending} disabled={!nuevoEstado}>
                            Guardar
                        </Button>
                    </>
                )}
            >
                {estadoModal && (
                    <Select
                        dense
                        label="Nuevo estado"
                        placeholder="Elegí el nuevo estado"
                        value={nuevoEstado}
                        onChange={e => setNuevoEstado(e.target.value as EstadoVehiculo)}
                    >
                        {NEXT_ESTADOS[estadoModal.vehiculo.estado]?.map((e: EstadoVehiculo) => (
                            <option key={e} value={e}>{ESTADO_VEHICULO[e].label}</option>
                        ))}
                    </Select>
                )}
            </Modal>
        </div>
    );
};

export default VehiculosPage;
