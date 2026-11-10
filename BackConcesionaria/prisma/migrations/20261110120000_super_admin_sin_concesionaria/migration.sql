-- APP-02: una cuenta super_admin es de la PLATAFORMA, no de una concesionaria.
--
-- El alta y la edición de usuarios ya lo rechazan con un 400 (usuarioPolicy:
-- assertSuperAdminSinConcesionaria); esto es el candado en la base, para cualquier
-- camino que escriba sin pasar por esos use-cases (un script, un seed, un SQL a mano).
--
-- Es un trigger y no un CHECK porque la regla cruza dos tablas: el rol vive en
-- usuario_roles y la concesionaria en usuarios. Se evalúa SÓLO cuando cambia algo de
-- lo que la regla mira (asignar el rol super_admin, o ponerle concesionaria a alguien
-- que lo tiene): las filas viejas no se validan acá, así que la migración no puede
-- fallar por datos existentes. Ver docs/operacion/runbook-deploy.md para revisarlas.
--
-- SECURITY DEFINER con search_path fijo: el trigger tiene que ver usuario_roles y
-- usuarios completos aunque quien escribe sea app_rw con RLS (si no, una lectura
-- filtrada por tenant podría dejar pasar el caso).

CREATE OR REPLACE FUNCTION autenza_super_admin_sin_concesionaria() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_concesionaria_id integer;
BEGIN
    IF TG_TABLE_NAME = 'usuario_roles' THEN
        IF NEW.deleted_at IS NOT NULL THEN
            RETURN NEW;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM roles r WHERE r.id = NEW.rol_id AND r.nombre = 'super_admin') THEN
            RETURN NEW;
        END IF;
        SELECT u.concesionaria_id INTO v_concesionaria_id FROM usuarios u WHERE u.id = NEW.usuario_id;
        IF v_concesionaria_id IS NOT NULL THEN
            RAISE EXCEPTION 'Una cuenta super_admin no puede pertenecer a una concesionaria (usuario %)', NEW.usuario_id
                USING ERRCODE = 'check_violation';
        END IF;
        RETURN NEW;
    END IF;

    -- usuarios: sólo importa si queda con concesionaria y eso cambió.
    IF NEW.concesionaria_id IS NULL THEN
        RETURN NEW;
    END IF;
    IF TG_OP = 'UPDATE' AND OLD.concesionaria_id IS NOT DISTINCT FROM NEW.concesionaria_id THEN
        RETURN NEW;
    END IF;
    IF EXISTS (
        SELECT 1
        FROM usuario_roles ur
        JOIN roles r ON r.id = ur.rol_id
        WHERE ur.usuario_id = NEW.id AND ur.deleted_at IS NULL AND r.nombre = 'super_admin'
    ) THEN
        RAISE EXCEPTION 'Una cuenta super_admin no puede pertenecer a una concesionaria (usuario %)', NEW.id
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER usuario_roles_super_admin_sin_concesionaria
    BEFORE INSERT OR UPDATE OF rol_id, deleted_at ON usuario_roles
    FOR EACH ROW EXECUTE FUNCTION autenza_super_admin_sin_concesionaria();

CREATE TRIGGER usuarios_super_admin_sin_concesionaria
    BEFORE INSERT OR UPDATE OF concesionaria_id ON usuarios
    FOR EACH ROW EXECUTE FUNCTION autenza_super_admin_sin_concesionaria();
