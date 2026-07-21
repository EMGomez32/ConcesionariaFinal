import React, { useState, useEffect } from 'react';
import type { Proveedor } from '../../types/proveedor.types';
import Input from '../ui/Input';
import Button from '../ui/Button';
import Select from '../ui/Select';
import { Building2, Phone, Mail, MapPin, Tag } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { concesionariasApi } from '../../api/concesionarias.api';
import type { Concesionaria } from '../../types/concesionaria.types';
import { TIPOS_PROVEEDOR } from '../../constants/proveedorTipos';

interface ProveedorFormProps {
    onSubmit: (data: Partial<Proveedor>) => Promise<void>;
    initialData?: Proveedor | null;
    onCancel: () => void;
    loading?: boolean;
}

const buildProveedorFormData = (initialData: Proveedor | null | undefined, concesionariaId?: number | null): Partial<Proveedor> => ({
    concesionariaId: initialData?.concesionariaId ?? concesionariaId ?? undefined,
    nombre: initialData?.nombre ?? '',
    tipo: initialData?.tipo ?? '',
    telefono: initialData?.telefono ?? '',
    email: initialData?.email ?? '',
    direccion: initialData?.direccion ?? '',
    activo: initialData?.activo ?? true,
});

const ProveedorForm: React.FC<ProveedorFormProps> = ({ onSubmit, initialData, onCancel, loading }) => {
    const { user } = useAuthStore();
    const isSuperAdmin = user?.roles?.includes('super_admin') ?? false;
    const [concesionarias, setConcesionarias] = useState<Concesionaria[]>([]);

    const [formData, setFormData] = useState<Partial<Proveedor>>(() =>
        buildProveedorFormData(initialData, user?.concesionariaId)
    );

    useEffect(() => {
        if (isSuperAdmin) {
            concesionariasApi.getAll().then(res => {
                const r = res as { results?: Concesionaria[] } | Concesionaria[];
                setConcesionarias(Array.isArray(r) ? r : (r?.results ?? []));
            });
        }
    }, [isSuperAdmin]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: name === 'concesionariaId' ? (value ? parseInt(value, 10) : undefined) : value,
        }));
    };

    const toggleActivo = () => setFormData(p => ({ ...p, activo: !p.activo }));

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        await onSubmit(formData);
    };

    return (
        <form onSubmit={handleSubmit} className="form-grid">
            {isSuperAdmin && (
                <div className="full-width">
                    <Select
                        label="Concesionaria"
                        name="concesionariaId"
                        value={formData.concesionariaId ?? ''}
                        onChange={handleChange}
                        options={concesionarias.map(c => ({ value: c.id, label: c.nombre }))}
                        required
                    />
                </div>
            )}

            <div className="full-width">
                <Input
                    label="Nombre *"
                    name="nombre"
                    value={formData.nombre || ''}
                    onChange={handleChange}
                    placeholder="Nombre del proveedor"
                    icon={<Building2 size={18} />}
                    required
                />
            </div>

            <Select
                label="Tipo de Proveedor"
                name="tipo"
                value={formData.tipo || ''}
                onChange={handleChange}
                options={[
                    { value: '', label: 'Seleccionar tipo' },
                    ...TIPOS_PROVEEDOR.map(t => ({ value: t.value, label: t.label })),
                ]}
                required
            />

            <Input
                label="Teléfono"
                name="telefono"
                value={formData.telefono || ''}
                onChange={handleChange}
                placeholder="+54 11 0000-0000"
                icon={<Phone size={18} />}
            />

            <div className="full-width">
                <Input
                    label="Email"
                    name="email"
                    type="email"
                    value={formData.email || ''}
                    onChange={handleChange}
                    placeholder="proveedor@mail.com"
                    icon={<Mail size={18} />}
                />
            </div>

            <div className="full-width">
                <Input
                    label="Dirección"
                    name="direccion"
                    value={formData.direccion || ''}
                    onChange={handleChange}
                    placeholder="Dirección completa"
                    icon={<MapPin size={18} />}
                />
            </div>

            <div className="full-width">
                <div className={`status-toggle ${formData.activo ? 'active' : 'inactive'}`} onClick={toggleActivo}>
                    <div className="toggle-info">
                        <Tag size={18} />
                        <div className="toggle-text">
                            <span className="toggle-label">Estado del Proveedor</span>
                            <span className="toggle-status">{formData.activo ? 'Proveedor Operativo' : 'Proveedor Suspendido'}</span>
                        </div>
                    </div>
                    <div className="toggle-switch"></div>
                </div>
            </div>

            <div className="form-actions full-width">
                <Button type="button" variant="secondary" onClick={onCancel} disabled={loading}>
                    Cancelar
                </Button>
                <Button type="submit" variant="primary" loading={loading}>
                    {initialData ? 'Actualizar Proveedor' : 'Registrar Proveedor'}
                </Button>
            </div>
        </form>
    );
};

export default ProveedorForm;

