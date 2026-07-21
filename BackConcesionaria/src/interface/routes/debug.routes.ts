import { Router, Request, Response } from 'express';
import { context } from '../../infrastructure/security/context';
import { authenticate } from '../middlewares/authenticate.middleware';
import prisma from '../../infrastructure/database/prisma';

const router = Router();

router.get('/me', authenticate, (req: Request, res: Response) => {
    const userContext = context.getUser();
    const tenantId = context.getTenantId();
    
    res.json({
        success: true,
        data: {
            userContext,
            tenantId,
            isSuperAdmin: userContext?.roles?.includes('super_admin'),
            requestUser: (req as any).user,
        }
    });
});

router.get('/concesionarias-raw', authenticate, async (req: Request, res: Response) => {
    try {
        const userContext = context.getUser();
        
        // Query directly bypassing extension
        const count = await prisma.$queryRaw`SELECT COUNT(*) FROM concesionarias WHERE deleted_at IS NULL`;
        const concesionarias = await prisma.$queryRaw`SELECT * FROM concesionarias WHERE deleted_at IS NULL LIMIT 10`;
        
        res.json({
            success: true,
            data: {
                userContext,
                count,
                concesionarias
            }
        });
    } catch (error: any) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

router.get('/usuarios-debug', authenticate, async (req: Request, res: Response) => {
    try {
        const userContext = context.getUser();
        const tenantId = context.getTenantId();
        
        // Query directly to see all users
        const allUsers = await prisma.$queryRaw`
            SELECT id, nombre, email, concesionaria_id, deleted_at, created_at 
            FROM usuarios 
            ORDER BY created_at DESC 
            LIMIT 20
        `;
        
        // Query with deleted_at filter
        const activeUsers = await prisma.$queryRaw`
            SELECT id, nombre, email, concesionaria_id, deleted_at, created_at 
            FROM usuarios 
            WHERE deleted_at IS NULL
            ORDER BY created_at DESC 
            LIMIT 20
        `;

        // Query with tenant filter (if not super admin)
        let tenantUsers: any = [];
        if (tenantId && !userContext?.roles?.includes('super_admin')) {
            tenantUsers = await prisma.$queryRaw`
                SELECT id, nombre, email, concesionaria_id, deleted_at, created_at 
                FROM usuarios 
                WHERE deleted_at IS NULL AND concesionaria_id = ${tenantId}
                ORDER BY created_at DESC 
                LIMIT 20
            `;
        }
        
        res.json({
            success: true,
            data: {
                userContext,
                tenantId,
                isSuperAdmin: userContext?.roles?.includes('super_admin'),
                allUsersCount: (allUsers as any[]).length,
                activeUsersCount: (activeUsers as any[]).length,
                tenantUsersCount: (tenantUsers as any[]).length,
                allUsers,
                activeUsers,
                tenantUsers
            }
        });
    } catch (error: any) {
        res.status(500).json({
            success: false,
            error: error.message,
            stack: error.stack
        });
    }
});

export default router;
