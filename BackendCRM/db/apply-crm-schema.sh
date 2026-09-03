#!/usr/bin/env bash
# Aplica el esquema del CRM sobre crm_<env>.
#
# CORRELO DESDE EL BASTION (aws ssm start-session --target <id>). La RDS no es publica.
#
# Requiere que provision-databases.sh ya haya creado la base y los tres roles. Ese script
# vive en el repo de INFRA (sql/provision-databases.sh), porque tambien provisiona n8n y
# LiteLLM; este de aqui solo se ocupa del esquema del CRM.
# Se conecta como el rol DUENO (crm_<env>), que es quien puede hacer DDL.
#
#   ./apply-crm-schema.sh dev            # esquema, sin datos
#   ./apply-crm-schema.sh dev --seed     # esquema + datos sinteticos
#
# Todos los ficheros son idempotentes: correrlo dos veces no rompe nada.
set -euo pipefail

ENV="${1:-}"
SEED="${2:-}"

if [[ "$ENV" != "dev" && "$ENV" != "prod" ]]; then
  echo "uso: $0 dev|prod [--seed]" >&2
  exit 1
fi

if [[ "$SEED" == "--seed" && "$ENV" == "prod" ]]; then
  echo "ERROR: los datos sinteticos NO van a prod." >&2
  exit 1
fi

export AWS_DEFAULT_REGION="${AWS_DEFAULT_REGION:-eu-west-1}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

param() { aws ssm get-parameter --name "$1" --with-decryption --query Parameter.Value --output text; }

echo "==> leyendo credenciales"
PGHOST="$(param /gpi/platform/rds_address)"
PGPASSWORD="$(param "/gpi/$ENV/crm/db_password")"
export PGHOST PGPASSWORD
export PGUSER="crm_$ENV" PGPORT=5432 PGDATABASE="crm_$ENV"

APP_ROLE="crm_${ENV}_app"
BOT_ROLE="crm_${ENV}_bot"

run() {
  local file="$1"
  echo "==> $file"
  psql -v ON_ERROR_STOP=1 -q \
       -v app_role="$APP_ROLE" \
       -v bot_role="$BOT_ROLE" \
       -f "$HERE/crm/$file"
}

run 001_extensions_schemas.sql
run 002_auth.sql
run 003_crm.sql
run 004_rls.sql
run 005_grants.sql
run 006_un_tenant_por_usuario.sql

if [[ "$SEED" == "--seed" ]]; then
  run 900_seed_dev.sql
fi

echo "==> verificando"
psql -tAc "
  SELECT table_schema || '.' || table_name
    FROM information_schema.tables
   WHERE table_schema IN ('auth','crm') AND table_type = 'BASE TABLE'
   ORDER BY 1"

echo "==> tablas con RLS activa"
psql -tAc "
  SELECT schemaname || '.' || tablename
    FROM pg_tables
   WHERE schemaname IN ('auth','crm') AND rowsecurity
   ORDER BY 1"

echo "==> listo"
