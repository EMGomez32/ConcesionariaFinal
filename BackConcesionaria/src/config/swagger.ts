import swaggerJsdoc from 'swagger-jsdoc';
import config from './index';

const options: swaggerJsdoc.Options = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'Concesionaria SaaS API',
            version: '1.0.0',
            description: [
                'API para la gestión centralizada de concesionarias multimarcas.',
                '',
                '**Auth**: la mayoría de los endpoints requieren `Authorization: Bearer <accessToken>`.',
                'Obtener el token via `POST /auth/login`.',
                '',
                '**Multi-tenancy**: las requests están aisladas por `concesionariaId` automáticamente',
                '(extension de Prisma + RLS de Postgres). Para `super_admin` el aislamiento se bypassa.',
            ].join('\n'),
            contact: { name: 'Soporte Técnico' },
        },
        servers: [
            {
                url: `http://localhost:${config.port || 3000}/api`,
                description: 'Servidor de desarrollo',
            },
        ],
        components: {
            securitySchemes: {
                bearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT',
                },
            },
            schemas: {
                ErrorResponse: {
                    type: 'object',
                    properties: {
                        error: { type: 'string', example: 'VALIDATION_ERROR' },
                        message: { type: 'string', example: 'El nombre es obligatorio' },
                        correlationId: { type: 'string', example: 'a3b9f2' },
                    },
                },
                LoginRequest: {
                    type: 'object',
                    required: ['email', 'password'],
                    properties: {
                        email: { type: 'string', format: 'email', example: 'superadmin@demo.com' },
                        password: { type: 'string', example: 'super123' },
                    },
                },
                LoginResponse: {
                    type: 'object',
                    properties: {
                        user: {
                            type: 'object',
                            properties: {
                                id: { type: 'integer' },
                                nombre: { type: 'string' },
                                email: { type: 'string', format: 'email' },
                                roles: { type: 'array', items: { type: 'string' } },
                                concesionariaId: { type: 'integer', nullable: true },
                                sucursalId: { type: 'integer', nullable: true },
                            },
                        },
                        tokens: {
                            type: 'object',
                            properties: {
                                access: { type: 'string' },
                                refresh: { type: 'string' },
                            },
                        },
                    },
                },
                PaginationMeta: {
                    type: 'object',
                    properties: {
                        page: { type: 'integer', example: 1 },
                        limit: { type: 'integer', example: 20 },
                        totalPages: { type: 'integer', example: 5 },
                        totalResults: { type: 'integer', example: 87 },
                    },
                },
                AuditLog: {
                    type: 'object',
                    properties: {
                        id: { type: 'integer' },
                        concesionariaId: { type: 'integer' },
                        usuarioId: { type: 'integer', nullable: true },
                        entidad: { type: 'string', example: 'Proveedor' },
                        entidadId: { type: 'integer', nullable: true },
                        accion: {
                            type: 'string',
                            enum: ['create', 'update', 'cancel', 'delete_soft', 'login', 'logout'],
                        },
                        detalle: { type: 'string', nullable: true },
                        ip: { type: 'string', nullable: true },
                        userAgent: { type: 'string', nullable: true },
                        createdAt: { type: 'string', format: 'date-time' },
                    },
                },
            },
            responses: {
                Unauthorized: {
                    description: 'Token JWT inválido o ausente',
                    content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
                },
                Forbidden: {
                    description: 'El rol del usuario no tiene permiso para esta operación',
                    content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
                },
                NotFound: {
                    description: 'Recurso no encontrado (o oculto por RLS)',
                    content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
                },
                ValidationError: {
                    description: 'Body inválido o falta campo obligatorio',
                    content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
                },
                InvalidStateTransition: {
                    description: 'Transición de estado inválida según la state machine',
                    content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
                },
                Conflict: {
                    description: 'Recurso duplicado o violación de unicidad',
                    content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
                },
            },
            parameters: {
                pageParam: {
                    name: 'page', in: 'query', schema: { type: 'integer', default: 1 },
                    description: 'Número de página (1-indexed)',
                },
                limitParam: {
                    name: 'limit', in: 'query', schema: { type: 'integer', default: 20 },
                    description: 'Tamaño de página',
                },
            },
        },
        security: [{ bearerAuth: [] }],
        tags: [
            { name: 'Auth', description: 'Login, refresh, logout, reset password' },
            { name: 'Concesionarias', description: 'Tenants de la plataforma SaaS (super_admin only)' },
            { name: 'Sucursales', description: 'Sucursales de cada concesionaria' },
            { name: 'Usuarios', description: 'Usuarios y asignación de roles' },
            { name: 'Clientes', description: 'CRM de clientes' },
            { name: 'Proveedores', description: 'Proveedores' },
            { name: 'Vehículos', description: 'Inventario de vehículos + archivos + movimientos' },
            { name: 'Reservas', description: 'Reservas con seña' },
            { name: 'Presupuestos', description: 'Presupuestos comerciales' },
            { name: 'Ventas', description: 'Ventas + pagos + extras + canjes + estado de entrega' },
            { name: 'Financiación', description: 'Financiación propia y externa' },
            { name: 'Gastos', description: 'Gastos vehiculares y fijos' },
            { name: 'Postventa', description: 'Casos de postventa e ítems' },
            { name: 'Auditoría', description: 'Log de auditoría + export CSV' },
            { name: 'Billing', description: 'Planes SaaS, suscripciones, facturas, pagos' },
        ],
    },
    apis: [
        './src/interface/routes/*.ts',
        './src/interface/controllers/*.ts',
        './src/modules/**/*.routes.ts',
        './src/modules/**/*.controller.ts',
    ],
};

const specs = swaggerJsdoc(options);

export default specs;
