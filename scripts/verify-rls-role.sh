#!/bin/bash
# verify-rls-role.sh
#
# Verifica, contra un Postgres DESCARTABLE (no toca prod ni dev), que:
#   1. db push + init-rls + setup-app-role corren limpio y crean el rol app_rw.
#   2. Con el rol app_rw (NO superusuario), la RLS FILTRA de verdad: una query que
#      se salta la extensión (SQL crudo) sobre otro tenant devuelve 0 filas, y un
#      INSERT cross-tenant es rechazado por WITH CHECK.
#   3. (Control) Con el superusuario `postgres`, la RLS NO filtra (demuestra por qué
#      el runtime debe usar app_rw).
#
# Sale != 0 si alguna aserción falla. Requiere docker + el cliente prisma del backend.
# Uso:  sh scripts/verify-rls-role.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CN="autenza-rls-verify-$$"
PORT="${RLS_VERIFY_PORT:-5546}"
ADMIN_URL="postgresql://postgres:adminpass@localhost:${PORT}/concesionaria?sslmode=disable"
APP_PWD="verifypass_$$"
FAILED=0

cleanup() { docker rm -f "$CN" >/dev/null 2>&1 || true; }
trap cleanup EXIT

assert_eq() { # $1=actual $2=expected $3=label
  if [ "$1" = "$2" ]; then echo "  ✓ $3 ($1)"; else echo "  ✗ $3: got '$1', expected '$2'"; FAILED=1; fi
}

echo "== 1. Postgres descartable en :$PORT =="
docker rm -f "$CN" >/dev/null 2>&1 || true
docker run -d --name "$CN" -e POSTGRES_PASSWORD=adminpass -e POSTGRES_DB=concesionaria -p "${PORT}:5432" postgres:16-alpine >/dev/null
for _ in $(seq 1 30); do docker exec "$CN" pg_isready -U postgres -d concesionaria >/dev/null 2>&1 && break; sleep 1; done

cd "$ROOT/BackConcesionaria"
echo "== 2. Schema + RLS + rol app_rw =="
DATABASE_URL="$ADMIN_URL" npx prisma db push --accept-data-loss >/dev/null 2>&1
DATABASE_URL="$ADMIN_URL" npm run init-rls >/dev/null 2>&1
DATABASE_URL="$ADMIN_URL" APP_DB_PASSWORD="$APP_PWD" APP_DATABASE_URL="postgresql://app_rw:${APP_PWD}@localhost:${PORT}/concesionaria?sslmode=disable" npm run setup-app-role >/dev/null 2>&1
echo "  ✓ db push + init-rls + setup-app-role OK"

echo "== 3. Seed cross-tenant (2 concesionarias + 2 sucursales) =="
docker exec -e PGPASSWORD=adminpass "$CN" psql -U postgres -d concesionaria -q -v ON_ERROR_STOP=1 -c "
  INSERT INTO concesionarias (id,nombre,created_at,updated_at) VALUES (1,'A',now(),now()),(2,'B',now(),now());
  INSERT INTO sucursales (concesionaria_id,nombre,activo,created_at,updated_at) VALUES (1,'SucA',true,now(),now()),(2,'SucB',true,now(),now());
" </dev/null >/dev/null
echo "  ✓ sembrado"

q() { docker exec -e PGPASSWORD="$2" "$CN" psql -U "$1" -d concesionaria -tAX -c "$3" </dev/null 2>&1; }

echo "== 4. app_rw (tenant_id=1): la RLS debe filtrar =="
VE=$(q app_rw "$APP_PWD" "SELECT set_config('app.tenant_id','1',false); SELECT set_config('app.is_super_admin','false',false); SELECT count(*) FROM sucursales;" | tail -1)
assert_eq "$VE" "1" "app_rw ve sólo su tenant"
VE2=$(q app_rw "$APP_PWD" "SELECT set_config('app.tenant_id','1',false); SELECT count(*) FROM sucursales WHERE concesionaria_id=2;" | tail -1)
assert_eq "$VE2" "0" "app_rw no ve la sucursal del tenant 2"

echo "== 5. Control: superusuario NO es filtrado por RLS =="
SU=$(q postgres adminpass "SELECT set_config('app.tenant_id','1',false); SELECT count(*) FROM sucursales;" | tail -1)
assert_eq "$SU" "2" "superuser ve ambos tenants (RLS bypasseada)"

echo "== 6. app_rw: WITH CHECK rechaza INSERT cross-tenant =="
OWN=$(q app_rw "$APP_PWD" "SELECT set_config('app.tenant_id','1',false); SELECT set_config('app.is_super_admin','false',false); INSERT INTO sucursales (concesionaria_id,nombre,activo,created_at,updated_at) VALUES (1,'SucA2',true,now(),now());")
if echo "$OWN" | grep -q 'INSERT 0 1'; then echo "  ✓ app_rw inserta en su propio tenant"; else echo "  ✗ app_rw NO pudo insertar en su tenant: $OWN"; FAILED=1; fi
# El INSERT cross-tenant DEBE fallar (RLS): se guarda con `|| true` para que el
# error esperado no aborte el script bajo `set -e`.
CROSS=$(q app_rw "$APP_PWD" "SELECT set_config('app.tenant_id','1',false); SELECT set_config('app.is_super_admin','false',false); INSERT INTO sucursales (concesionaria_id,nombre,activo,created_at,updated_at) VALUES (2,'SucB2',true,now(),now());" || true)
if echo "$CROSS" | grep -qi 'row-level security'; then echo "  ✓ INSERT cross-tenant rechazado por RLS"; else echo "  ✗ INSERT cross-tenant NO fue rechazado: $CROSS"; FAILED=1; fi

echo ""
if [ "$FAILED" = "0" ]; then echo "✅ VERIFY-RLS-ROLE: OK — la RLS filtra con app_rw."; else echo "❌ VERIFY-RLS-ROLE: FALLARON aserciones."; fi
exit $FAILED
