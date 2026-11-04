import bcrypt from 'bcryptjs';
import { RevokeUserSessions } from '../../src/application/use-cases/auth/RevokeUserSessions';
import { ChangeMyPassword } from '../../src/application/use-cases/usuarios/ChangeMyPassword';
import { ResetPassword } from '../../src/application/use-cases/usuarios/ResetPassword';
import { UpdateMyProfile } from '../../src/application/use-cases/usuarios/UpdateMyProfile';

// Unit tests PUROS (sin DB): las credenciales cambian → las sesiones se cierran, y
// cambiar el email exige la contraseña actual.

const tokenService: any = { hashToken: (t: string) => `hash(${t})` };

function fakeRefreshRepo() {
    return { deleteAllForUser: jest.fn().mockResolvedValue(2) } as any;
}

function fakeUsuarioRepo(usuario: any) {
    return {
        findById: jest.fn().mockResolvedValue(usuario),
        update: jest.fn().mockImplementation(async (_id: number, data: any) => ({ ...usuario, ...data })),
    } as any;
}

describe('RevokeUserSessions', () => {
    test('sin keepRefreshToken cierra TODAS las sesiones', async () => {
        const repo = fakeRefreshRepo();
        const n = await new RevokeUserSessions(tokenService, repo).execute(7);
        expect(repo.deleteAllForUser).toHaveBeenCalledWith(7, undefined);
        expect(n).toBe(2);
    });

    test('con keepRefreshToken conserva la sesión actual (compara por hash, nunca en claro)', async () => {
        const repo = fakeRefreshRepo();
        await new RevokeUserSessions(tokenService, repo).execute(7, 'mi-refresh');
        expect(repo.deleteAllForUser).toHaveBeenCalledWith(7, 'hash(mi-refresh)');
    });
});

describe('ChangeMyPassword', () => {
    const build = async () => {
        const passwordHash = await bcrypt.hash('vieja123', 4);
        const usuarioRepo = fakeUsuarioRepo({ id: 7, email: 'a@b.com', passwordHash });
        const refreshRepo = fakeRefreshRepo();
        const uc = new ChangeMyPassword(usuarioRepo, new RevokeUserSessions(tokenService, refreshRepo));
        return { uc, usuarioRepo, refreshRepo };
    };

    test('cambia la clave y cierra las demás sesiones conservando la actual', async () => {
        const { uc, usuarioRepo, refreshRepo } = await build();
        await uc.execute(7, 'vieja123', 'nueva12345', 'refresh-actual');
        expect(usuarioRepo.update).toHaveBeenCalledTimes(1);
        expect(refreshRepo.deleteAllForUser).toHaveBeenCalledWith(7, 'hash(refresh-actual)');
    });

    test('con la contraseña actual incorrecta NO cambia nada ni cierra sesiones', async () => {
        const { uc, usuarioRepo, refreshRepo } = await build();
        await expect(uc.execute(7, 'mal', 'nueva12345')).rejects.toMatchObject({ errorCode: 'INVALID_CURRENT_PASSWORD' });
        expect(usuarioRepo.update).not.toHaveBeenCalled();
        expect(refreshRepo.deleteAllForUser).not.toHaveBeenCalled();
    });
});

describe('ResetPassword (admin)', () => {
    test('cierra TODAS las sesiones del usuario', async () => {
        const usuarioRepo = fakeUsuarioRepo({ id: 9 });
        const refreshRepo = fakeRefreshRepo();
        await new ResetPassword(usuarioRepo, new RevokeUserSessions(tokenService, refreshRepo)).execute(9, 'nueva12345');
        expect(refreshRepo.deleteAllForUser).toHaveBeenCalledWith(9, undefined);
    });

    test('si la contraseña es inválida no toca nada', async () => {
        const usuarioRepo = fakeUsuarioRepo({ id: 9 });
        const refreshRepo = fakeRefreshRepo();
        await expect(
            new ResetPassword(usuarioRepo, new RevokeUserSessions(tokenService, refreshRepo)).execute(9, '123'),
        ).rejects.toBeDefined();
        expect(refreshRepo.deleteAllForUser).not.toHaveBeenCalled();
    });
});

describe('UpdateMyProfile', () => {
    const build = async () => {
        const passwordHash = await bcrypt.hash('clave12345', 4);
        const usuarioRepo = fakeUsuarioRepo({ id: 7, email: 'yo@demo.com', passwordHash });
        const updateUsuario: any = { execute: jest.fn().mockResolvedValue({ id: 7 }) };
        return { uc: new UpdateMyProfile(usuarioRepo, updateUsuario), updateUsuario };
    };

    test('cambiar SÓLO el nombre no pide contraseña', async () => {
        const { uc, updateUsuario } = await build();
        await uc.execute(7, { nombre: 'Nuevo' });
        expect(updateUsuario.execute).toHaveBeenCalledWith(7, { nombre: 'Nuevo' }, undefined);
    });

    test('reenviar el MISMO email (lo que hace el formulario) no pide contraseña ni lo manda', async () => {
        const { uc, updateUsuario } = await build();
        await uc.execute(7, { nombre: 'Nuevo', email: 'YO@demo.com' });
        expect(updateUsuario.execute).toHaveBeenCalledWith(7, { nombre: 'Nuevo' }, undefined);
    });

    test('cambiar el email SIN contraseña actual → 400 CURRENT_PASSWORD_REQUIRED', async () => {
        const { uc, updateUsuario } = await build();
        await expect(uc.execute(7, { email: 'otro@demo.com' })).rejects.toMatchObject({ errorCode: 'CURRENT_PASSWORD_REQUIRED' });
        expect(updateUsuario.execute).not.toHaveBeenCalled();
    });

    test('cambiar el email con contraseña incorrecta → 400 INVALID_CURRENT_PASSWORD', async () => {
        const { uc, updateUsuario } = await build();
        await expect(uc.execute(7, { email: 'otro@demo.com', currentPassword: 'mal' }))
            .rejects.toMatchObject({ errorCode: 'INVALID_CURRENT_PASSWORD' });
        expect(updateUsuario.execute).not.toHaveBeenCalled();
    });

    test('cambiar el email con la contraseña correcta actualiza y pasa el refresh a conservar', async () => {
        const { uc, updateUsuario } = await build();
        await uc.execute(7, { nombre: 'X', email: 'otro@demo.com', currentPassword: 'clave12345' }, 'refresh-actual');
        expect(updateUsuario.execute).toHaveBeenCalledWith(7, { nombre: 'X', email: 'otro@demo.com' }, 'refresh-actual');
    });
});
