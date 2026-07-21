import { createVenta } from './venta.service';
import { prismaMock } from '../../tests/singleton';
import ApiError from '../../utils/ApiError';

describe('VentasService', () => {
    describe('createVenta', () => {
        beforeEach(() => {
            jest.clearAllMocks();
            // Mock $transaction to simply execute the callback with the prismaMock
            prismaMock.$transaction.mockImplementation(async (callback: any) => {
                return callback(prismaMock);
            });
        });

        it('should throw ApiError (404) if vehicle is not found', async () => {
            prismaMock.vehiculo.findUnique.mockResolvedValue(null);

            await expect(createVenta({ vehiculoId: 999, precioVenta: 10000 }))
                .rejects.toThrow(ApiError);
            await expect(createVenta({ vehiculoId: 999, precioVenta: 10000 }))
                .rejects.toThrow('Vehículo no encontrado');
        });

        it('should throw ApiError (400) if vehicle is already sold', async () => {
            prismaMock.vehiculo.findUnique.mockResolvedValue({
                id: 1,
                concesionariaId: 1,
                estado: 'vendido',
            } as any);

            await expect(createVenta({ vehiculoId: 1, precioVenta: 10000 }))
                .rejects.toThrow(ApiError);
            await expect(createVenta({ vehiculoId: 1, precioVenta: 10000 }))
                .rejects.toThrow('El vehículo ya está vendido');
        });

        it('should create the sale and update the vehicle status if available', async () => {
            prismaMock.vehiculo.findUnique.mockResolvedValue({
                id: 1,
                concesionariaId: 1,
                estado: 'publicado',
            } as any);

            prismaMock.venta.create.mockResolvedValue({
                id: 1,
                vehiculoId: 1,
                estado: 'finalizada'
            } as any);

            const result = await createVenta({ vehiculoId: 1, precioVenta: 15000 });

            expect(prismaMock.venta.create).toHaveBeenCalled();
            expect(prismaMock.vehiculo.update).toHaveBeenCalledWith({
                where: { id: 1 },
                data: { estado: 'vendido' }
            });
            expect(result.id).toBe(1);
        });

        it('should update reservation status if reservaId is provided', async () => {
            prismaMock.vehiculo.findUnique.mockResolvedValue({
                id: 1,
                concesionariaId: 1,
                estado: 'reservado',
            } as any);

            prismaMock.venta.create.mockResolvedValue({
                id: 1,
                vehiculoId: 1,
                estado: 'finalizada'
            } as any);

            await createVenta({ vehiculoId: 1, precioVenta: 15000, reservaId: 5 });

            expect(prismaMock.reserva.update).toHaveBeenCalledWith({
                where: { id: 5 },
                data: { estado: 'convertida_en_venta' }
            });
        });
    });
});
