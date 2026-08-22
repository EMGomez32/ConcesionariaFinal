import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useVehiculos, useChangeVehiculoEstado, useDeleteVehiculo } from '../../hooks/useVehiculos';
import { vehiculosApi } from '../../api/vehiculos.api';
import { useSucursales } from '../../hooks/useSucursales';
import { useConfirm } from '../../hooks/useConfirm';
import { useDebounce } from '../../hooks/useDebounce';
import type { Vehiculo, EstadoVehiculo, TipoVehiculo } from '../../types/vehiculo.types';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import { useUIStore } from '../../store/uiStore';
import { useAuthStore } from '../../store/authStore';
import {
    Plus, Search, Edit, Trash2,
    RefreshCw, Car, ChevronDown, Calendar, Database, MapPin, DollarSign, FileText, FileDown
} from 'lucide-react';
import Modal from '../../components/ui/Modal';
import DataTable, { type Column } from '../../components/ui/DataTable';
import PageTitle from '../../components/ui/PageTitle';
import type { ApiError } from '../../types/api.types';

const STATUS_MAP: Record<EstadoVehiculo, { label: string; variant: 'warning' | 'success' | 'info' | 'default' | 'danger' }> = {
    preparacion: { label: 'En Preparación', variant: 'warning' },
    publicado: { label: 'Publicado', variant: 'success' },
    reservado: { label: 'Reservado', variant: 'info' },
    vendido: { label: 'Vendido', variant: 'default' },
    devuelto: { label: 'Devuelto', variant: 'danger' },
};

const NEXT_ESTADOS: Record<EstadoVehiculo, EstadoVehiculo[]> = {
    preparacion: ['publicado'],
    publicado: ['preparacion', 'reservado'],
    reservado: ['publicado', 'vendido'],
    vendido: ['devuelto'],
    devuelto: ['preparacion', 'publicado'],
};

// La antigüedad sólo cuenta para unidades EN stock: una vendida o devuelta ya
// no envejece en el parque.
const EN_STOCK: EstadoVehiculo[] = ['preparacion', 'publicado', 'reservado'];

/** Días desde el ingreso a stock (fechaIngreso llega como ISO/'YYYY-MM-DD'). */
const diasEnStock = (fechaIngreso: string): number => {
    const ingreso = new Date(fechaIngreso);
    if (isNaN(ingreso.getTime())) return 0;
    return Math.max(0, Math.floor((Date.now() - ingreso.getTime()) / 86400000));
};

/** Color del badge según antigüedad: verde fresco → rojo estancado. */
const antiguedadVariant = (dias: number): 'success' | 'info' | 'warning' | 'danger' =>
    dias > 90 ? 'danger' : dias > 60 ? 'warning' : dias > 30 ? 'info' : 'success';

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
    const [filterEstado, setFilterEstado] = useState('');
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

    const { data: payload, isLoading: loading, refetch } = useVehiculos({
        search: debouncedSearch || undefined,
        estado: filterEstado ? (filterEstado as EstadoVehiculo) : undefined,
        tipo: filterTipo ? (filterTipo as TipoVehiculo) : undefined,
        sucursalId: filterSucursal ? Number(filterSucursal) : undefined,
    }, {
        page,
        limit: 10,
        // "Antigüedad" = los que más tiempo llevan en stock primero (ingreso más
        // viejo). Así la página 1 muestra las unidades a priorizar/repreciar.
        ...(orden === 'antiguedad'
            ? { sortBy: 'fechaIngreso', sortOrder: 'asc' as const }
            : { sortBy: 'createdAt', sortOrder: 'desc' as const }),
    });

    const vehiculos = payload?.results || [];
    const totalPages = payload?.totalPages || 1;

    const changeEstadoMutation = useChangeVehiculoEstado();
    const deleteMutation = useDeleteVehiculo();

    // Descarga el catálogo PDF con los MISMOS filtros/orden que la lista visible
    // ("exportar lo que se está viendo"). Mismo patrón de descarga de blob que la ficha.
    const handleCatalogo = async () => {
        setCatalogando(true);
        try {
            const blob = await vehiculosApi.catalogoPdf({
                search: debouncedSearch || undefined,
                estado: filterEstado ? (filterEstado as EstadoVehiculo) : undefined,
                tipo: filterTipo ? (filterTipo as TipoVehiculo) : undefined,
                sucursalId: filterSucursal ? Number(filterSucursal) : undefined,
            }, orden === 'antiguedad'
                ? { sortBy: 'fechaIngreso', sortOrder: 'asc' }
                : { sortBy: 'createdAt', sortOrder: 'desc' }) as unknown as Blob;
            const url = window.URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', 'catalogo-vehiculos.pdf');
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
        } catch {
            addToast('Error al generar el catálogo', 'error');
        } finally {
            setCatalogando(false);
        }
    };

    // Export CSV del stock con el MISMO filtro actual (exporta "lo que se ve").
    const handleExportCsv = async () => {
        setExportando(true);
        try {
            const res = await vehiculosApi.exportCsv({
                search: debouncedSearch || undefined,
                estado: filterEstado ? (filterEstado as EstadoVehiculo) : undefined,
                tipo: filterTipo ? (filterTipo as TipoVehiculo) : undefined,
                sucursalId: filterSucursal ? Number(filterSucursal) : undefined,
            });
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
            addToast('Error al exportar el stock', 'error');
        } finally {
            setExportando(false);
        }
    };

    const [estadoModal, setEstadoModal] = useState<{ vehiculo: Vehiculo } | null>(null);
    const [nuevoEstado, setNuevoEstado] = useState<EstadoVehiculo | ''>('');

    const handleDelete = async (v: Vehiculo) => {
        await confirm({
            title: 'Baja de Unidad',
            message: `¿Desea retirar permanentemente el vehículo ${v.marca} ${v.modelo} [${v.dominio || 'S/D'}] del stock operativo?`,
            type: 'danger',
            confirmLabel: 'Confirmar Baja',
            onConfirm: async () => {
                await deleteMutation.mutateAsync(v.id);
                addToast('Vehículo eliminado del stock', 'success');
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
            addToast(`Estado cambiado a "${STATUS_MAP[nuevoEstado as EstadoVehiculo].label}"`, 'success');
            setEstadoModal(null);
        } catch (err: unknown) {
            const apiError = err as ApiError;
            addToast(apiError?.message || 'Error al cambiar estado', 'error');
        }
    };

    const columns: Column<Vehiculo>[] = [
        {
            header: 'Vehículo',
            accessor: (v) => (
                <div className="flex flex-col">
                    <div className="flex items-center gap-2 mb-1">
                        <span className="text-3xs font-black">
                            {v.dominio || 'SIN DOMINIO'}
                        </span>
                        <span className={`text-3xs font-black uppercase ${v.tipo === 'CERO_KM' ? 'text-warning' : 'text-muted'}`}>
                            {v.tipo === 'CERO_KM' ? '0 KM' : 'Usado'}
                        </span>
                    </div>
                    <span className="font-bold uppercase">{v.marca} {v.modelo}</span>
                    <span className="text-3xs text-muted uppercase font-bold">{v.version || '-'}</span>
                </div>
            )
        },
        {
            header: 'Info',
            accessor: (v) => (
                <div className="flex flex-col gap-1 text-muted">
                    <div className="flex items-center gap-2">
                        <Calendar size={12} className="text-accent" />
                        <span className="text-2xs font-bold uppercase">{v.anio || 'S/A'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <Database size={12} className="text-accent" />
                        <span className="text-2xs font-bold">{v.kmIngreso ? `${v.kmIngreso.toLocaleString()} KM` : '0 KM'}</span>
                    </div>
                </div>
            )
        },
        {
            header: 'Ubicación',
            accessor: (v) => (
                <div className="flex items-center gap-2 text-muted">
                    <MapPin size={14} className="text-accent" />
                    <span className="text-xs font-bold truncate">{v.sucursal?.nombre || 'Sede Central'}</span>
                </div>
            )
        },
        {
            header: 'Precio',
            accessor: (v) => (
                <div className="flex items-center gap-1">
                    <DollarSign size={14} className="text-accent" />
                    <span className="text-sm font-black italic">
                        {v.precioLista
                            ? `${v.moneda === 'USD' ? 'US$' : '$'}${Number(v.precioLista).toLocaleString('es-AR')}`
                            : '-'}
                    </span>
                </div>
            )
        },
        {
            header: 'Estado',
            accessor: (v) => (
                <div className="flex items-center gap-2" onClick={(e) => { e.stopPropagation(); openEstadoModal(v); }}>
                    <Badge variant={STATUS_MAP[v.estado].variant}>{STATUS_MAP[v.estado].label}</Badge>
                    <ChevronDown size={14} className="text-secondary" />
                </div>
            )
        },
        {
            header: 'Antigüedad',
            accessor: (v) => {
                // Una unidad vendida/devuelta ya no envejece: se muestra "—".
                if (!EN_STOCK.includes(v.estado)) return <span className="text-secondary text-xs">—</span>;
                const d = diasEnStock(v.fechaIngreso);
                return <Badge variant={antiguedadVariant(d)}>{d} {d === 1 ? 'día' : 'días'}</Badge>;
            }
        },
        {
            header: 'Acciones',
            align: 'right',
            accessor: (v) => (
                <div className="flex gap-2 justify-end">
                    <button className="icon-btn small" title="Editar" onClick={(e) => { e.stopPropagation(); navigate(`/vehiculos/${v.id}/editar`); }}>
                        <Edit size={14} />
                    </button>
                    <button className="icon-btn small danger" title="Dar de baja" onClick={(e) => { e.stopPropagation(); handleDelete(v); }}>
                        <Trash2 size={14} />
                    </button>
                </div>
            )
        }
    ];

    return (
        <div className="page-container animate-fade-in">
            <PageTitle title="Vehículos" />
            <header className="page-header">
                <div className="header-title">
                    <div className="flex items-center gap-3 mb-1">
                        <div className="icon-badge primary shadow-glow">
                            <Car size={22} />
                        </div>
                        <h1>Parque de Unidades</h1>
                    </div>
                    <p>Gestión estratégica de inventario, disponibilidad y logística interna.</p>
                </div>
                <div className="flex gap-3">
                    <Button variant="secondary" onClick={() => refetch()} disabled={loading}>
                        <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
                    </Button>
                    {/* Catálogo PDF del filtro actual (exporta "lo que se está viendo"). */}
                    <Button data-tour="veh-catalogo" variant="secondary" onClick={handleCatalogo} loading={catalogando} title="Catálogo PDF de los vehículos del filtro actual">
                        <FileText size={18} />
                        Catálogo PDF
                    </Button>
                    {/* Export CSV del filtro actual (para Excel/planilla). admin/vendedor. */}
                    {puedeExportar && (
                        <Button variant="secondary" onClick={handleExportCsv} loading={exportando} title="Exportar el stock filtrado a CSV (Excel)">
                            <FileDown size={18} />
                            CSV
                        </Button>
                    )}
                    <Button data-tour="veh-nuevo" variant="primary" onClick={() => navigate('/vehiculos/nuevo')}>
                        <Plus size={18} />
                        Ingresar Vehículo
                    </Button>
                </div>
            </header>

            <div className="filters-bar" data-tour="veh-filtros">
                <div className="filter-group">
                    <label className="filter-label">Buscar</label>
                    <div className="search-box">
                        <Search size={16} className="text-muted" />
                        <input
                            type="text"
                            placeholder="Marca, modelo, dominio..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>

                <div className="filter-group">
                    <label className="filter-label">Estado</label>
                    <select className="form-input" value={filterEstado} onChange={e => setFilterEstado(e.target.value)}>
                        <option value="">Todos los estados</option>
                        {(Object.keys(STATUS_MAP) as EstadoVehiculo[]).map(k => (
                            <option key={k} value={k}>{STATUS_MAP[k].label}</option>
                        ))}
                    </select>
                </div>

                <div className="filter-group">
                    <label className="filter-label">Tipo</label>
                    <select className="form-input" value={filterTipo} onChange={e => setFilterTipo(e.target.value)}>
                        <option value="">Todos los tipos</option>
                        <option value="USADO">Usado</option>
                        <option value="CERO_KM">0 KM</option>
                    </select>
                </div>

                <div className="filter-group">
                    <label className="filter-label">Sucursal</label>
                    <select className="form-input" value={filterSucursal} onChange={e => setFilterSucursal(e.target.value)}>
                        <option value="">Todas las sedes</option>
                        {sucursales.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                    </select>
                </div>

                <div className="filter-group">
                    <label className="filter-label">Ordenar por</label>
                    <select className="form-input" value={orden} onChange={e => setOrden(e.target.value as 'recientes' | 'antiguedad')}>
                        <option value="recientes">Ingreso reciente</option>
                        <option value="antiguedad">Antigüedad en stock</option>
                    </select>
                </div>
            </div>

            <div data-tour="veh-tabla">
            <DataTable
                columns={columns}
                data={vehiculos}
                isLoading={loading}
                emptyMessage="No se detectaron unidades registradas"
                emptyIcon={<Car size={48} />}
                currentPage={page}
                totalPages={totalPages}
                onPageChange={setPage}
                onRowClick={(v) => navigate(`/vehiculos/${v.id}`)}
            />
            </div>

            {/* Modales Reutilizados */}
            <Modal
                isOpen={!!estadoModal}
                onClose={() => setEstadoModal(null)}
                title="Ciclo de Vida de Unidad"
                maxWidth="440px"
            >
                {estadoModal && (
                    <div>
                        <div className="p-4">
                            <h4 className="text-sm font-black uppercase tracking-tight">{estadoModal.vehiculo.marca} {estadoModal.vehiculo.modelo}</h4>
                            <p className="text-3xs font-mono text-accent">ID REGISTRO: #{estadoModal.vehiculo.id.toString().padStart(5, '0')}</p>
                        </div>
                        <div>
                            <label className="text-sm font-bold text-muted">Transicionar a la siguiente fase:</label>
                            <select
                                className="w-full p-4"
                                value={nuevoEstado}
                                onChange={e => setNuevoEstado(e.target.value as EstadoVehiculo)}
                            >
                                <option value="">Seleccionar nuevo estado...</option>
                                {NEXT_ESTADOS[estadoModal.vehiculo.estado as EstadoVehiculo]?.map((e: EstadoVehiculo) => (
                                    <option key={e} value={e}>{STATUS_MAP[e].label}</option>
                                ))}
                            </select>
                        </div>
                        <div className="form-actions">
                            <Button variant="secondary" onClick={() => setEstadoModal(null)}>Cancelar</Button>
                            <Button variant="primary" onClick={handleCambiarEstado} loading={changeEstadoMutation.isPending} disabled={!nuevoEstado}>
                                Confirmar Cambio
                            </Button>
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
};

export default VehiculosPage;
