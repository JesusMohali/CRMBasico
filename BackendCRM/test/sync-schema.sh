#!/usr/bin/env bash
# Regenera test/schema.sql a partir del DDL de infra.
#
# La FUENTE DE VERDAD del esquema es el repo de infraestructura (sql/crm/*.sql),
# que es lo que se aplica de verdad a la RDS. Este fichero es una copia
# consolidada para poder levantar un Postgres desechable en los tests sin
# depender de tener el otro repo clonado.
#
# Si el esquema cambia en infra, hay que correr esto y commitear el resultado.
#
#   ./test/sync-schema.sh ~/Documents/SetterIA/infra
set -euo pipefail

INFRA="${1:-$HOME/Documents/SetterIA/infra}"
ORIGEN="$INFRA/sql/crm"
DESTINO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/schema.sql"

if [[ ! -d "$ORIGEN" ]]; then
  echo "ERROR: no encuentro $ORIGEN" >&2
  exit 1
fi

{
  echo "-- GENERADO POR test/sync-schema.sh — NO EDITAR A MANO."
  echo "-- Fuente de verdad: repo de infra, sql/crm/*.sql"
  echo "-- Regenerado: $(date -u +%Y-%m-%d)"
  echo
  for f in 001_extensions_schemas.sql 002_auth.sql 003_crm.sql 004_rls.sql 005_grants.sql; do
    echo "-- ══════════════════════════ $f ══════════════════════════"
    # Los ficheros de infra usan variables de psql para los nombres de rol; en
    # los tests el rol es fijo, asi que se sustituyen por el literal.
    sed -e 's/:"app_role"/crm_test_app/g' -e 's/:"bot_role"/crm_test_bot/g' "$ORIGEN/$f"
    echo
  done
} > "$DESTINO"

echo "escrito $DESTINO ($(wc -l < "$DESTINO") lineas)"
