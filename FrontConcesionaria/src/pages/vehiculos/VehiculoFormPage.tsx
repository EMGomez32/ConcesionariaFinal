import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { vehiculosApi } from '../../api/vehiculos.api';
import { sucursalesApi } from '../../api/sucursales.api';
import { proveedoresApi } from '../../api/proveedores.api';
import { clientesApi } from '../../api/clientes.api';
import type { Vehiculo } from '../../types/vehiculo.types';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import PageTitle from '../../components/ui/PageTitle';
import { useAuthStore } from '../../store/authStore';
import { useUIStore } from '../../store/uiStore';
import { getList } from '../../utils/lista';
import { getErrorMessage } from '../../utils/getErrorMessage';
import { hoyLocal } from '../../utils/fecha';
import { AlertCircle, ArrowLeft, Save } from 'lucide-react';

type Opt = { value: number; label: string };

// Campos que el backend puede rechazar por validación y que tienen un control
// en este formulario: el error se muestra junto al campo.
const CAMPOS_FORM = new Set<string>([
    'tipo', 'origen', 'marca', 'modelo', 'version', 'anio', 'dominio', 'kmIngreso',
    'estado', 'sucursalId', 'color', 'fechaIngreso', 'moneda', 'precioLista', 'precioCompra',
    'vencimientoVtv', 'vencimientoSeguro', 'proveedorCompraId', 'clienteOrigenId',
]);

// Los obligatorios llevan "*": son los que exige `createVehiculoSchema` en el
// backend (sucursalId, marca, modelo, tipo, origen, fechaIngreso). Tipo, origen,
// estado, moneda y fecha arrancan con un valor válido, así que el alta no queda
// trabada por un select vacío que el usuario no vio.
const valoresIniciales = (sucursalId?: number): Partial<Vehiculo> => ({
    tipo: 'USADO',
    origen: 'compra',
    estado: 'preparacion',
    moneda: 'ARS',
    fechaIngreso: hoyLocal(),
    ...(sucursalId ? { sucursalId } : {}),
});

const esNumeroPositivo = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v > 0;
const vacioOEnteroNoNegativo = (v: unknown) =>
    v === undefined || v === null || (typeof v === 'number' && (Number.isNaN(v) || (Number.isInteger(v) && v >= 0)));
const vacioONoNegativo = (v: unknown) =>
    v === undefined || v === null || (typeof v === 'number' && (Number.isNaN(v) || v >= 0));

const VehiculoFormPage = () => {
    const { id } = useParams();
    const isEdit = Boolean(id);
    const navigate = useNavigate();
    const { addToast } = useUIStore();
    const sucursalDelUsuario = useAuthStore((s) => s.user?.sucursalId ?? undefined);
    const [loading, setLoading] = useState(false);
    const [cargandoVehiculo, setCargandoVehiculo] = useState(isEdit);
    const [errorCarga, setErrorCarga] = useState<string | null>(null);
    const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
    const [sucursales, setSucursales] = useState<Opt[]>([]);
    const [proveedores, setProveedores] = useState<Opt[]>([]);
    const [clientes, setClientes] = useState<Opt[]>([]);

    const { register, handleSubmit, reset, setError, getValues, setValue, formState: { errors } } = useForm<Partial<Vehiculo>>({
        defaultValues: isEdit ? {} : valoresIniciales(sucursalDelUsuario),
    });

    useEffect(() => {
        const toOpts = (res: unknown): Opt[] =>
            getList<{ id: number; nombre: string }>(res).map((x) => ({ value: x.id, label: x.nombre }));
        sucursalesApi.getAll().then(res => setSucursales(toOpts(res)))
            .catch(() => addToast('No se pudieron cargar las sucursales', 'error'));
        proveedoresApi.getAll({}, { limit: 1000 }).then(res => setProveedores(toOpts(res))).catch(() => setProveedores([]));
        clientesApi.getAll({}, { limit: 1000 }).then(res => setClientes(toOpts(res))).catch(() => setClientes([]));

        if (isEdit) {
            setCargandoVehiculo(true);
            setErrorCarga(null);
            vehiculosApi.getById(Number(id)).then(data => {
                // Formatear fechas para el input type="date"
                if (data.fechaIngreso) data.fechaIngreso = data.fechaIngreso.split('T')[0];
                if (data.fechaCompra) data.fechaCompra = data.fechaCompra.split('T')[0];
                if (data.vencimientoVtv) data.vencimientoVtv = data.vencimientoVtv.split('T')[0];
                if (data.vencimientoSeguro) data.vencimientoSeguro = data.vencimientoSeguro.split('T')[0];
                reset(data);
            }).catch((err) => {
                setErrorCarga(getErrorMessage(err, 'No se pudo cargar el vehículo'));
            }).finally(() => setCargandoVehiculo(false));
        }
    }, [id, isEdit, reset, addToast]);

    // Las opciones de los selects llegan después que el valor (default o el del
    // vehículo en edición): un <select> no controlado que recibió el valor antes de
    // tener la <option> queda mostrando vacío. Al llegar las opciones se reaplica.
    useEffect(() => {
        const actual = getValues('sucursalId');
        if (esNumeroPositivo(actual)) setValue('sucursalId', actual);
        // Sin sucursal propia y con una sola sucursal, esa es la única opción válida.
        else if (!isEdit && sucursales.length === 1) setValue('sucursalId', sucursales[0].value);
    }, [sucursales, isEdit, getValues, setValue]);
    useEffect(() => {
        const actual = getValues('proveedorCompraId');
        if (actual) setValue('proveedorCompraId', actual);
    }, [proveedores, getValues, setValue]);
    useEffect(() => {
        const actual = getValues('clienteOrigenId');
        if (actual) setValue('clienteOrigenId', actual);
    }, [clientes, getValues, setValue]);

    const onSubmit = async (data: Partial<Vehiculo>) => {
        setLoading(true);
        setErrorGeneral(null);
        try {
            if (isEdit) {
                await vehiculosApi.update(Number(id), data);
                addToast('Vehículo actualizado', 'success');
            } else {
                await vehiculosApi.create(data);
                addToast('Vehículo creado', 'success');
            }
            // Volver a la pantalla de origen (Vehículos o Ingresos).
            navigate(-1);
        } catch (err) {
            // El backend responde la validación con `details: [{ campo, mensaje }]`:
            // cada error va junto a su campo en vez de un alert genérico.
            const details = (err as { details?: { campo?: string; mensaje?: string }[] })?.details;
            let alguno = false;
            if (Array.isArray(details)) {
                for (const d of details) {
                    if (d?.campo && CAMPOS_FORM.has(d.campo)) {
                        setError(d.campo as keyof Vehiculo, { type: 'server', message: d.mensaje || 'Revisá este dato' });
                        alguno = true;
                    }
                }
            }
            setErrorGeneral(alguno
                ? 'Revisá los campos marcados.'
                : getErrorMessage(err, 'No se pudo guardar el vehículo. Probá de nuevo.'));
        } finally {
            setLoading(false);
        }
    };

    const onInvalid = () => setErrorGeneral('Revisá los campos marcados.');

    const titulo = isEdit ? 'Editar vehículo' : 'Nuevo vehículo';

    return (
        <div className="page-container">
            <PageTitle title={titulo} />
            <header className="page-header">
                <div className="header-info">
                    <button type="button" className="back-btn" onClick={() => navigate(-1)}>
                        <ArrowLeft size={20} aria-hidden="true" />
                        Volver
                    </button>
                    <h1>{titulo}</h1>
                    <p className="text-muted text-sm" style={{ marginTop: '0.35rem' }}>Los campos con * son obligatorios.</p>
                </div>
            </header>

            {isEdit && cargandoVehiculo ? (
                <div className="form-card glass" role="status" aria-label="Cargando el vehículo">
                    {Array.from({ length: 3 }).map((_, i) => (
                        <div key={i} className="form-section">
                            <span className="skeleton skeleton-text-lg" style={{ width: '30%', marginBottom: '1.5rem' }} />
                            <div className="form-grid">
                                {Array.from({ length: 4 }).map((__, j) => <span key={j} className="skeleton skeleton-rect" />)}
                            </div>
                        </div>
                    ))}
                </div>
            ) : isEdit && errorCarga ? (
                <div className="form-card glass" role="alert" style={{ alignItems: 'center', textAlign: 'center' }}>
                    <p style={{ color: 'var(--text-secondary)', margin: 0 }}>{errorCarga}</p>
                    <div className="flex gap-3" style={{ justifyContent: 'center' }}>
                        <Button variant="secondary" onClick={() => navigate('/vehiculos')}>Volver a Vehículos</Button>
                        <Button variant="primary" onClick={() => window.location.reload()}>Reintentar</Button>
                    </div>
                </div>
            ) : (
                <form onSubmit={handleSubmit(onSubmit, onInvalid)} className="form-card glass animate-fade-in" noValidate>
                    <div className="form-section">
                        <h3>Datos de la unidad</h3>
                        <div className="form-grid">
                            <Select
                                id="veh-tipo"
                                label="Tipo *"
                                placeholder="Elegí el tipo"
                                options={[{ value: 'USADO', label: 'Usado' }, { value: 'CERO_KM', label: '0 km' }]}
                                error={errors.tipo?.message}
                                {...register('tipo', { required: 'Elegí si es usado o 0 km' })}
                            />
                            <Select
                                id="veh-origen"
                                label="Origen *"
                                placeholder="Elegí el origen"
                                options={[
                                    { value: 'compra', label: 'Compra' },
                                    { value: 'permuta', label: 'Permuta' },
                                    { value: 'consignacion', label: 'Consignación' },
                                    { value: 'otro', label: 'Otro' }
                                ]}
                                error={errors.origen?.message}
                                {...register('origen', { required: 'Elegí cómo entró la unidad' })}
                            />
                            <Input id="veh-marca" label="Marca *" placeholder="Ej: Toyota" error={errors.marca?.message}
                                {...register('marca', { required: 'Escribí la marca', setValueAs: (v) => (typeof v === 'string' ? v.trim() : v) })} />
                            <Input id="veh-modelo" label="Modelo *" placeholder="Ej: Corolla" error={errors.modelo?.message}
                                {...register('modelo', { required: 'Escribí el modelo', setValueAs: (v) => (typeof v === 'string' ? v.trim() : v) })} />
                            <Input id="veh-version" label="Versión" placeholder="Ej: XEI 2.0 CVT" error={errors.version?.message} {...register('version')} />
                            <Input id="veh-anio" label="Año" type="number" inputMode="numeric" min={1950} max={new Date().getFullYear() + 1} placeholder="Ej: 2019"
                                error={errors.anio?.message}
                                {...register('anio', {
                                    valueAsNumber: true,
                                    validate: (v) => vacioOEnteroNoNegativo(v) || 'El año tiene que ser un número entero',
                                })} />
                            <Input id="veh-dominio" label="Dominio" placeholder="AB123CD" maxLength={10} autoCapitalize="characters" autoComplete="off"
                                hint="La patente, sin espacios"
                                style={{ textTransform: 'uppercase' }}
                                error={errors.dominio?.message}
                                {...register('dominio', { setValueAs: (v) => (typeof v === 'string' ? v.toUpperCase().replace(/\s+/g, '') : v) })} />
                            <Input id="veh-km" label="Kilómetros al ingreso" type="number" inputMode="numeric" min={0} placeholder="Ej: 61000"
                                error={errors.kmIngreso?.message}
                                {...register('kmIngreso', {
                                    valueAsNumber: true,
                                    validate: (v) => vacioOEnteroNoNegativo(v) || 'Los kilómetros tienen que ser un número entero',
                                })} />
                        </div>
                    </div>

                    <div className="form-section">
                        <h3>Estado y ubicación</h3>
                        <div className="form-grid">
                            {/* Con children y sin placeholder: arranca en un estado válido
                                (en preparación) y no ofrece una opción vacía que el backend rechazaría. */}
                            <Select id="veh-estado" label="Estado" error={errors.estado?.message} {...register('estado')}>
                                <option value="preparacion">En preparación</option>
                                <option value="publicado">Publicado</option>
                                <option value="reservado">Reservado</option>
                                <option value="vendido">Vendido</option>
                                <option value="devuelto">Devuelto</option>
                            </Select>
                            <Select
                                id="veh-sucursal"
                                label="Sucursal *"
                                placeholder="Elegí la sucursal"
                                options={sucursales}
                                error={errors.sucursalId?.message}
                                {...register('sucursalId', {
                                    valueAsNumber: true,
                                    validate: (v) => esNumeroPositivo(v) || 'Elegí la sucursal donde está la unidad',
                                })}
                            />
                            <Input id="veh-color" label="Color" placeholder="Ej: gris plata" error={errors.color?.message} {...register('color')} />
                            <Input id="veh-fecha" label="Fecha de ingreso *" type="date" error={errors.fechaIngreso?.message}
                                {...register('fechaIngreso', { required: 'Elegí la fecha de ingreso' })} />
                        </div>
                    </div>

                    <div className="form-section">
                        <h3>Precios</h3>
                        <div className="form-grid">
                            <Select id="veh-moneda" label="Moneda" hint="La de los dos precios" error={errors.moneda?.message} {...register('moneda')}>
                                <option value="ARS">Pesos (ARS)</option>
                                <option value="USD">Dólares (USD)</option>
                            </Select>
                            <Input id="veh-precio-lista" label="Precio de lista" type="number" inputMode="numeric" step="0.01" min={0} placeholder="Ej: 22300"
                                error={errors.precioLista?.message}
                                {...register('precioLista', {
                                    valueAsNumber: true,
                                    validate: (v) => vacioONoNegativo(v) || 'El precio no puede ser negativo',
                                })} />
                            <Input id="veh-precio-compra" label="Precio de compra" type="number" inputMode="numeric" step="0.01" min={0}
                                error={errors.precioCompra?.message}
                                {...register('precioCompra', {
                                    valueAsNumber: true,
                                    validate: (v) => vacioONoNegativo(v) || 'El precio no puede ser negativo',
                                })} />
                        </div>
                    </div>

                    <div className="form-section">
                        <h3>Documentación</h3>
                        <div className="form-grid">
                            <Input id="veh-vtv" label="Vencimiento de la VTV" type="date" hint="VTV: verificación técnica vehicular"
                                title="VTV: verificación técnica vehicular" error={errors.vencimientoVtv?.message} {...register('vencimientoVtv')} />
                            <Input id="veh-seguro" label="Vencimiento del seguro" type="date" error={errors.vencimientoSeguro?.message} {...register('vencimientoSeguro')} />
                        </div>
                    </div>

                    <div className="form-section">
                        <h3>A quién se le compró</h3>
                        <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)', margin: '-0.75rem 0 1.25rem' }}>
                            De quién se adquirió la unidad. Queda registrado en el ingreso.
                        </p>
                        <div className="form-grid">
                            <Select
                                id="veh-proveedor"
                                label="Proveedor (empresa)"
                                placeholder="Ninguno"
                                options={proveedores}
                                error={errors.proveedorCompraId?.message}
                                {...register('proveedorCompraId')}
                            />
                            <Select
                                id="veh-cliente"
                                label="Cliente particular"
                                placeholder="Ninguno"
                                options={clientes}
                                error={errors.clienteOrigenId?.message}
                                {...register('clienteOrigenId')}
                            />
                        </div>
                    </div>

                    {errorGeneral && (
                        <div className="uploader-alert uploader-alert-error" role="alert">
                            <AlertCircle size={14} aria-hidden="true" />
                            <span>{errorGeneral}</span>
                        </div>
                    )}

                    <div className="form-footer">
                        <Button type="button" variant="outline" onClick={() => navigate(-1)}>Cancelar</Button>
                        <Button type="submit" variant="primary" loading={loading}>
                            <Save size={20} aria-hidden="true" />
                            {isEdit ? 'Guardar cambios' : 'Guardar vehículo'}
                        </Button>
                    </div>
                </form>
            )}

            <style>{`
        .back-btn {
          display: inline-flex;
          align-items: center;
          gap: 0.4rem;
          width: fit-content;
          padding: 0.45rem 0.85rem 0.45rem 0.6rem;
          border-radius: var(--radius-md);
          border: 1px solid var(--border);
          background: var(--bg-card);
          color: var(--text-secondary);
          font-size: var(--text-sm);
          font-weight: 600;
          margin-bottom: 0.85rem;
          transition: color 0.2s, border-color 0.2s, background 0.2s;
        }
        .back-btn:hover { color: var(--accent); border-color: var(--accent); background: var(--accent-light); }
        .back-btn:focus-visible { box-shadow: 0 0 0 3px var(--ring); }
        .form-card { padding: 2.5rem; border-radius: var(--radius-xl); display: flex; flex-direction: column; gap: 2.5rem; }
        .form-section h3 { font-size: var(--text-lg); margin-bottom: 1.5rem; padding-bottom: 0.75rem; border-bottom: 1px solid var(--border); }
        .form-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1.5rem; }
        .form-footer { display: flex; justify-content: flex-end; gap: 1rem; padding-top: 1rem; border-top: 1px solid var(--border); flex-wrap: wrap; }
        @media (max-width: 640px) { .form-card { padding: 1.25rem; gap: 1.75rem; } }
      `}</style>
        </div>
    );
};

export default VehiculoFormPage;
