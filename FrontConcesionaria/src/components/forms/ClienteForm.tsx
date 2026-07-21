import React, { useState, useEffect } from 'react';
import type { Cliente } from '../../types/cliente.types';
import Input from '../ui/Input';
import Button from '../ui/Button';
import Select from '../ui/Select';
import { User, Phone, Mail, MapPin, FileText, Building2, MessageSquare, Search, AlertCircle, Edit } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { concesionariasApi } from '../../api/concesionarias.api';
import { clientesApi } from '../../api/clientes.api';
import type { Concesionaria } from '../../types/concesionaria.types';

interface ClienteFormProps {
    onSubmit: (data: Partial<Cliente>) => Promise<void>;
    initialData?: Cliente | null;
    onCancel: () => void;
    onEdit?: (cliente: Cliente) => void;
    loading?: boolean;
}

const buildFormData = (initialData: Cliente | null | undefined, concesionariaId?: number): Partial<Cliente> => ({
    concesionariaId: initialData?.concesionariaId ?? concesionariaId,
    nombre: initialData?.nombre ?? '',
    dni: initialData?.dni ?? '',
    telefono: initialData?.telefono ?? '',
    email: initialData?.email ?? '',
    direccion: initialData?.direccion ?? '',
    observaciones: initialData?.observaciones ?? '',
});

const ClienteForm: React.FC<ClienteFormProps> = ({ onSubmit, initialData, onCancel, onEdit, loading }) => {
    const { user } = useAuthStore();
    const isSuperAdmin = user?.roles?.includes('super_admin') ?? false;
    const [concesionarias, setConcesionarias] = useState<Concesionaria[]>([]);
    
    // Estado para verificación de DNI
    const [step, setStep] = useState<'dni-check' | 'form'>(initialData ? 'form' : 'dni-check');
    const [dniToCheck, setDniToCheck] = useState('');
    const [concesionariaIdForCheck, setConcesionariaIdForCheck] = useState<number | undefined>(
        isSuperAdmin ? undefined : (user?.concesionariaId ?? undefined)
    );
    const [checkingDni, setCheckingDni] = useState(false);
    const [existingCliente, setExistingCliente] = useState<Cliente | null>(null);

    const [formData, setFormData] = useState<Partial<Cliente>>(() =>
        buildFormData(initialData, user?.concesionariaId ?? undefined)
    );

    useEffect(() => {
        if (isSuperAdmin) {
            concesionariasApi.getAll().then(res => {
                const r = res as { results?: Concesionaria[] } | Concesionaria[];
                setConcesionarias(Array.isArray(r) ? r : (r?.results ?? []));
            });
        }
    }, [isSuperAdmin]);

    // Actualizar formData cuando cambie initialData (cuando se edita desde verificación)
    useEffect(() => {
        if (initialData) {
            setFormData(buildFormData(initialData, initialData.concesionariaId));
            setStep('form');
        }
    }, [initialData]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: name === 'concesionariaId' ? (value ? parseInt(value, 10) : undefined) : value,
        }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        await onSubmit(formData);
    };

    const handleDniCheck = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!dniToCheck.trim()) return;

        // Para super admin, debe seleccionar primero la concesionaria
        if (isSuperAdmin && !concesionariaIdForCheck) {
            alert('Por favor, selecciona una concesionaria primero');
            return;
        }

        setCheckingDni(true);
        setExistingCliente(null);

        try {
            const filters: Record<string, unknown> = { dni: dniToCheck };
            if (concesionariaIdForCheck) {
                filters.concesionariaId = concesionariaIdForCheck;
            }
            
            const response = await clientesApi.getAll(filters);
            // El interceptor ya devuelve response.data
            // La estructura es: { results: [...], page, limit, totalPages, totalResults }
            const clientes = response.results || [];

            if (clientes.length > 0) {
                // Cliente ya existe
                setExistingCliente(clientes[0]);
            } else {
                // Cliente no existe, continuar con el formulario
                setFormData(prev => ({ 
                    ...prev, 
                    dni: dniToCheck,
                    concesionariaId: concesionariaIdForCheck 
                }));
                setStep('form');
            }
        } catch (error) {
            console.error('Error al verificar CUIT/CUIL:', error);
            // Si hay error, permitir continuar
            setFormData(prev => ({ 
                ...prev, 
                dni: dniToCheck,
                concesionariaId: concesionariaIdForCheck 
            }));
            setStep('form');
        } finally {
            setCheckingDni(false);
        }
    };

    const handleContinueAnyway = () => {
        setFormData(prev => ({ 
            ...prev, 
            dni: dniToCheck,
            concesionariaId: concesionariaIdForCheck 
        }));
        setExistingCliente(null);
        setStep('form');
    };

    const handleEditExisting = () => {
        if (existingCliente && onEdit) {
            // Notificar al componente padre para que actualice editingCliente
            // Esto hará que initialData cambie y el useEffect cargue los datos
            onEdit(existingCliente);
        }
    };

    // Paso 1: Verificación de DNI
    if (step === 'dni-check') {
        return (
            <div className="dni-check-container">
                {!existingCliente ? (
                    <form onSubmit={handleDniCheck} className="dni-check-form">
                        <div className="dni-check-content">
                            <div className="dni-check-icon">
                                <Search size={48} className="text-accent" />
                            </div>
                            <h3 className="dni-check-title">Verificar Cliente Existente</h3>
                            <p className="dni-check-description">
                                {isSuperAdmin 
                                    ? 'Selecciona la concesionaria e ingresa el CUIT/CUIL del cliente para verificar si ya está registrado.'
                                    : 'Ingresa el CUIT/CUIL del cliente para verificar si ya está registrado en el sistema.'
                                }
                            </p>
                            
                            <div className="dni-input-wrapper">
                                {isSuperAdmin && (
                                    <div className="concesionaria-select-wrapper">
                                        <Select
                                            label="Concesionaria *"
                                            name="concesionariaId"
                                            value={concesionariaIdForCheck ?? ''}
                                            onChange={(e) => setConcesionariaIdForCheck(e.target.value ? parseInt(e.target.value, 10) : undefined)}
                                            options={concesionarias.map(c => ({ value: c.id, label: c.nombre }))}
                                            required
                                        />
                                    </div>
                                )}
                                <Input
                                    label="CUIT/CUIL *"
                                    name="dni"
                                    value={dniToCheck}
                                    onChange={(e) => setDniToCheck(e.target.value)}
                                    placeholder="Ej: 20-12345678-9"
                                    icon={<FileText size={18} />}
                                    autoFocus={!isSuperAdmin}
                                />
                            </div>
                        </div>

                        <div className="dni-check-actions">
                            <Button type="button" variant="secondary" onClick={onCancel} disabled={checkingDni}>
                                Cancelar
                            </Button>
                            <Button 
                                type="button" 
                                variant="secondary" 
                                onClick={() => {
                                    setDniToCheck('');
                                    setFormData(prev => ({ ...prev, concesionariaId: concesionariaIdForCheck }));
                                    setStep('form');
                                }}
                                disabled={checkingDni || (isSuperAdmin && !concesionariaIdForCheck)}
                            >
                                Omitir Verificación
                            </Button>
                            <Button type="submit" variant="primary" loading={checkingDni}>
                                Verificar DNI
                            </Button>
                        </div>
                    </form>
                ) : (
                    <div className="existing-client-alert">
                        <div className="alert-icon warning">
                            <AlertCircle size={48} />
                        </div>
                        <h3 className="alert-title">Cliente Ya Registrado</h3>
                        <p className="alert-message">
                            Se encontró un cliente con el DNI <strong>{dniToCheck}</strong>
                        </p>
                        
                        <div className="existing-client-info">
                            {isSuperAdmin && existingCliente.concesionariaId && (
                                <div className="info-row highlight">
                                    <Building2 size={18} />
                                    <span>
                                        <strong>Concesionaria:</strong>{' '}
                                        {concesionarias.find(c => c.id === existingCliente.concesionariaId)?.nombre || 
                                         `ID: ${existingCliente.concesionariaId}`}
                                    </span>
                                </div>
                            )}
                            <div className="info-row">
                                <User size={18} />
                                <span><strong>Nombre:</strong> {existingCliente.nombre}</span>
                            </div>
                            {existingCliente.email && (
                                <div className="info-row">
                                    <Mail size={18} />
                                    <span><strong>Email:</strong> {existingCliente.email}</span>
                                </div>
                            )}
                            {existingCliente.telefono && (
                                <div className="info-row">
                                    <Phone size={18} />
                                    <span><strong>Teléfono:</strong> {existingCliente.telefono}</span>
                                </div>
                            )}
                        </div>

                        <div className="alert-actions">
                            <Button 
                                type="button" 
                                variant="secondary" 
                                onClick={() => {
                                    setExistingCliente(null);
                                    setDniToCheck('');
                                }}
                            >
                                Verificar Otro CUIT/CUIL
                            </Button>
                            {onEdit && (
                                <Button 
                                    type="button" 
                                    variant="primary" 
                                    onClick={handleEditExisting}
                                >
                                    <Edit size={18} />
                                    Editar Cliente Existente
                                </Button>
                            )}
                            <Button 
                                type="button" 
                                variant="secondary" 
                                onClick={handleContinueAnyway}
                            >
                                Crear de Todos Modos
                            </Button>
                        </div>
                    </div>
                )}

                <style>{`
                    .dni-check-container {
                        min-height: 300px;
                    }

                    .dni-check-form {
                        display: flex;
                        flex-direction: column;
                        gap: 2rem;
                    }

                    .dni-check-content {
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        text-align: center;
                        gap: 1.5rem;
                        padding: 2rem 1rem;
                    }

                    .dni-check-icon {
                        width: 80px;
                        height: 80px;
                        border-radius: 50%;
                        background: var(--accent-light, rgba(139, 92, 246, 0.1));
                        display: flex;
                        align-items: center;
                        justify-content: center;
                    }

                    .dni-check-title {
                        font-size: 1.5rem;
                        font-weight: 700;
                        color: var(--text-primary, #1e293b);
                        margin: 0;
                    }

                    .dni-check-description {
                        color: var(--text-secondary, #64748b);
                        font-size: 0.9375rem;
                        max-width: 500px;
                        margin: 0;
                        line-height: 1.6;
                    }

                    .dni-input-wrapper {
                        width: 100%;
                        max-width: 450px;
                        display: flex;
                        flex-direction: column;
                        gap: 1rem;
                    }

                    .concesionaria-select-wrapper {
                        width: 100%;
                    }

                    .dni-check-actions {
                        display: flex;
                        gap: 1rem;
                        justify-content: center;
                        padding-top: 1rem;
                        border-top: 1px solid var(--border, #e2e8f0);
                        flex-wrap: wrap;
                    }

                    .existing-client-alert {
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        gap: 1.5rem;
                        padding: 2rem;
                    }

                    .alert-icon {
                        width: 80px;
                        height: 80px;
                        border-radius: 50%;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                    }

                    .alert-icon.warning {
                        background: rgba(245, 158, 11, 0.1);
                        color: rgb(245, 158, 11);
                    }

                    .alert-title {
                        font-size: 1.5rem;
                        font-weight: 700;
                        color: var(--text-primary, #1e293b);
                        margin: 0;
                    }

                    .alert-message {
                        color: var(--text-secondary, #64748b);
                        font-size: 1rem;
                        margin: 0;
                        text-align: center;
                    }

                    .alert-message strong {
                        color: var(--accent, #8b5cf6);
                        font-weight: 700;
                    }

                    .existing-client-info {
                        width: 100%;
                        max-width: 400px;
                        background: var(--bg-secondary, #f8fafc);
                        border-radius: 1rem;
                        padding: 1.5rem;
                        display: flex;
                        flex-direction: column;
                        gap: 1rem;
                        border: 1px solid var(--border, #e2e8f0);
                    }

                    .info-row {
                        display: flex;
                        align-items: center;
                        gap: 0.75rem;
                        color: var(--text-primary, #1e293b);
                        font-size: 0.9375rem;
                    }

                    .info-row.highlight {
                        background: var(--accent-light, rgba(139, 92, 246, 0.1));
                        padding: 0.75rem;
                        border-radius: 0.5rem;
                        margin: -0.25rem;
                        font-weight: 600;
                    }

                    .info-row svg {
                        color: var(--accent, #8b5cf6);
                        flex-shrink: 0;
                    }

                    .alert-actions {
                        display: flex;
                        gap: 1rem;
                        justify-content: center;
                        flex-wrap: wrap;
                        padding-top: 1rem;
                        border-top: 1px solid var(--border, #e2e8f0);
                        width: 100%;
                    }
                `}</style>
            </div>
        );
    }

    // Paso 2: Formulario completo
    return (
        <form onSubmit={handleSubmit} className="cliente-form">
            {isSuperAdmin && (
                <div className="form-section">
                    <div className="section-header">
                        <Building2 size={18} className="section-icon" />
                        <h3 className="section-title">Concesionaria</h3>
                    </div>
                    <Select
                        label="Seleccionar Concesionaria *"
                        name="concesionariaId"
                        value={formData.concesionariaId ?? ''}
                        onChange={handleChange}
                        options={concesionarias.map(c => ({ value: c.id, label: c.nombre }))}
                        required
                    />
                </div>
            )}

            <div className="form-section">
                <div className="section-header">
                    <User size={18} className="section-icon" />
                    <h3 className="section-title">Información Personal</h3>
                </div>
                <div className="form-grid">
                    <div className="full-width">
                        <Input
                            label="Nombre completo *"
                            name="nombre"
                            value={formData.nombre}
                            onChange={handleChange}
                            placeholder="ej. Juan Pérez"
                            icon={<User size={18} />}
                            required
                        />
                    </div>

                    <Input
                        label="CUIT/CUIL"
                        name="dni"
                        value={formData.dni}
                        onChange={handleChange}
                        placeholder="20-12345678-9"
                        icon={<FileText size={18} />}
                    />
                </div>
            </div>

            <div className="form-section">
                <div className="section-header">
                    <Phone size={18} className="section-icon" />
                    <h3 className="section-title">Datos de Contacto</h3>
                </div>
                <div className="form-grid">
                    <Input
                        label="Teléfono"
                        name="telefono"
                        value={formData.telefono}
                        onChange={handleChange}
                        placeholder="+54 11 1234-5678"
                        icon={<Phone size={18} />}
                    />

                    <Input
                        label="Email"
                        name="email"
                        type="email"
                        value={formData.email}
                        onChange={handleChange}
                        placeholder="cliente@email.com"
                        icon={<Mail size={18} />}
                    />

                    <div className="full-width">
                        <Input
                            label="Dirección"
                            name="direccion"
                            value={formData.direccion}
                            onChange={handleChange}
                            placeholder="Av. Corrientes 1234, CABA"
                            icon={<MapPin size={18} />}
                        />
                    </div>
                </div>
            </div>

            <div className="form-section">
                <div className="section-header">
                    <MessageSquare size={18} className="section-icon" />
                    <h3 className="section-title">Observaciones</h3>
                </div>
                <div className="textarea-wrapper">
                    <textarea
                        name="observaciones"
                        value={formData.observaciones}
                        onChange={handleChange}
                        placeholder="Notas adicionales sobre el cliente..."
                        rows={4}
                        className="custom-textarea"
                    />
                </div>
            </div>

            <div className="form-actions">
                <Button type="button" variant="secondary" onClick={onCancel} disabled={loading}>
                    Cancelar
                </Button>
                <Button type="submit" variant="primary" loading={loading}>
                    {initialData ? 'Actualizar Cliente' : 'Crear Cliente'}
                </Button>
            </div>

            <style>{`
                .cliente-form {
                    display: flex;
                    flex-direction: column;
                    gap: 1.75rem;
                }

                .form-section {
                    background: var(--bg-secondary, #f8fafc);
                    border-radius: 1rem;
                    padding: 1.5rem;
                    border: 1px solid var(--border, #e2e8f0);
                    transition: all 0.2s ease;
                }

                .form-section:hover {
                    border-color: var(--accent-light, #ddd6fe);
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
                }

                .section-header {
                    display: flex;
                    align-items: center;
                    gap: 0.75rem;
                    margin-bottom: 1.25rem;
                    padding-bottom: 0.75rem;
                    border-bottom: 2px solid var(--border, #e2e8f0);
                }

                .section-icon {
                    color: var(--accent, #8b5cf6);
                    flex-shrink: 0;
                }

                .section-title {
                    font-size: 0.95rem;
                    font-weight: 700;
                    color: var(--text-primary, #1e293b);
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                    margin: 0;
                }

                .form-grid {
                    display: grid;
                    grid-template-columns: repeat(2, 1fr);
                    gap: 1.25rem;
                }

                .form-grid .full-width {
                    grid-column: 1 / -1;
                }

                .textarea-wrapper {
                    position: relative;
                }

                .custom-textarea {
                    width: 100%;
                    padding: 1rem;
                    background: var(--bg-primary, #ffffff);
                    border: 1.5px solid var(--border, #e2e8f0);
                    border-radius: 0.875rem;
                    color: var(--text-primary, #1e293b);
                    font-size: 0.9375rem;
                    font-family: inherit;
                    resize: vertical;
                    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                    min-height: 100px;
                }

                .custom-textarea:focus {
                    outline: none;
                    border-color: var(--accent, #8b5cf6);
                    box-shadow: 0 0 0 4px rgba(139, 92, 246, 0.1);
                    background: var(--bg-card, #ffffff);
                }

                .custom-textarea::placeholder {
                    color: var(--text-muted, #94a3b8);
                }

                .form-actions {
                    display: flex;
                    gap: 1rem;
                    justify-content: flex-end;
                    padding-top: 1rem;
                    border-top: 1px solid var(--border, #e2e8f0);
                    margin-top: 0.5rem;
                }

                .form-actions button {
                    min-width: 140px;
                }

                @media (max-width: 640px) {
                    .form-grid {
                        grid-template-columns: 1fr;
                    }

                    .form-actions {
                        flex-direction: column;
                    }

                    .form-actions button {
                        width: 100%;
                    }
                }
            `}</style>
        </form>
    );
};

export default ClienteForm;

