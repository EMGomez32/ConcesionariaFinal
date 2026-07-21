import React, { useState } from 'react';
import type { CreateConcesionariaDto, Concesionaria } from '../../types/concesionaria.types';
import Input from '../ui/Input';
import Button from '../ui/Button';
import { Building2, Mail, Phone, MapPin, Hash } from 'lucide-react';

interface ConcesionariaFormProps {
    onSubmit: (data: CreateConcesionariaDto) => Promise<void>;
    initialData?: Concesionaria | null;
    onCancel: () => void;
    loading?: boolean;
}

const ConcesionariaForm: React.FC<ConcesionariaFormProps> = ({ onSubmit, initialData, onCancel, loading }) => {
    // Inicialización lazy: el state se deriva de initialData una sola vez al montar.
    // El caller monta/remonta este form con key={id || 'new'} cuando cambia el target.
    const [formData, setFormData] = useState<CreateConcesionariaDto>(() => ({
        nombre: initialData?.nombre || '',
        cuit: initialData?.cuit || '',
        email: initialData?.email || '',
        telefono: initialData?.telefono || '',
        direccion: initialData?.direccion || '',
    }));

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        await onSubmit(formData);
    };

    return (
        <form onSubmit={handleSubmit} className="form-grid">
            <Input
                label="Nombre de la Concesionaria *"
                name="nombre"
                value={formData.nombre}
                onChange={handleChange}
                placeholder="ej. Automotores Sur"
                icon={<Building2 size={16} />}
                required
            />
            <Input
                label="CUIT / ID Fiscal"
                name="cuit"
                value={formData.cuit}
                onChange={handleChange}
                placeholder="30-12345678-9"
                icon={<Hash size={16} />}
            />
            <Input
                label="Email de Contacto"
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                placeholder="contacto@concesionaria.com"
                icon={<Mail size={16} />}
            />
            <Input
                label="Teléfono"
                name="telefono"
                value={formData.telefono}
                onChange={handleChange}
                placeholder="+54 11 1234-5678"
                icon={<Phone size={16} />}
            />
            <div className="full-width">
                <Input
                    label="Dirección Principal"
                    name="direccion"
                    value={formData.direccion}
                    onChange={handleChange}
                    placeholder="Av. Libertador 1234, CABA"
                    icon={<MapPin size={16} />}
                />
            </div>

            <div className="form-actions full-width">
                <Button type="button" variant="secondary" onClick={onCancel}>
                    Cancelar
                </Button>
                <Button type="submit" variant="primary" loading={loading}>
                    {initialData ? 'Guardar Cambios' : 'Crear Concesionaria'}
                </Button>
            </div>

            <style>{`
                .form-grid {
                    display: grid;
                    grid-template-columns: repeat(2, 1fr);
                    gap: var(--space-4);
                }
                .full-width {
                    grid-column: span 2;
                }
                .form-actions {
                    display: flex;
                    justify-content: flex-end;
                    gap: var(--space-3);
                    margin-top: var(--space-4);
                    padding-top: var(--space-5);
                    border-top: 1px solid var(--border);
                }
            `}</style>
        </form>
    );
};

export default ConcesionariaForm;
