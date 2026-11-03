import { useState } from 'react';
import { sucursalesApi } from '../../api/sucursales.api';
import { useSucursales, sucursalesKeys } from '../../hooks/useSucursales';
import { useDebounce } from '../../hooks/useDebounce';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Sucursal, CreateSucursalDto } from '../../types/sucursal.types';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Modal from '../../components/ui/Modal';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import PageTitle from '../../components/ui/PageTitle';
import { Listado, ListadoTabla, BusquedaListado, type ColumnaListado } from '../../components/listado';
import { Plus, Store, Edit, Trash2 } from 'lucide-react';
import SucursalForm from '../../components/forms/SucursalForm';
import { useUIStore } from '../../store/uiStore';
import { useAuthStore } from '../../store/authStore';
import { getApiErrorMessage } from '../../utils/error';

const SucursalesPage = () => {
    const { addToast } = useUIStore();
    const queryClient = useQueryClient();
    // La columna "Concesionaria" sólo le sirve al super_admin (que ve varias); a
    // cualquier otro rol le repetía el nombre de su propia concesionaria.
    const esSuperAdmin = !!useAuthStore((s) => s.user?.roles?.includes('super_admin'));
    const [searchTerm, setSearchTerm] = useState('');
    const debouncedSearch = useDebounce(searchTerm, 300);
    const { data: sucursales = [], isLoading: loading, isError, refetch } = useSucursales({ nombre: debouncedSearch || undefined });
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingSucursal, setEditingSucursal] = useState<Sucursal | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [deletingSucursal, setDeletingSucursal] = useState<Sucursal | null>(null);

    const deleteMutation = useMutation({
        mutationFn: (id: number) => sucursalesApi.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: sucursalesKeys.lists() });
            addToast('Sucursal eliminada', 'success');
        },
        onError: (error) => {
            addToast(getApiErrorMessage(error, 'No se pudo eliminar la sucursal'), 'error');
        }
    });

    const handleOpenModal = (sucursal?: Sucursal) => {
        setEditingSucursal(sucursal || null);
        setIsModalOpen(true);
    };

    const handleCloseModal = () => {
        setIsModalOpen(false);
        setEditingSucursal(null);
    };

    const handleSubmit = async (data: CreateSucursalDto) => {
        setSubmitting(true);
        try {
            if (editingSucursal) {
                await sucursalesApi.update(editingSucursal.id, data);
                addToast('Sucursal actualizada', 'success');
            } else {
                await sucursalesApi.create(data);
                addToast('Sucursal creada', 'success');
            }
            handleCloseModal();
            queryClient.invalidateQueries({ queryKey: sucursalesKeys.lists() });
        } catch (error) {
            addToast(getApiErrorMessage(error, 'No se pudieron guardar los datos'), 'error');
        } finally {
            setSubmitting(false);
        }
    };

    const confirmDelete = () => {
        if (deletingSucursal) {
            deleteMutation.mutate(deletingSucursal.id);
            setDeletingSucursal(null);
        }
    };

    const columnas: ColumnaListado<Sucursal>[] = [
        {
            clave: 'sucursal',
            titulo: 'Sucursal',
            flexible: true,
            tarjeta: 'titulo',
            celda: (s) => (
                <>
                    <span className="listado-principal">{s.nombre}</span>
                    {s.ciudad && <span className="listado-secundario">{s.ciudad}</span>}
                </>
            ),
        },
        ...(esSuperAdmin ? [{
            clave: 'concesionaria',
            titulo: 'Concesionaria',
            celda: (s: Sucursal) => <span className="listado-nowrap">{s.concesionaria?.nombre ?? 'Sin concesionaria'}</span>,
        }] : []),
        {
            clave: 'direccion',
            titulo: 'Dirección',
            celda: (s) => s.direccion ? <span>{s.direccion}</span> : <span className="text-muted">Sin cargar</span>,
        },
        {
            clave: 'telefono',
            titulo: 'Teléfono',
            celda: (s) => s.telefono ? <span className="listado-nowrap">{s.telefono}</span> : <span className="text-muted">Sin cargar</span>,
        },
        {
            clave: 'estado',
            titulo: 'Estado',
            celda: (s) => <Badge variant={s.activo ? 'success' : 'danger'}>{s.activo ? 'Activa' : 'Inactiva'}</Badge>,
        },
        {
            clave: 'acciones',
            titulo: 'Acciones',
            alinear: 'right',
            ancho: '1%',
            tarjeta: 'acciones',
            celda: (s) => (
                <div className="listado-acciones-fila">
                    <button type="button" className="icon-btn" onClick={() => handleOpenModal(s)} aria-label={`Editar ${s.nombre}`} title="Editar">
                        <Edit size={14} aria-hidden="true" />
                    </button>
                    <button type="button" className="icon-btn danger" onClick={() => setDeletingSucursal(s)} aria-label={`Eliminar ${s.nombre}`} title="Eliminar">
                        <Trash2 size={14} aria-hidden="true" />
                    </button>
                </div>
            ),
        },
    ];

    const nuevaSucursal = (
        <Button variant="primary" onClick={() => handleOpenModal()}>
            <Plus size={18} aria-hidden="true" />
            Nueva sucursal
        </Button>
    );

    return (
        <div className="page-container animate-fade-in">
            <PageTitle title="Sucursales" />
            <Listado
                titulo="Sucursales"
                subtitulo="Los locales de tu concesionaria"
                icono={<Store size={22} />}
                accionPrincipal={nuevaSucursal}
                busqueda={<BusquedaListado valor={searchTerm} onChange={setSearchTerm} placeholder="Buscar por nombre" etiqueta="Buscar sucursales" />}
            >
                <ListadoTabla
                    etiqueta="Sucursales"
                    columnas={columnas}
                    filas={sucursales}
                    cargando={loading}
                    filasCargando={3}
                    error={isError}
                    mensajeError="No se pudieron cargar las sucursales"
                    onReintentar={() => refetch()}
                    hayFiltros={!!debouncedSearch}
                    onLimpiarFiltros={() => setSearchTerm('')}
                    vacio={{
                        titulo: 'Todavía no hay sucursales',
                        descripcion: 'Creá la primera para asignarle unidades, usuarios y gastos.',
                        icono: <Store size={32} aria-hidden="true" />,
                        accion: nuevaSucursal,
                    }}
                />
            </Listado>

            <Modal
                isOpen={isModalOpen}
                onClose={handleCloseModal}
                title={editingSucursal ? 'Editar sucursal' : 'Nueva sucursal'}
                subtitle="Los datos del local."
                maxWidth="650px"
            >
                <SucursalForm
                    initialData={editingSucursal}
                    onSubmit={handleSubmit}
                    onCancel={handleCloseModal}
                    loading={submitting}
                />
            </Modal>

            <ConfirmDialog
                isOpen={!!deletingSucursal}
                title="Eliminar sucursal"
                message={deletingSucursal
                    ? `¿Eliminar la sucursal "${deletingSucursal.nombre}"? No se puede deshacer.`
                    : ''}
                confirmLabel="Eliminar sucursal"
                cancelLabel="Cancelar"
                type="danger"
                onConfirm={confirmDelete}
                onCancel={() => setDeletingSucursal(null)}
                loading={deleteMutation.isPending}
            />
        </div>
    );
};

export default SucursalesPage;
