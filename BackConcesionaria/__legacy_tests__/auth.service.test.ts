import { login } from './auth.service';
import { prismaMock } from '../tests/singleton';
import bcrypt from 'bcryptjs';
import ApiError from '../utils/ApiError';
import config from '../config';

jest.mock('bcryptjs');

describe('AuthService', () => {
    describe('login', () => {
        const mockUser = {
            id: 1,
            concesionariaId: 1,
            sucursalId: 1,
            nombre: 'Admin',
            email: 'admin@test.com',
            passwordHash: 'hashedpassword',
            activo: true,
            createdAt: new Date(),
            updatedAt: new Date(),
            deletedAt: null,
            roles: [
                {
                    usuarioId: 1,
                    rolId: 1,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    deletedAt: null,
                    rol: {
                        id: 1,
                        concesionariaId: 1,
                        nombre: 'admin',
                        descripcion: 'Admin role',
                        isSuperAdmin: false,
                        permisos: [],
                        createdAt: new Date(),
                        updatedAt: new Date(),
                        deletedAt: null,
                    }
                }
            ]
        };

        beforeEach(() => {
            jest.clearAllMocks();
        });

        it('should throw ApiError if user is not found', async () => {
            prismaMock.usuario.findFirst.mockResolvedValue(null);

            await expect(login('wrong@test.com', 'password')).rejects.toThrow(ApiError);
            await expect(login('wrong@test.com', 'password')).rejects.toThrow('Credenciales inválidas');
        });

        it('should throw ApiError if password does not match', async () => {
            prismaMock.usuario.findFirst.mockResolvedValue(mockUser);
            (bcrypt.compare as jest.Mock).mockResolvedValue(false);

            await expect(login('admin@test.com', 'wrongpassword')).rejects.toThrow(ApiError);
            await expect(login('admin@test.com', 'wrongpassword')).rejects.toThrow('Credenciales inválidas');
        });

        it('should throw ApiError if user is inactive', async () => {
            const inactiveUser = { ...mockUser, activo: false };
            prismaMock.usuario.findFirst.mockResolvedValue(inactiveUser);
            (bcrypt.compare as jest.Mock).mockResolvedValue(true);

            await expect(login('admin@test.com', 'password')).rejects.toThrow(ApiError);
            await expect(login('admin@test.com', 'password')).rejects.toThrow('Usuario inactivo');
        });

        it('should return tokens and user data if valid credentials', async () => {
            prismaMock.usuario.findFirst.mockResolvedValue(mockUser);
            (bcrypt.compare as jest.Mock).mockResolvedValue(true);

            const result = await login('admin@test.com', 'password');

            expect(result).toHaveProperty('user');
            expect(result).toHaveProperty('tokens');
            expect(result.user.email).toBe('admin@test.com');
            expect(result.tokens.access.token).toBeDefined();
            expect(result.tokens.refresh.token).toBeDefined();
        });
    });
});
