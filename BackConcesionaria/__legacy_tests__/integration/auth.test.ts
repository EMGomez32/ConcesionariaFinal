import request from 'supertest';
import app from '../../app';
import { prismaMock } from '../singleton';
import bcrypt from 'bcryptjs';

describe('Auth API', () => {
    describe('POST /api/auth/login', () => {
        beforeEach(() => {
            jest.clearAllMocks();
        });

        it('should return 401 if credentials are invalid', async () => {
            prismaMock.usuario.findFirst.mockResolvedValue(null);

            const res = await request(app)
                .post('/api/auth/login')
                .send({ email: 'test@example.com', password: 'password123' });

            expect(res.status).toBe(401);
            expect(res.body.success).toBe(false);
            expect(res.body.error.message).toBe('Credenciales inválidas');
        });

        it('should return 200 and tokens if successful', async () => {
            const mockUser = {
                id: 1,
                concesionariaId: 1,
                sucursalId: 1,
                nombre: 'Admin',
                email: 'test@example.com',
                passwordHash: await bcrypt.hash('password123', 10),
                activo: true,
                roles: [
                    {
                        rol: { nombre: 'admin', deletedAt: null },
                        deletedAt: null
                    }
                ]
            };

            prismaMock.usuario.findFirst.mockResolvedValue(mockUser as any);

            const res = await request(app)
                .post('/api/auth/login')
                .send({ email: 'test@example.com', password: 'password123' });

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.data).toHaveProperty('user');
            expect(res.body.data).toHaveProperty('tokens');
            expect(res.body.data.user.email).toBe('test@example.com');
            expect(res.body.data.tokens.access.token).toBeDefined();
        });
    });
});
