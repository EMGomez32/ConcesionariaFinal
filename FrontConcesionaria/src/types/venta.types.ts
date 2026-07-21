export type FormaPagoVenta = 'contado' | 'transferencia' | 'financiado_propio' | 'financiado_externo' | 'canje_mas_diferencia' | 'mixto';
export type EstadoEntrega = 'pendiente' | 'bloqueada' | 'autorizada' | 'entregada' | 'cancelada';

export interface Venta {
    id: number;
    concesionariaId: number;
    sucursalId: number;
    vehiculoId: number;
    presupuestoId?: number;
    clienteId: number;
    vendedorId: number;
    fechaVenta: string;
    precioVenta: number;
    moneda: string;
    formaPago: FormaPagoVenta;
    observaciones?: string;
    estadoEntrega: EstadoEntrega;
    fechaEntrega?: string;
    createdAt: string;

    // Relaciones
    vehiculo?: { marca: string; modelo: string; dominio: string };
    cliente?: { nombre: string; email?: string };
    vendedor?: { nombre: string };
    sucursal?: { id: number; nombre: string };
    pagos?: { id: number; monto: number; metodo: string; referencia?: string; observaciones?: string }[];
    canjes?: { id: number; vehiculoCanjeId: number; valorTomado: number }[];
}
