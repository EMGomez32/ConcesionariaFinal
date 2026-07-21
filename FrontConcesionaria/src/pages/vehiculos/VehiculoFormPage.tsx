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
import { ArrowLeft, Save } from 'lucide-react';

type Opt = { value: number; label: string };

const VehiculoFormPage = () => {
    const { id } = useParams();
    const isEdit = Boolean(id);
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [sucursales, setSucursales] = useState<Opt[]>([]);
    const [proveedores, setProveedores] = useState<Opt[]>([]);
    const [clientes, setClientes] = useState<Opt[]>([]);

    const { register, handleSubmit, reset, formState: { errors } } = useForm<Partial<Vehiculo>>();

    useEffect(() => {
        const toOpts = (res: unknown): Opt[] => {
            // sucursales → {success, data:[...]}; proveedores/clientes → {results}.
            let list: { id: number; nombre: string }[] = [];
            if (Array.isArray(res)) list = res as { id: number; nombre: string }[];
            else {
                const o = (res ?? {}) as { results?: typeof list; data?: typeof list | { results?: typeof list } };
                if (Array.isArray(o.results)) list = o.results;
                else if (Array.isArray(o.data)) list = o.data;
                else if (Array.isArray((o.data as { results?: typeof list })?.results)) list = (o.data as { results: typeof list }).results;
            }
            return list.map((x) => ({ value: x.id, label: x.nombre }));
        };
        sucursalesApi.getAll().then(res => setSucursales(toOpts(res)));
        proveedoresApi.getAll({}, { limit: 1000 }).then(res => setProveedores(toOpts(res)));
        clientesApi.getAll({}, { limit: 1000 }).then(res => setClientes(toOpts(res)));

        if (isEdit) {
            vehiculosApi.getById(Number(id)).then(data => {
                // Formatear fechas para el input type="date"
                if (data.fechaIngreso) data.fechaIngreso = data.fechaIngreso.split('T')[0];
                if (data.fechaCompra) data.fechaCompra = data.fechaCompra.split('T')[0];
                reset(data);
            });
        }
    }, [id, isEdit, reset]);

    const onSubmit = async (data: Partial<Vehiculo>) => {
        setLoading(true);
        try {
            if (isEdit) {
                await vehiculosApi.update(Number(id), data);
            } else {
                await vehiculosApi.create(data);
            }
            // Volver a la pantalla de origen (Vehículos o Ingresos).
            navigate(-1);
        } catch (err) {
            console.error(err);
            alert('Error al guardar el vehículo');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="page-container">
            <header className="page-header">
                <div className="header-info">
                    <button className="back-btn" onClick={() => navigate(-1)}>
                        <ArrowLeft size={20} />
                        Volver
                    </button>
                    <h1>{isEdit ? 'Editar Vehículo' : 'Nuevo Vehículo'}</h1>
                </div>
            </header>

            <form onSubmit={handleSubmit(onSubmit)} className="form-card glass animate-fade-in">
                <div className="form-section">
                    <h3>Información General</h3>
                    <div className="form-grid">
                        <Select
                            label="Tipo"
                            options={[{ value: 'USADO', label: 'Usado' }, { value: 'CERO_KM', label: '0 KM' }]}
                            {...register('tipo', { required: true })}
                        />
                        <Select
                            label="Origen"
                            options={[
                                { value: 'compra', label: 'Compra' },
                                { value: 'permuta', label: 'Permuta' },
                                { value: 'consignacion', label: 'Consignación' },
                                { value: 'otro', label: 'Otro' }
                            ]}
                            {...register('origen')}
                        />
                        <Input label="Marca" {...register('marca', { required: true })} error={errors.marca && 'Requerido'} />
                        <Input label="Modelo" {...register('modelo', { required: true })} error={errors.modelo && 'Requerido'} />
                        <Input label="Versión" {...register('version')} />
                        <Input label="Año" type="number" {...register('anio', { valueAsNumber: true })} />
                        <Input label="Dominio / Patente" {...register('dominio')} />
                        <Input label="Kilómetros al Ingreso" type="number" {...register('kmIngreso', { valueAsNumber: true })} />
                    </div>
                </div>

                <div className="form-section">
                    <h3>Estado y Ubicación</h3>
                    <div className="form-grid">
                        <Select
                            label="Estado Actual"
                            options={[
                                { value: 'preparacion', label: 'En Preparación' },
                                { value: 'publicado', label: 'Publicado' },
                                { value: 'reservado', label: 'Reservado' },
                                { value: 'vendido', label: 'Vendido' },
                                { value: 'devuelto', label: 'Devuelto' },
                            ]}
                            {...register('estado')}
                        />
                        <Select
                            label="Sucursal"
                            options={sucursales}
                            {...register('sucursalId', { valueAsNumber: true })}
                        />
                        <Input label="Color" {...register('color')} />
                        <Input label="Fecha de Ingreso" type="date" {...register('fechaIngreso', { required: true })} error={errors.fechaIngreso && 'Requerido'} />
                    </div>
                </div>

                <div className="form-section">
                    <h3>Precios</h3>
                    <div className="form-grid">
                        <Select
                            label="Moneda"
                            options={[
                                { value: 'ARS', label: 'Pesos (ARS)' },
                                { value: 'USD', label: 'Dólares (USD)' },
                            ]}
                            {...register('moneda')}
                        />
                        <Input label="Precio Lista (Venta)" type="number" step="0.01" {...register('precioLista', { valueAsNumber: true })} />
                        <Input label="Precio Compra" type="number" step="0.01" {...register('precioCompra', { valueAsNumber: true })} />
                    </div>
                </div>

                <div className="form-section">
                    <h3>Origen del Activo</h3>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: '-0.75rem 0 1.25rem' }}>
                        De quién se adquirió la unidad. Queda registrado en el ingreso.
                    </p>
                    <div className="form-grid">
                        <Select
                            label="Proveedor (empresa)"
                            placeholder="— Ninguno —"
                            options={proveedores}
                            {...register('proveedorCompraId')}
                        />
                        <Select
                            label="Cliente / Particular"
                            placeholder="— Ninguno —"
                            options={clientes}
                            {...register('clienteOrigenId')}
                        />
                    </div>
                </div>

                <div className="form-footer">
                    <Button type="button" variant="outline" onClick={() => navigate(-1)}>Cancelar</Button>
                    <Button type="submit" variant="primary" loading={loading}>
                        <Save size={20} style={{ marginRight: '0.5rem' }} />
                        {isEdit ? 'Actualizar' : 'Guardar'} Vehículo
                    </Button>
                </div>
            </form>

            <style>{`
        .page-container { display: flex; flex-direction: column; gap: 2rem; }
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
          font-size: 0.85rem;
          font-weight: 600;
          margin-bottom: 0.85rem;
          transition: color 0.2s, border-color 0.2s, background 0.2s;
        }
        .back-btn:hover { color: var(--accent); border-color: var(--accent); background: var(--accent-light); }
        .form-card { padding: 2.5rem; border-radius: 1.5rem; display: flex; flex-direction: column; gap: 2.5rem; }
        .form-section h3 { font-size: 1.125rem; margin-bottom: 1.5rem; padding-bottom: 0.75rem; border-bottom: 1px solid var(--border); }
        .form-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1.5rem; }
        .form-footer { display: flex; justify-content: flex-end; gap: 1rem; padding-top: 1rem; border-top: 1px solid var(--border); }
      `}</style>
        </div>
    );
};

export default VehiculoFormPage;
