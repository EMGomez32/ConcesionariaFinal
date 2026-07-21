export type EstadoPresupuesto = 'borrador' | 'enviado' | 'aceptado' | 'rechazado' | 'vencido' | 'cancelado';

export interface Presupuesto {
    id: number;
    nroPresupuesto: string;
    clienteId: number;
    vendedorId: number;
    fechaCreacion: string;
    validoHasta?: string;
    estado: EstadoPresupuesto;
    moneda: string;
    total?: number;

    // Relaciones
    cliente?: { nombre: string };
    vendedor?: { nombre: string };
    items?: unknown[];
}
