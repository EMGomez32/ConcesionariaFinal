import { useState, type ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { vehiculoIngresosApi, type IngresoVehiculo, type TipoIngreso } from '../../api/vehiculo-ingresos.api';
import { useVehiculos } from '../../hooks/useVehiculos';
import { useSucursales } from '../../hooks/useSucursales';
import { useConfirm } from '../../hooks/useConfirm';
import { useUIStore } from '../../store/uiStore';
import Badge, { type BadgeVariant } from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import PageTitle from '../../components/ui/PageTitle';
import { Listado, ListadoTabla, CampoFiltro, type ColumnaListado } from '../../components/listado';
import { Plus, Trash2, RefreshCw, LogIn } from 'lucide-react';
import { usePermisos } from '../../hooks/usePermisos';
import { getErrorMessage } from '../../utils/getErrorMessage';
import { formatFecha } from '../../utils/fecha';
import { formatMoneda } from '../../utils/moneda';
import { getList } from '../../utils/lista';
import { extractPaginatedData } from '../../utils/apiHelpers';
import { descripcionVehiculo } from '../vehiculos/vehiculoTextos';

const TIPO_INGRESO: Record<TipoIngreso, { label: string; variant: BadgeVariant }> = {
    compra_proveedor: { label: 'Compra a proveedor', variant: 'info' },
    compra_particular: { label: 'Compra a particular', variant: 'success' },
    permuta: { label: 'Permuta', variant: 'warning' },
    consignacion: { label: 'Consignación', variant: 'default' },
    otro: { label: 'Otro', variant: 'default' },
};

const tipoLabel = (tipo: string) => TIPO_INGRESO[tipo as TipoIngreso]?.label ?? 'Otro';

const LIMIT = 15;

const IngresosPage = () => {
    const { addToast } = useUIStore();
    const navigate = useNavigate();
    const confirm = useConfirm();
    const queryClient = useQueryClient();
    // Anular un ingreso es del admin (borra el acta con su monto de compra); darlo
    // de alta es de admin/vendedor. Ver hooks/usePermisos.ts.
    const permisos = usePermisos();

    const [page, setPage] = useState(1);
    const [filterSucursal, setFilterSucursal] = useState('');
    const [filterTipo, setFilterTipo] = useState('');
    const [filterVehiculo, setFilterVehiculo] = useState('');

    // Catálogos de los filtros. Antes un helper local leía `.data` de la respuesta,
    // pero el interceptor de axios ya la desenvuelve: vehículos llega como
    // { results } y el filtro "Unidad" quedaba siempre vacío. Los hooks y
    // `getList` cubren todas las formas.
    const { data: sucursales = [] } = useSucursales();
    const { data: vehiculosPayload } = useVehiculos({}, { limit: 1000 });
    const vehiculos = getList<{ id: number; marca: string; modelo: string; dominio?: string }>(vehiculosPayload);

    const params = {
        page,
        limit: LIMIT,
        sucursalId: filterSucursal ? Number(filterSucursal) : undefined,
        tipoIngreso: filterTipo ? (filterTipo as TipoIngreso) : undefined,
        vehiculoId: filterVehiculo ? Number(filterVehiculo) : undefined,
    };
    const { data, isLoading, isFetching, isError, refetch } = useQuery({
        queryKey: ['vehiculo-ingresos', 'list', params],
        queryFn: async () => extractPaginatedData<IngresoVehiculo>(await vehiculoIngresosApi.getAll(params)),
        placeholderData: keepPreviousData,
    });
    const ingresos = data?.results ?? [];
    const totalPages = data?.totalPages ?? 1;
    const totalResults = data?.totalResults ?? 0;

    const filtrosActivos = [filterSucursal, filterTipo, filterVehiculo].filter(Boolean).length;
    const limpiarFiltros = () => {
        setFilterSucursal('');
        setFilterTipo('');
        setFilterVehiculo('');
        setPage(1);
    };
    const cambiarFiltro = (set: (v: string) => void) => (e: ChangeEvent<HTMLSelectElement>) => {
        set(e.target.value);
        setPage(1);
    };

    const nombreUnidad = (i: IngresoVehiculo) =>
        i.vehiculo ? `${i.vehiculo.marca} ${i.vehiculo.modelo}` : `Unidad #${i.vehiculoId}`;

    const handleDelete = (i: IngresoVehiculo) => confirm({
        title: 'Anular el ingreso',
        message: `¿Anular el ingreso de ${nombreUnidad(i)}${i.vehiculo?.dominio ? ` (${i.vehiculo.dominio})` : ''}? Se borra el registro de cómo entró la unidad y su valor de compra. La unidad no se modifica.`,
        type: 'danger',
        confirmLabel: 'Anular ingreso',
        onConfirm: async () => {
            try {
                await vehiculoIngresosApi.delete(i.id);
                addToast('Ingreso anulado', 'success');
                queryClient.invalidateQueries({ queryKey: ['vehiculo-ingresos'] });
            } catch (err) {
                // El interceptor rechaza con el body ya desempaquetado: el motivo real
                // del backend (p.ej. "no tenés permiso") viaja en `err.message`.
                addToast(getErrorMessage(err, 'No se pudo anular el ingreso'), 'error');
                throw err;
            }
        },
    });

    const columnas: ColumnaListado<IngresoVehiculo>[] = [
        {
            clave: 'unidad',
            titulo: 'Unidad',
            flexible: true,
            tarjeta: 'titulo',
            celda: (i) => (
                <>
                    <span className="listado-principal">{nombreUnidad(i)}</span>
                    <span className="listado-secundario">{i.vehiculo ? descripcionVehiculo(i.vehiculo) : 'Sin datos de la unidad'}</span>
                </>
            ),
        },
        {
            clave: 'tipo',
            titulo: 'Cómo ingresó',
            celda: (i) => <Badge variant={TIPO_INGRESO[i.tipoIngreso]?.variant ?? 'default'}>{tipoLabel(i.tipoIngreso)}</Badge>,
        },
        {
            clave: 'sucursal',
            titulo: 'Sucursal',
            celda: (i) => <span className="listado-nowrap">{i.sucursal?.nombre ?? 'Sin sucursal'}</span>,
        },
        {
            clave: 'fecha',
            titulo: 'Fecha',
            celda: (i) => <span className="listado-nowrap">{formatFecha(i.fechaIngreso)}</span>,
        },
        // En un ingreso por compra, este importe ES el precio de compra de la
        // unidad: el backend se lo recorta a quien no sea admin, así que la columna
        // se esconde en vez de quedar mostrando $0 a media concesionaria.
        ...(permisos.veValorDeIngreso ? [{
            clave: 'valor',
            titulo: 'Valor de compra',
            alinear: 'right' as const,
            celda: (i: IngresoVehiculo) => (
                i.valorTomado
                    ? <span className="listado-nowrap" style={{ fontWeight: 700 }}>{formatMoneda(i.valorTomado, i.vehiculo?.moneda)}</span>
                    : <span className="text-muted listado-nowrap">Sin valor</span>
            ),
        }] : []),
        {
            clave: 'origen',
            titulo: 'De quién',
            celda: (i) => {
                const nombre = i.clienteOrigen?.nombre ?? i.proveedorOrigen?.nombre;
                if (!nombre) return <span className="text-muted">Sin dato</span>;
                return (
                    <>
                        <span className="listado-principal" style={{ fontWeight: 500, maxWidth: '18ch' }}>{nombre}</span>
                        <span className="listado-secundario">{i.clienteOrigen ? 'Cliente' : 'Proveedor'}</span>
                    </>
                );
            },
        },
        ...(permisos.ingresosAnular ? [{
            clave: 'acciones',
            titulo: 'Acciones',
            alinear: 'right' as const,
            ancho: '1%',
            tarjeta: 'acciones' as const,
            celda: (i: IngresoVehiculo) => (
                <div className="listado-acciones-fila">
                    <button type="button" className="icon-btn danger" onClick={() => handleDelete(i)} aria-label={`Anular el ingreso de ${nombreUnidad(i)}`} title="Anular ingreso">
                        <Trash2 size={14} aria-hidden="true" />
                    </button>
                </div>
            ),
        }] : []),
    ];

    const nuevoVehiculo = permisos.ingresosCrear ? (
        <Button variant="primary" onClick={() => navigate('/vehiculos/nuevo')}>
            <Plus size={18} aria-hidden="true" /> Nuevo vehículo
        </Button>
    ) : undefined;

    return (
        <div className="page-container animate-fade-in">
            <PageTitle title="Ingresos" />
            <Listado
                titulo="Ingresos"
                subtitulo="Cómo entró cada unidad al stock: compra, permuta o consignación"
                icono={<LogIn size={22} />}
                clave="ingresos"
                acciones={(
                    <Button variant="secondary" className="btn-icono" onClick={() => refetch()} disabled={isFetching} aria-label="Actualizar la lista" title="Actualizar">
                        <RefreshCw size={18} className={isFetching ? 'animate-spin' : ''} aria-hidden="true" />
                    </Button>
                )}
                accionPrincipal={nuevoVehiculo}
                filtrosActivos={filtrosActivos}
                onLimpiarFiltros={limpiarFiltros}
                resumen={!isLoading && !isError ? `${totalResults} ${totalResults === 1 ? 'ingreso' : 'ingresos'}` : undefined}
                filtros={(
                    <>
                        <CampoFiltro etiqueta="Cómo ingresó">
                            <select className="form-input" value={filterTipo} onChange={cambiarFiltro(setFilterTipo)}>
                                <option value="">Todos</option>
                                {(Object.keys(TIPO_INGRESO) as TipoIngreso[]).map(t => <option key={t} value={t}>{TIPO_INGRESO[t].label}</option>)}
                            </select>
                        </CampoFiltro>
                        <CampoFiltro etiqueta="Sucursal">
                            <select className="form-input" value={filterSucursal} onChange={cambiarFiltro(setFilterSucursal)}>
                                <option value="">Todas las sucursales</option>
                                {sucursales.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                            </select>
                        </CampoFiltro>
                        <CampoFiltro etiqueta="Unidad">
                            <select className="form-input" value={filterVehiculo} onChange={cambiarFiltro(setFilterVehiculo)}>
                                <option value="">Todas las unidades</option>
                                {vehiculos.map(v => <option key={v.id} value={v.id}>{`${v.marca} ${v.modelo}${v.dominio ? ` (${v.dominio})` : ''}`}</option>)}
                            </select>
                        </CampoFiltro>
                    </>
                )}
            >
                <ListadoTabla
                    etiqueta="Ingresos"
                    columnas={columnas}
                    filas={ingresos}
                    cargando={isLoading}
                    error={isError}
                    mensajeError="No se pudieron cargar los ingresos"
                    onReintentar={() => refetch()}
                    hayFiltros={filtrosActivos > 0}
                    onLimpiarFiltros={limpiarFiltros}
                    vacio={{
                        titulo: 'Todavía no hay ingresos',
                        descripcion: 'Cada vez que das de alta una unidad queda registrado acá cómo entró al stock.',
                        icono: <LogIn size={32} aria-hidden="true" />,
                        accion: nuevoVehiculo,
                    }}
                    onFilaClick={(i) => navigate(`/vehiculos/${i.vehiculoId}`)}
                    etiquetaFila={(i) => `Abrir la ficha de ${nombreUnidad(i)}`}
                    pagina={page}
                    totalPaginas={totalPages}
                    onPaginaChange={setPage}
                />
            </Listado>
        </div>
    );
};

export default IngresosPage;
