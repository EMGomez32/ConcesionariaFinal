export type TipoVehiculo = 'USADO' | 'CERO_KM';
export type OrigenVehiculo = 'compra' | 'permuta' | 'consignacion' | 'otro';
export type EstadoVehiculo = 'preparacion' | 'publicado' | 'reservado' | 'vendido' | 'devuelto';

export interface Vehiculo {
    id: number;
    concesionariaId: number;
    sucursalId: number;
    tipo: TipoVehiculo;
    origen: OrigenVehiculo;
    marca: string;
    modelo: string;
    version?: string;
    anio?: number;
    dominio?: string;
    vin?: string;
    kmIngreso?: number;
    color?: string;
    estado: EstadoVehiculo;
    fechaIngreso: string;
    fechaCompra?: string;
    precioCompra?: number;
    precioLista?: number;
    moneda?: 'ARS' | 'USD';
    proveedorCompraId?: number;
    // Campo que el formulario transporta para registrar el ingreso (no es un
    // campo propio del vehículo).
    clienteOrigenId?: number;
    formaPagoCompra?: string;
    observaciones?: string;
    createdAt: string;
    updatedAt: string;

    // Relaciones (opcionales según el endpoint)
    sucursal?: { id: number; nombre: string };
    archivos?: unknown[];
}

export interface VehiculoFilter {
    search?: string;
    marca?: string;
    modelo?: string;
    /** Uno o varios estados. El array se serializa separado por coma. */
    estado?: EstadoVehiculo | EstadoVehiculo[];
    tipo?: TipoVehiculo;
    dominio?: string;
    sucursalId?: number;
}

export interface PaginationOptions {
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
}
