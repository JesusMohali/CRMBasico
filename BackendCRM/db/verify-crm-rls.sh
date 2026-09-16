#!/usr/bin/env bash
# Comprueba que el aislamiento por tenant del CRM funciona de verdad.
#
# CORRELO DESDE EL BASTION. No modifica nada: lo que escribe lo deshace.
#
#   ./verify-crm-rls.sh dev
#
# No basta con que las politicas existan: hay que ver que un rol que NO es dueno
# de las tablas se choca contra ellas. El dueno se las salta por diseno (ENABLE,
# no FORCE), asi que probar con el dueno no demuestra nada.
set -uo pipefail

ENV="${1:-dev}"
export AWS_DEFAULT_REGION="${AWS_DEFAULT_REGION:-eu-west-1}"

param() { aws ssm get-parameter --name "$1" --with-decryption --query Parameter.Value --output text; }

export PGHOST="$(param /gpi/platform/rds_address)"
export PGPORT=5432 PGDATABASE="crm_$ENV"

fallos=0
ok()   { echo "  OK    $1"; }
fallo() { echo "  FALLO $1"; fallos=$((fallos+1)); }

# Compara un valor esperado con el obtenido.
check() {
  local etiqueta="$1" esperado="$2" obtenido="$3"
  if [[ "$obtenido" == "$esperado" ]]; then ok "$etiqueta ($obtenido)"; else fallo "$etiqueta: esperaba '$esperado', obtuve '$obtenido'"; fi
}

# Corre SQL con un tenant fijado. set_config y no SET LOCAL porque SET solo
# admite literales, no expresiones ni parametros — que es justo lo que la
# aplicacion va a necesitar.
con_tenant() {
  local tenant="$1" sql="$2"
  psql -tAX -q -c "BEGIN; SELECT set_config('app.tenant_id', '$tenant', true); $sql; ROLLBACK;" 2>&1 | tail -1
}

export PGUSER="crm_${ENV}_app" PGPASSWORD="$(param "/gpi/$ENV/crm/app_password")"

ACME="$(psql -tAXc "SELECT id FROM auth.tenants WHERE slug='acme-formacion'")"
PLANB="$(psql -tAXc "SELECT id FROM auth.tenants WHERE slug='planb-trading'")"

if [[ -z "$ACME" || -z "$PLANB" ]]; then
  echo "ERROR: no encuentro los tenants de la semilla. Corre apply-crm-schema.sh $ENV --seed" >&2
  exit 1
fi

echo "== rol de aplicacion (crm_${ENV}_app) =="
check "sin contexto de tenant no ve nada" \
      "0" "$(psql -tAXc 'SELECT count(*) FROM crm.leads')"

check "con Acme ve sus 3 leads" \
      "3" "$(con_tenant "$ACME" 'SELECT count(*) FROM crm.leads')"

check "con Plan B ve otros 3 leads" \
      "20000001,20000002,20000003" \
      "$(con_tenant "$PLANB" "SELECT string_agg(chat_id::text, ',' ORDER BY chat_id) FROM crm.leads")"

check "con Acme, un chat_id de Plan B no existe" \
      "0" "$(con_tenant "$ACME" 'SELECT count(*) FROM crm.leads WHERE chat_id = 20000001')"

# WITH CHECK: no solo no puede leer lo ajeno, tampoco puede plantar una fila
# con el tenant de otro.
salida="$(con_tenant "$ACME" "INSERT INTO crm.leads (tenant_id, chat_id) VALUES ('$PLANB', 99999999)")"
if grep -qi 'row-level security\|violates' <<<"$salida"; then
  ok "con Acme, insertar una fila de Plan B es rechazado"
else
  fallo "con Acme, insertar una fila de Plan B NO fue rechazado: $salida"
fi

check "el buffer tambien aisla" \
      "2" "$(con_tenant "$ACME" 'SELECT count(*) FROM crm.buffer')"

check "las renovaciones tambien aislan" \
      "1" "$(con_tenant "$PLANB" 'SELECT count(*) FROM crm.leads_renovaciones')"

echo "== rol del bot (crm_${ENV}_bot) =="
export PGUSER="crm_${ENV}_bot" PGPASSWORD="$(param "/gpi/$ENV/crm/bot_password")"

salida="$(psql -tAXc 'SELECT count(*) FROM auth.users' 2>&1 | tail -1)"
if grep -qi 'denied\|permission' <<<"$salida"; then
  ok "no puede leer auth.users"
else
  fallo "SI puede leer auth.users: $salida"
fi

check "si ve los leads de su tenant" \
      "3" "$(con_tenant "$ACME" 'SELECT count(*) FROM crm.leads')"

salida="$(con_tenant "$ACME" 'DELETE FROM crm.leads WHERE chat_id = 10000001')"
if grep -qi 'denied\|permission' <<<"$salida"; then
  ok "no puede borrar leads"
else
  fallo "SI puede borrar leads: $salida"
fi

salida="$(con_tenant "$ACME" "DELETE FROM crm.buffer WHERE chat_id = 10000001; SELECT 'ok'")"
check "si puede vaciar el buffer (es una cola)" "ok" "$salida"

echo
if (( fallos == 0 )); then
  echo "TODO OK — el aislamiento por tenant funciona."
else
  echo "$fallos COMPROBACIONES FALLARON."
  exit 1
fi
