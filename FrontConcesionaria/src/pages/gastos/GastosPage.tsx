import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useGastos, useCreateGasto, useUpdateGasto, useDeleteGasto } from '../../hooks/useGastos';
import { useVehiculos } from '../../hooks/useVehiculos';
import { useSucursales } from '../../hooks/useSucursales';
import { useConfirm } from '../../hooks/useConfirm';
import { useUIStore } from '../../store/uiStore';
import { useDebounce } from '../../hooks/useDebounce';
import { formatFecha, hoyLocal } from '../../utils/fecha';
import { proveedoresApi } from '../../api/proveedores.api';
import type { GastoVehiculo } from '../../api/gastos.api';
import type { ApiError } from '../../types/api.types';

import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Textarea from '../../components/ui/Textarea';
import Modal from '../../components/ui/Modal';
import PageTitle from '../../components/ui/PageTitle';
import { Listado, ListadoTabla, CampoFiltro, BusquedaListado, type ColumnaListado } from '../../components/listado';
import { formatMoneda, formatTotales, totalesPorMoneda } from '../../utils/moneda';

import { Wrench, Plus, Trash2, Edit, RefreshCw, DollarSign } from 'lucide-react';

const EMPTY_GASTO_FORM = {
    vehiculoId: '',
    proveedorId: '',
    monto: '',
    moneda: 'ARS' as 'ARS' | 'USD',
    fechaGasto: hoyLocal(),
    descripcion: '',
};

const GastosPage: React.FC = () => {
    const { addToast } = useUIStore();
    const confirm = useConfirm();

    const [page, setPage] = useState(1);

    // Filters
    const [searchTerm, setSearchTerm] = useState('');
    const debouncedSearch = useDebounce(searchTerm, 500);
    const [filterVehiculo, setFilterVehiculo] = useState('');
    const [filterProveedor, setFilterProveedor] = useState('');
    const [filterSucursal, setFilterSucursal] = useState('');

    // Queries
    const { data: sucursalData = [] } = useSucursales();
    const { data: vehiculoData } = useVehiculos({}, { limit: 1000 });
    // Proveedores: reemplazan a los rubros como clasificación del gasto. Se
    // gestionan en el módulo Proveedores (/proveedores); acá sólo se listan.
    const { data: provPayload } = useQuery({
        queryKey: ['proveedores', 'all'],
        queryFn: () => proveedoresApi.getAll({}, { limit: 1000 }),
    });
    const proveedores = useMemo(() => provPayload?.results || [], [provPayload?.results]);

    const { data: payload, isLoading: loadingGastos, isFetching: fetchingGastos, isError: gastosError, refetch: refetchGastos } = useGastos({
        tipo: 'VEHICULO',
        page,
        limit: 15,
        vehiculoId: filterVehiculo ? Number(filterVehiculo) : undefined,
        proveedorId: filterProveedor ? Number(filterProveedor) : undefined,
        sucursalId: filterSucursal ? Number(filterSucursal) : undefined,
        descripcion: debouncedSearch || undefined
    });

    const gastos = useMemo(() => payload?.results || [], [payload?.results]);
    const totalPages = payload?.totalPages || 1;

    // Mutations
    const createGastoMutation = useCreateGasto();
    const updateGastoMutation = useUpdateGasto();
    const deleteGastoMutation = useDeleteGasto();

    // Modals State
    const [showCreateGasto, setShowCreateGasto] = useState(false);
    const [gastoForm, setGastoForm] = useState({ ...EMPTY_GASTO_FORM });

    const [editGasto, setEditGasto] = useState<GastoVehiculo | null>(null);
    const [editGastoForm, setEditGastoForm] = useState({ monto: '', descripcion: '', fechaGasto: '' });

    // Handlers
    const handleCreateGasto = async () => {
        if (!gastoForm.vehiculoId || !gastoForm.proveedorId || !gastoForm.monto) {
            addToast('Completá unidad, proveedor e importe', 'error');
            return;
        }
        try {
            // La sede del gasto la determina el vehículo: no se envía sucursalId.
            await createGastoMutation.mutateAsync({
                vehiculoId: Number(gastoForm.vehiculoId),
                proveedorId: Number(gastoForm.proveedorId),
                monto: parseFloat(gastoForm.monto),
                moneda: gastoForm.moneda,
                fechaGasto: new Date(gastoForm.fechaGasto).toISOString(),
                descripcion: gastoForm.descripcion,
                tipo: 'VEHICULO'
            });
            addToast('Gasto registrado correctamente', 'success');
            setShowCreateGasto(false);
            setGastoForm({ ...EMPTY_GASTO_FORM });
        } catch (err: unknown) {
            const apiError = err as ApiError;
            addToast(apiError?.message || 'No se pudo registrar el gasto', 'error');
        }
    };

    const handleUpdateGasto = async () => {
        if (!editGasto) return;
        try {
            await updateGastoMutation.mutateAsync({
                id: editGasto.id,
                data: {
                    monto: parseFloat(editGastoForm.monto),
                    descripcion: editGastoForm.descripcion,
                    fechaGasto: new Date(editGastoForm.fechaGasto).toISOString()
                }
            });
            addToast('Gasto actualizado', 'success');
            setEditGasto(null);
        } catch (err: unknown) {
            const apiError = err as ApiError;
            addToast(apiError?.message || 'No se pudo guardar el gasto', 'error');
        }
    };

    const handleDeleteGasto = async (g: GastoVehiculo) => {
        await confirm({
            title: 'Eliminar el gasto',
            message: `¿Eliminar el gasto de ${formatMoneda(g.monto, g.moneda)}${g.vehiculo ? ` de ${g.vehiculo.marca} ${g.vehiculo.modelo}` : ''}? No se puede deshacer.`,
            type: 'danger',
            confirmLabel: 'Eliminar',
            onConfirm: async () => {
                await deleteGastoMutation.mutateAsync(g.id);
                addToast('Gasto eliminado', 'success');
            }
        });
    };

    // Los totales se acumulan por moneda: sumar ARS y USD en un solo número no
    // representa ningún importe real. Es el total de la PÁGINA visible y así se rotula.
    const totalesPagina = useMemo(
        () => totalesPorMoneda(gastos, (g: GastoVehiculo) => g.monto, (g: GastoVehiculo) => g.moneda),
        [gastos],
    );

    const filtrosActivos = [filterVehiculo, filterProveedor, filterSucursal].filter(Boolean).length;
    const hayFiltros = filtrosActivos > 0 || !!debouncedSearch;
    const limpiarFiltros = () => {
        setSearchTerm('');
        setFilterVehiculo('');
        setFilterProveedor('');
        setFilterSucursal('');
        setPage(1);
    };

    const nombreUnidad = (g: GastoVehiculo) =>
        g.vehiculo ? `${g.vehiculo.marca} ${g.vehiculo.modelo}` : 'Unidad sin datos';

    const abrirEdicion = (g: GastoVehiculo) => {
        setEditGasto(g);
        setEditGastoForm({
            monto: String(g.monto),
            descripcion: g.descripcion || '',
            fechaGasto: g.fechaGasto.split('T')[0]
        });
    };

    const gastoColumns: ColumnaListado<GastoVehiculo>[] = [
        {
            clave: 'unidad',
            titulo: 'Unidad',
            flexible: true,
            tarjeta: 'titulo',
            celda: (g) => (
                <>
                    <span className="listado-principal">{nombreUnidad(g)}</span>
                    <span className="listado-secundario">{g.descripcion || g.vehiculo?.dominio || 'Sin descripción'}</span>
                </>
            )
        },
        {
            clave: 'proveedor',
            titulo: 'Proveedor',
            // Nuevo criterio: se clasifica por proveedor. Los gastos viejos no
            // tienen proveedor pero sí rubro → se muestra como fallback.
            celda: (g) => (
                <span className="listado-nowrap">
                    {g.proveedor?.nombre ?? g.categoria?.nombre ?? <span className="text-muted">Sin proveedor</span>}
                </span>
            )
        },
        {
            clave: 'fecha',
            titulo: 'Fecha',
            celda: (g) => <span className="listado-nowrap">{formatFecha(g.fechaGasto)}</span>
        },
        {
            clave: 'sucursal',
            titulo: 'Sucursal',
            celda: (g) => <span className="listado-nowrap">{g.sucursal?.nombre ?? 'Sin sucursal'}</span>
        },
        {
            clave: 'monto',
            titulo: 'Importe',
            alinear: 'right',
            celda: (g) => <span className="listado-nowrap" style={{ fontWeight: 700 }}>{formatMoneda(g.monto, g.moneda)}</span>
        },
        {
            clave: 'acciones',
            titulo: 'Acciones',
            alinear: 'right',
            ancho: '1%',
            tarjeta: 'acciones',
            celda: (g) => (
                <div className="listado-acciones-fila">
                    <button type="button" className="icon-btn" onClick={() => abrirEdicion(g)} aria-label={`Editar el gasto de ${nombreUnidad(g)}`} title="Editar">
                        <Edit size={14} aria-hidden="true" />
                    </button>
                    <button type="button" className="icon-btn danger" onClick={() => handleDeleteGasto(g)} aria-label={`Eliminar el gasto de ${nombreUnidad(g)}`} title="Eliminar">
                        <Trash2 size={14} aria-hidden="true" />
                    </button>
                </div>
            )
        }
    ];

    const registrarGasto = (
        <Button variant="primary" onClick={() => setShowCreateGasto(true)}>
            <Plus size={18} aria-hidden="true" /> Registrar gasto
        </Button>
    );

    return (
        <div className="page-container animate-fade-in">
            <PageTitle title="Gastos de unidades" />
            <Listado
                titulo="Gastos de unidades"
                subtitulo="Lo que gastás en cada unidad: taller, papeles, puesta a punto"
                icono={<Wrench size={22} />}
                clave="gastos"
                acciones={(
                    <Button variant="secondary" className="btn-icono" onClick={() => refetchGastos()} disabled={fetchingGastos} aria-label="Actualizar la lista" title="Actualizar">
                        <RefreshCw size={18} className={fetchingGastos ? 'animate-spin' : ''} aria-hidden="true" />
                    </Button>
                )}
                accionPrincipal={registrarGasto}
                busqueda={(
                    <BusquedaListado
                        valor={searchTerm}
                        onChange={(v) => { setSearchTerm(v); setPage(1); }}
                        placeholder="Buscar en la descripción"
                    />
                )}
                filtrosActivos={filtrosActivos}
                onLimpiarFiltros={limpiarFiltros}
                resumen={!loadingGastos && !gastosError && gastos.length > 0
                    ? <span title="Suma de los gastos que se ven en esta página, separada por moneda">En esta página: {formatTotales(totalesPagina)}</span>
                    : undefined}
                filtros={(
                    <>
                        <CampoFiltro etiqueta="Unidad">
                            <select className="form-input" value={filterVehiculo} onChange={e => { setFilterVehiculo(e.target.value); setPage(1); }}>
                                <option value="">Todas las unidades</option>
                                {vehiculoData?.results?.map(v => (
                                    <option key={v.id} value={v.id}>{v.marca} {v.modelo}{v.dominio ? ` (${v.dominio})` : ''}</option>
                                ))}
                            </select>
                        </CampoFiltro>
                        <CampoFiltro etiqueta="Proveedor">
                            <select className="form-input" value={filterProveedor} onChange={e => { setFilterProveedor(e.target.value); setPage(1); }}>
                                <option value="">Todos los proveedores</option>
                                {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                            </select>
                        </CampoFiltro>
                        <CampoFiltro etiqueta="Sucursal">
                            <select className="form-input" value={filterSucursal} onChange={e => { setFilterSucursal(e.target.value); setPage(1); }}>
                                <option value="">Todas las sucursales</option>
                                {sucursalData.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                            </select>
                        </CampoFiltro>
                    </>
                )}
            >
                <ListadoTabla
                    etiqueta="Gastos de unidades"
                    columnas={gastoColumns}
                    filas={gastos}
                    cargando={loadingGastos}
                    error={gastosError}
                    mensajeError="No se pudieron cargar los gastos"
                    onReintentar={() => refetchGastos()}
                    hayFiltros={hayFiltros}
                    onLimpiarFiltros={limpiarFiltros}
                    vacio={{
                        titulo: 'Todavía no registraste gastos',
                        descripcion: 'Anotá lo que gastás en cada unidad para saber cuánto te costó ponerla a la venta.',
                        icono: <Wrench size={32} aria-hidden="true" />,
                        accion: registrarGasto,
                    }}
                    pagina={page}
                    totalPaginas={totalPages}
                    onPaginaChange={setPage}
                />
            </Listado>

            {/* Modal Gasto */}
            <Modal
                isOpen={showCreateGasto || !!editGasto}
                onClose={() => { setShowCreateGasto(false); setEditGasto(null); }}
                title={editGasto ? 'Editar gasto' : 'Nuevo gasto'}
                maxWidth="600px"
            >
                <div>
                    {!editGasto && (
                        <>
                            <Select
                                dense
                                label="Unidad *"
                                placeholder="Elegí la unidad"
                                value={gastoForm.vehiculoId}
                                onChange={e => setGastoForm(f => ({ ...f, vehiculoId: e.target.value }))}
                            >
                                {vehiculoData?.results?.map(v => (
                                    <option key={v.id} value={v.id}>{v.marca} {v.modelo}{v.dominio ? ` (${v.dominio})` : ''}</option>
                                ))}
                            </Select>

                            <Select
                                dense
                                label="Proveedor *"
                                placeholder="Elegí el proveedor"
                                hint={proveedores.length === 0 ? 'No hay proveedores cargados. Agregalos en la sección Proveedores.' : undefined}
                                value={gastoForm.proveedorId}
                                onChange={e => setGastoForm(f => ({ ...f, proveedorId: e.target.value }))}
                            >
                                {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                            </Select>
                        </>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                        <Input
                            dense
                            label="Importe *"
                            icon={<DollarSign size={16} aria-hidden="true" />}
                            type="number"
                            inputMode="decimal"
                            value={editGasto ? editGastoForm.monto : gastoForm.monto}
                            onChange={e => editGasto ? setEditGastoForm(f => ({ ...f, monto: e.target.value })) : setGastoForm(f => ({ ...f, monto: e.target.value }))}
                        />
                        {!editGasto && (
                            <Select
                                dense
                                label="Moneda *"
                                value={gastoForm.moneda}
                                onChange={e => setGastoForm(f => ({ ...f, moneda: e.target.value as 'ARS' | 'USD' }))}
                            >
                                <option value="ARS">Pesos (ARS)</option>
                                <option value="USD">Dólares (USD)</option>
                            </Select>
                        )}
                        <Input
                            dense
                            label="Fecha *"
                            type="date"
                            value={editGasto ? editGastoForm.fechaGasto : gastoForm.fechaGasto}
                            onChange={e => editGasto ? setEditGastoForm(f => ({ ...f, fechaGasto: e.target.value })) : setGastoForm(f => ({ ...f, fechaGasto: e.target.value }))}
                        />
                    </div>

                    <Textarea
                        dense
                        label="Descripción"
                        placeholder="Ej: cambio de aceite y filtros"
                        value={editGasto ? editGastoForm.descripcion : gastoForm.descripcion}
                        onChange={e => editGasto ? setEditGastoForm(f => ({ ...f, descripcion: e.target.value })) : setGastoForm(f => ({ ...f, descripcion: e.target.value }))}
                    />

                    <div className="form-actions">
                        <Button variant="secondary" onClick={() => { setShowCreateGasto(false); setEditGasto(null); }}>Cancelar</Button>
                        <Button
                            variant="primary"
                            onClick={editGasto ? handleUpdateGasto : handleCreateGasto}
                            loading={createGastoMutation.isPending || updateGastoMutation.isPending}
                        >
                            {editGasto ? 'Guardar' : 'Registrar gasto'}
                        </Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};

export default GastosPage;
