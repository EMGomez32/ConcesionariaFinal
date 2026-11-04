// Unit tests PUROS (sin DB): la cuenta de un super_admin sólo la gestiona otro super_admin.
import { assertObjetivoGestionable } from '../../src/infrastructure/security/objetivoGestionable';
import { ResetPassword } from '../../src/application/use-cases/usuarios/ResetPassword';
import { DeleteUsuario } from '../../src/application/use-cases/usuarios/DeleteUsuario';
import { context } from '../../src/infrastructure/security/context';

const conRoles = (...roles: string[]) => ({ id: 1, roles: roles.map((nombre) => ({ deletedAt: null, rol: { nombre, deletedAt: null } })) });
const como = <T,>(roles: string[], fn: () => T): T =>
    context.run({ user: { userId: 99, concesionariaId: 1, sucursalId: null, roles }, correlationId: 'c' } as any, fn);

describe('assertObjetivoGestionable', () => {
    test('un admin no puede tocar a un super_admin (403 TARGET_NOT_MANAGEABLE)', () => {
        expect(() => como(['admin'], () => assertObjetivoGestionable(conRoles('super_admin')))).toThrow(
            expect.objectContaining({ statusCode: 403, errorCode: 'TARGET_NOT_MANAGEABLE' }),
        );
        // Aunque el super_admin tenga además otro rol.
        expect(() => como(['admin'], () => assertObjetivoGestionable(conRoles('admin', 'super_admin')))).toThrow();
    });

    test('un super_admin sí; y un admin sobre un usuario común, también', () => {
        expect(() => como(['super_admin'], () => assertObjetivoGestionable(conRoles('super_admin')))).not.toThrow();
        expect(() => como(['admin'], () => assertObjetivoGestionable(conRoles('vendedor')))).not.toThrow();
    });

    test('un rol super_admin dado de baja (soft-delete) ya no protege', () => {
        const u = { roles: [{ deletedAt: new Date(), rol: { nombre: 'super_admin', deletedAt: null } }] };
        expect(() => como(['admin'], () => assertObjetivoGestionable(u))).not.toThrow();
    });
});

describe('casos de uso con el candado', () => {
    const revoke: any = { execute: jest.fn() };
    const repo = (u: any) => ({ findById: jest.fn().mockResolvedValue(u), update: jest.fn(), delete: jest.fn() }) as any;

    test('ResetPassword de un super_admin por un admin → 403 y no toca la base', async () => {
        const r = repo(conRoles('super_admin'));
        await expect(como(['admin'], () => new ResetPassword(r, revoke).execute(1, 'nueva-clave-12345'))).rejects.toMatchObject({ statusCode: 403 });
        expect(r.update).not.toHaveBeenCalled();
    });

    test('DeleteUsuario de un super_admin por un admin → 403 y no borra', async () => {
        const r = repo(conRoles('super_admin'));
        await expect(como(['admin'], () => new DeleteUsuario(r, revoke).execute(1))).rejects.toMatchObject({ statusCode: 403 });
        expect(r.delete).not.toHaveBeenCalled();
    });
});
