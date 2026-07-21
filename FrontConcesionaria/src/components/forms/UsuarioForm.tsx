import React, { useState, useEffect } from 'react';
import type { Usuario, CreateUsuarioDto, UpdateUsuarioDto, Rol } from '../../types/usuario.types';
import type { Sucursal } from '../../types/sucursal.types';
import type { Concesionaria } from '../../types/concesionaria.types';
import { rolesApi } from '../../api/roles.api';
import { sucursalesApi } from '../../api/sucursales.api';
import { concesionariasApi } from '../../api/concesionarias.api';
import { useAuthStore } from '../../store/authStore';
import Input from '../ui/Input';
import Button from '../ui/Button';
import { User, Mail, Lock, Building2, MapPin, ShieldCheck } from 'lucide-react';

interface UsuarioFormProps {
    usuario?: Usuario;
    onSave: (data: CreateUsuarioDto | UpdateUsuarioDto) => void;
    onCancel: () => void;
    loading?: boolean;
}

const UsuarioForm: React.FC<UsuarioFormProps> = ({ usuario, onSave, onCancel, loading: isSubmitting }) => {
    const { user: currentUser } = useAuthStore();
    const isSuperAdmin = currentUser?.roles.includes('super_admin');

    const [formData, setFormData] = useState({
        nombre: usuario?.nombre || '',
        email: usuario?.email || '',
        password: '',
        sucursalId: usuario?.sucursalId || 0,
        roleIds: usuario?.roles?.map(r => r.rolId) || [] as number[],
    });

    const [concesionarias, setConcesionarias] = useState<Concesionaria[]>([]);
    const [selectedConcesionariaId, setSelectedConcesionariaId] = useState<number>(
        usuario?.sucursal?.concesionariaId || currentUser?.concesionariaId || 0
    );
    const [sucursales, setSucursales] = useState<Sucursal[]>([]);
    const [roles, setRoles] = useState<Rol[]>([]);
    const [loadingData, setLoadingData] = useState(true);

    useEffect(() => {
        const loadInitialData = async () => {
            try {
                const rolesRes = await rolesApi.getAll() as { results?: Rol[] } | Rol[];
                setRoles(Array.isArray(rolesRes) ? rolesRes : (rolesRes?.results ?? []));

                if (isSuperAdmin) {
                    // Super admin: load all concesionarias
                    const concRes = await concesionariasApi.getAll() as { results?: Concesionaria[] } | Concesionaria[];
                    setConcesionarias(Array.isArray(concRes) ? concRes : (concRes?.results ?? []));
                } else if (currentUser?.concesionariaId) {
                    // Admin: load only sucursales from their concesionaria
                    const sucRes = await sucursalesApi.getAll({ concesionariaId: currentUser.concesionariaId }) as { results?: Sucursal[] } | Sucursal[];
                    setSucursales(Array.isArray(sucRes) ? sucRes : (sucRes?.results ?? []));
                }
            } catch (error) {
                console.error('Error al cargar datos del formulario:', error);
            } finally {
                setLoadingData(false);
            }
        };

        loadInitialData();
    }, [isSuperAdmin, currentUser, usuario]);

    useEffect(() => {
        // Only load sucursales when super_admin selects a concesionaria
        if (isSuperAdmin && selectedConcesionariaId) {
            const loadSucursales = async () => {
                try {
                    const res = await sucursalesApi.getAll({ concesionariaId: selectedConcesionariaId }) as { results?: Sucursal[] } | Sucursal[];
                    setSucursales(Array.isArray(res) ? res : (res?.results ?? []));
                } catch (error) {
                    console.error('Error al cargar sucursales:', error);
                }
            };
            loadSucursales();
        }
    }, [selectedConcesionariaId, isSuperAdmin]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: name === 'sucursalId' ? parseInt(value) : value,
        }));
    };

    const handleRoleToggle = (rolId: number) => {
        setFormData(prev => {
            const exists = prev.roleIds.includes(rolId);
            if (exists) {
                return { ...prev, roleIds: prev.roleIds.filter(id => id !== rolId) };
            } else {
                return { ...prev, roleIds: [...prev.roleIds, rolId] };
            }
        });
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const payload = {
            ...formData,
            // sucursalId 0 = "no seleccionada": se manda undefined para no violar
            // la FK (no existe sucursal 0). La columna es nullable.
            sucursalId: formData.sucursalId || undefined,
            // Sólo super_admin elige el tenant; para un admin lo pone el backend
            // desde el token (y el body se ignora), así que no hace falta mandarlo.
            ...(isSuperAdmin ? { concesionariaId: selectedConcesionariaId } : {}),
        };
        onSave(payload as unknown as CreateUsuarioDto | UpdateUsuarioDto);
    };

    if (loadingData) {
        return (
            <div className="loading-state">
                <p>Cargando datos del formulario...</p>
                <style>{`.loading-state { padding: 3rem; text-align: center; color: var(--text-muted); }`}</style>
            </div>
        );
    }

    return (
        <form onSubmit={handleSubmit} className="usuario-form">
            <div className="form-grid">
                <Input
                    label="Nombre Completo *"
                    name="nombre"
                    value={formData.nombre}
                    onChange={handleChange}
                    placeholder="Ej: Juan Pérez"
                    icon={<User size={18} />}
                    required
                />

                <Input
                    label="Email *"
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    placeholder="juan@empresa.com"
                    icon={<Mail size={18} />}
                    required
                />

                {!usuario && (
                    <div className="full-width">
                        <Input
                            label="Contraseña Inicial *"
                            type="password"
                            name="password"
                            value={formData.password}
                            onChange={handleChange}
                            placeholder="Mínimo 6 caracteres"
                            icon={<Lock size={18} />}
                            required
                        />
                    </div>
                )}

                {isSuperAdmin && (
                    <div className="input-group">
                        <label className="input-label">Concesionaria *</label>
                        <div className="input-container">
                            <span className="input-icon"><Building2 size={18} /></span>
                            <select
                                value={selectedConcesionariaId}
                                onChange={(e) => setSelectedConcesionariaId(parseInt(e.target.value))}
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
                )}

                <div className="input-group">
                    <label className="input-label">Sucursal *</label>
                    <div className="input-container">
                        <span className="input-icon"><MapPin size={18} /></span>
                        <select
                            name="sucursalId"
                            value={formData.sucursalId}
                            onChange={handleChange}
                            required
                            className="with-icon"
                            disabled={isSuperAdmin && !selectedConcesionariaId}
                        >
                            <option value="">Seleccione Sucursal</option>
                            {sucursales.map(s => (
                                <option key={s.id} value={s.id}>{s.nombre}</option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className="full-width">
                    <div className="input-group">
                        <label className="input-label">
                            <ShieldCheck size={16} style={{ display: 'inline', marginRight: '0.5rem' }} />
                            Roles *
                        </label>
                        <div className="roles-grid">
                            {roles.map(rol => (
                                <label key={rol.id} className="role-checkbox">
                                    <input
                                        type="checkbox"
                                        checked={formData.roleIds.includes(rol.id)}
                                        onChange={() => handleRoleToggle(rol.id)}
                                    />
                                    <span>{rol.nombre}</span>
                                </label>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            <div className="form-actions full-width">
                <Button type="button" variant="secondary" onClick={onCancel} style={{ paddingLeft: '2rem', paddingRight: '2rem' }}>
                    Cancelar
                </Button>
                <Button type="submit" variant="primary" loading={isSubmitting} style={{ paddingLeft: '2.5rem', paddingRight: '2.5rem' }}>
                    {usuario ? 'Actualizar Usuario' : 'Crear Usuario'}
                </Button>
            </div>

            <style>{`
                .usuario-form {
                    padding: 0.5rem 0;
                }
                .form-grid {
                    display: grid;
                    grid-template-columns: repeat(2, 1fr);
                    gap: 1.5rem;
                }
                .full-width {
                    grid-column: span 2;
                }
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
                .roles-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
                    gap: 0.75rem;
                    padding: 1rem;
                    background: var(--bg-secondary);
                    border: 1.5px solid var(--border);
                    border-radius: 1rem;
                }
                .role-checkbox {
                    display: flex;
                    align-items: center;
                    gap: 0.625rem;
                    padding: 0.625rem 0.875rem;
                    background: var(--bg-primary);
                    border-radius: 0.75rem;
                    cursor: pointer;
                    transition: all 0.2s;
                    border: 1px solid transparent;
                }
                .role-checkbox:hover {
                    background: var(--bg-card);
                    border-color: var(--accent-light);
                }
                .role-checkbox input[type="checkbox"] {
                    width: 1.125rem;
                    height: 1.125rem;
                    cursor: pointer;
                    accent-color: var(--accent);
                }
                .role-checkbox span {
                    font-size: 0.875rem;
                    font-weight: 600;
                    color: var(--text-primary);
                    text-transform: capitalize;
                }
                .form-actions {
                    display: flex;
                    justify-content: flex-end;
                    gap: 1rem;
                    margin-top: 2rem;
                    padding-top: 2rem;
                    border-top: 1px solid var(--border);
                }
                .usuario-form :global(.input-group) {
                    margin-bottom: 0;
                }
            `}</style>
        </form>
    );
};

export default UsuarioForm;