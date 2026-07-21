import React, { useState, useEffect } from 'react';
import type { CreateSucursalDto, Sucursal } from '../../types/sucursal.types';
import type { Concesionaria } from '../../types/concesionaria.types';
import { concesionariasApi } from '../../api/concesionarias.api';
import Input from '../ui/Input';
import Button from '../ui/Button';
import { Store, MapPin, Phone, CheckCircle, XCircle, Mail, Globe, Building2 } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';

interface SucursalFormProps {
    onSubmit: (data: CreateSucursalDto) => Promise<void>;
    initialData?: Sucursal | null;
    onCancel: () => void;
    loading?: boolean;
}

const buildSucursalFormData = (initialData: Sucursal | null | undefined, concesionariaId?: number | null): CreateSucursalDto => ({
    concesionariaId: initialData?.concesionariaId ?? concesionariaId ?? 0,
    nombre: initialData?.nombre ?? '',
    direccion: initialData?.direccion ?? '',
    ciudad: initialData?.ciudad ?? '',
    email: initialData?.email ?? '',
    telefono: initialData?.telefono ?? '',
    activo: initialData?.activo ?? true,
});

const SucursalForm: React.FC<SucursalFormProps> = ({ onSubmit, initialData, onCancel, loading }) => {
    const { user } = useAuthStore();
    const isSuperAdmin = user?.roles.includes('super_admin');

    const [concesionarias, setConcesionarias] = useState<Concesionaria[]>([]);
    const [formData, setFormData] = useState<CreateSucursalDto>(() =>
        buildSucursalFormData(initialData, user?.concesionariaId)
    );

    useEffect(() => {
        if (isSuperAdmin) {
            const loadConcesionarias = async () => {
                try {
                    const res = await concesionariasApi.getAll();
                    const r = res as { results?: Concesionaria[] } | Concesionaria[];
                    setConcesionarias(Array.isArray(r) ? r : (r?.results ?? []));
                } catch (error) {
                    console.error('Error al cargar concesionarias:', error);
                }
            };
            loadConcesionarias();
        }
    }, [isSuperAdmin]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value, type } = e.target;
        const val = type === 'checkbox' ? (e.target as HTMLInputElement).checked : value;
        setFormData(prev => ({
            ...prev,
            [name]: name === 'concesionariaId' ? parseInt(String(val), 10) : val
        }));
    };

    const handleToggle = () => {
        setFormData(prev => ({ ...prev, activo: !prev.activo }));
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSubmit(formData);
    };

    return (
        <form onSubmit={handleSubmit} className="form-grid">
            {isSuperAdmin && (
                <div className="full-width">
                    <div className="input-group">
                        <label className="input-label">Concesionaria *</label>
                        <div className="input-container">
                            <span className="input-icon"><Building2 size={18} /></span>
                            <select
                                name="concesionariaId"
                                value={formData.concesionariaId}
                                onChange={handleChange}
                                required
                                className="with-icon"
                            >
                                <option value="">Seleccione Concesionaria</option>
                                {concesionarias.map(c => (
                                    <option key={c.id} value={c.id}>{c.nombre}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                </div>
            )}

            <div className="full-width">
                <Input
                    label="Nombre de la Sucursal *"
                    name="nombre"
                    value={formData.nombre}
                    onChange={handleChange}
                    placeholder="ej. Sucursal San Martín"
                    icon={<Store size={18} />}
                    required
                />
            </div>

            <Input
                label="Ciudad"
                name="ciudad"
                value={formData.ciudad || ''}
                onChange={handleChange}
                placeholder="ej. Buenos Aires"
                icon={<Globe size={18} />}
            />

            <Input
                label="Teléfono"
                name="telefono"
                value={formData.telefono || ''}
                onChange={handleChange}
                placeholder="+54 11 1234-5678"
                icon={<Phone size={18} />}
            />

            <div className="full-width">
                <Input
                    label="Email de Contacto"
                    name="email"
                    type="email"
                    value={formData.email || ''}
                    onChange={handleChange}
                    placeholder="sucursal@ejemplo.com"
                    icon={<Mail size={18} />}
                />
            </div>

            <div className="full-width">
                <Input
                    label="Dirección"
                    name="direccion"
                    value={formData.direccion || ''}
                    onChange={handleChange}
                    placeholder="Av. Calle Falsa 123"
                    icon={<MapPin size={18} />}
                />
            </div>

            <div className="full-width status-toggle" onClick={handleToggle}>
                <div className={`toggle-icon ${formData.activo ? 'active' : 'inactive'}`}>
                    {formData.activo ? <CheckCircle size={20} /> : <XCircle size={20} />}
                </div>
                <div>
                    <span className="toggle-label">{formData.activo ? 'Sucursal Activa' : 'Sucursal Inactiva'}</span>
                    <p className="toggle-help">Las sucursales inactivas no aparecen en los listados operativos.</p>
                </div>
            </div>

            <div className="form-actions full-width">
                <Button type="button" variant="secondary" onClick={onCancel} style={{ paddingLeft: '2rem', paddingRight: '2rem' }}>
                    Cancelar
                </Button>
                <Button type="submit" variant="primary" loading={loading} style={{ paddingLeft: '2.5rem', paddingRight: '2.5rem' }}>
                    {initialData ? 'Guardar Cambios' : 'Crear Sucursal'}
                </Button>
            </div>

            <style>{`
                .input-container select {
                    width: 100%;
                    padding: 0.8125rem 1rem;
                    background: var(--bg-primary);
                    border: 1.5px solid var(--border);
                    border-radius: 1rem;
                    color: var(--text-primary);
                    font-size: 0.9375rem;
                    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                    box-shadow: var(--shadow-sm);
                    cursor: pointer;
                }
                .input-container select.with-icon {
                    padding-left: 2.75rem;
                }
                .input-container select:focus {
                    border-color: var(--accent);
                    outline: none;
                    box-shadow: 0 0 0 4px var(--accent-light);
                    background: var(--bg-card);
                }
                .input-container select:hover {
                    border-color: var(--text-muted);
                }
                .input-container select:disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                }
            `}</style>
        </form>
    );
};

export default SucursalForm;
