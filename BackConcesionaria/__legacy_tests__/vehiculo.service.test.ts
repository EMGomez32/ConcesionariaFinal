import { deleteVehiculo } from './vehiculo.service';
import { prismaMock } from '../../tests/singleton';
import ApiError from '../../utils/ApiError';

describe('VehiculoService', () => {
    describe('deleteVehiculo', () => {
        beforeEach(() => {
            jest.clearAllMocks();
        });

        it('should throw ApiError (404) if vehicle is not found', async () => {
            prismaMock.vehiculo.findUnique.mockResolvedValue(null);

            await expect(deleteVehiculo(999)).rejects.toThrow(ApiError);
            await expect(deleteVehiculo(999)).rejects.toThrow('Vehículo no encontrado');
        });

        it('should throw ApiError (400) if vehicle has related sales', async () => {
            prismaMock.vehiculo.findUnique.mockResolvedValue({ id: 1 } as any);
            prismaMock.venta.count.mockResolvedValue(1); // Has sales

            await expect(deleteVehiculo(1)).rejects.toThrow(ApiError);
            await expect(deleteVehiculo(1)).rejects.toThrow('No se puede eliminar el vehículo porque tiene ventas asociadas');
        });

        it('should throw ApiError (400) if vehicle has active reservations', async () => {
            prismaMock.vehiculo.findUnique.mockResolvedValue({ id: 1 } as any);
            prismaMock.venta.count.mockResolvedValue(0); // No sales
            prismaMock.reserva.count.mockResolvedValue(1); // Has reservations

            await expect(deleteVehiculo(1)).rejects.toThrow(ApiError);
            await expect(deleteVehiculo(1)).rejects.toThrow('No se puede eliminar el vehículo porque tiene una reserva activa');
        });

        it('should delete vehicle if it has no sales or active reservations', async () => {
            prismaMock.vehiculo.findUnique.mockResolvedValue({ id: 1 } as any);
            prismaMock.venta.count.mockResolvedValue(0);
            prismaMock.reserva.count.mockResolvedValue(0);

            prismaMock.vehiculo.delete.mockResolvedValue({ id: 1 } as any);

            const result = await deleteVehiculo(1);

            expect(prismaMock.vehiculo.delete).toHaveBeenCalledWith({ where: { id: 1 } });
            expect(result).toEqual({ id: 1 });
        });
    });
});
