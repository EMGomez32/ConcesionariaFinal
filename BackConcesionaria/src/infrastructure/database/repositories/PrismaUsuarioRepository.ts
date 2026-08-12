import { IUsuarioRepository } from '../../../domain/repositories/IUsuarioRepository';
import { Usuario } from '../../../domain/entities/Usuario';
import prisma from '../prisma';
import { withTenantTransaction } from '../unitOfWork';
import { context } from '../../security/context';
import { QueryOptions, PaginatedResponse } from '../../../types/common';

export class PrismaUsuarioRepository implements IUsuarioRepository {
    async findAll(filter: any = {}, options: QueryOptions = {}): Promise<PaginatedResponse<Usuario>> {
        const { limit = 20, page = 1, sortBy = 'createdAt', sortOrder = 'desc' } = options;
        const limitNum = Number(limit);
        const pageNum = Number(page);

        // Build where clause with contains for text fields
        const whereClause: any = {};
        
        if (filter.nombre) {
            whereClause.nombre = { contains: filter.nombre, mode: 'insensitive' };
        }
        if (filter.email) {
            whereClause.email = { contains: filter.email, mode: 'insensitive' };
        }
        if (filter.concesionariaId !== undefined) {
            whereClause.concesionariaId = filter.concesionariaId;
        }
        if (filter.sucursalId !== undefined) {
            whereClause.sucursalId = filter.sucursalId;
        }
        if (filter.activo !== undefined) {
            whereClause.activo = filter.activo === 'true' || filter.activo === true;
        }

        const results = await prisma.usuario.findMany({
            where: whereClause,
            take: limitNum,
            skip: (pageNum - 1) * limitNum,
            orderBy: { [sortBy as string]: sortOrder },
            include: {
                roles: {
                    include: { rol: true }
                },
                sucursal: true,
                concesionaria: true
            }
        });

        const total = await prisma.usuario.count({ where: whereClause });

        return {
            results: results.map(this.mapToEntity),
            page: pageNum,
            limit: limitNum,
            totalPages: Math.ceil(total / limitNum),
            totalResults: total,
        };
    }

    async findById(id: number): Promise<Usuario | null> {
        const u = await prisma.usuario.findUnique({
            where: { id },
            include: {
                roles: {
                    include: { rol: true }
                },
                sucursal: true,
                concesionaria: true
            }
        });
        return u ? this.mapToEntity(u) : null;
    }

    async findByEmail(email: string): Promise<Usuario | null> {
        const u = await prisma.usuario.findFirst({
            where: { email },
            include: {
                roles: {
                    include: { rol: true }
                },
                sucursal: true
            }
        });
        return u ? this.mapToEntity(u) : null;
    }

    async findByEmailInConcesionaria(email: string, concesionariaId: number): Promise<Usuario | null> {
        const u = await prisma.usuario.findFirst({
            where: { email, concesionariaId },
        });
        return u ? this.mapToEntity(u) : null;
    }

    async create(data: any): Promise<Usuario> {
        const { roleIds, ...userData } = data;
        const u = await prisma.usuario.create({
            data: {
                ...userData,
                roles: {
                    create: roleIds.map((rolId: number) => ({ rolId }))
                }
            },
            include: {
                roles: {
                    include: { rol: true }
                },
                sucursal: true
            }
        });
        return this.mapToEntity(u);
    }

    async update(id: number, data: any): Promise<Usuario> {
        const { roleIds, ...userData } = data;
        const updateData: any = { ...userData };

        const isSuper = context.getUser()?.roles?.includes('super_admin') || false;
        const tenantWhere = isSuper ? {} : { concesionariaId: context.getTenantId() ?? undefined };

        // Unit of Work: la reasignación de roles (borrar los viejos + crear los nuevos
        // vía el nested update) debe ser ATÓMICA. Antes NO había transacción: si fallaba
        // el update tras el deleteMany, el usuario quedaba con CERO roles (pierde todos
        // sus permisos). UsuarioRol es tabla puente SIN concesionaria_id (no está en
        // TENANT_TABLES), así que el deleteMany por usuarioId es el hard-delete correcto.
        // El usuario.update lleva filtro tenant/deletedAt a mano (el tx raw no pasa por la
        // extensión); si el id no fuera del tenant, el update tira P2025 y revierte el
        // deleteMany.
        return withTenantTransaction(async (tx) => {
            if (roleIds) {
                await tx.usuarioRol.deleteMany({ where: { usuarioId: id } });
                updateData.roles = {
                    create: roleIds.map((rolId: number) => ({ rolId }))
                };
            }

            const u = await tx.usuario.update({
                where: { id, ...tenantWhere, deletedAt: null },
                data: updateData,
                include: {
                    roles: {
                        include: { rol: true }
                    },
                    sucursal: true
                }
            });
            return this.mapToEntity(u);
        });
    }

    async delete(id: number): Promise<void> {
        await prisma.usuario.delete({ where: { id } });
    }

    private mapToEntity(u: any): Usuario {
        return new Usuario(
            u.id,
            u.concesionariaId,
            u.sucursalId,
            u.nombre,
            u.email,
            u.passwordHash,
            u.activo,
            u.createdAt,
            u.updatedAt,
            u.deletedAt,
            u.roles,
            u.sucursal,
            u.comisionPorcentaje != null ? Number(u.comisionPorcentaje) : null
        );
    }
}
