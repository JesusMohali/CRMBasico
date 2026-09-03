#!/usr/bin/env bash
# Regenera test/schema.sql y test/seed.sql a partir del DDL de infra.
#
# La FUENTE DE VERDAD del esquema es el repo de infraestructura (sql/crm/*.sql),
# que es lo que se aplica de verdad a la RDS. Estos ficheros son una copia
# consolidada para poder levantar un Postgres desechable en los tests sin
# depender de tener el otro repo clonado.
#
# Si el esquema cambia en infra, hay que correr esto y commitear el resultado.
#
#   ./test/sync-schema.sh ~/Documents/SetterIA/infra
set -euo pipefail

INFRA="${1:-$HOME/Documents/SetterIA/infra}"
ORIGEN="$INFRA/sql/crm"
AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DESTINO="$AQUI/schema.sql"
DESTINO_SEMILLA="$AQUI/seed.sql"

if [[ ! -d "$ORIGEN" ]]; then
  echo "ERROR: no encuentro $ORIGEN" >&2
  exit 1
fi

{
  echo "-- GENERADO POR test/sync-schema.sh — NO EDITAR A MANO."
  echo "-- Fuente de verdad: repo de infra, sql/crm/*.sql"
  echo "-- Regenerado: $(date -u +%Y-%m-%d)"
  echo
  for f in 001_extensions_schemas.sql 002_auth.sql 003_crm.sql 004_rls.sql 005_grants.sql \
           006_un_tenant_por_usuario.sql; do
    echo "-- ══════════════════════════ $f ══════════════════════════"
    # Los ficheros de infra usan variables de psql para los nombres de rol; en
    # los tests el rol es fijo, asi que se sustituyen por el literal.
    sed -e 's/:"app_role"/crm_test_app/g' -e 's/:"bot_role"/crm_test_bot/g' "$ORIGEN/$f"
    echo
  done
} > "$DESTINO"

# La semilla tambien se copia, y antes se copiaba a mano: quedaba desincronizada
# con infra sin que nada avisara. Va por el mismo camino que el esquema.
#
# Se quitan las meta-ordenes de psql (lineas que empiezan por barra invertida):
# los tests aplican el fichero con pg.Client.query(), que habla el protocolo de
# Postgres y no entiende \set — ahi seria un error de sintaxis.
{
  echo "-- GENERADO POR test/sync-schema.sh — NO EDITAR A MANO."
  echo "-- Fuente de verdad: repo de infra, sql/crm/900_seed_dev.sql"
  echo "-- Regenerado: $(date -u +%Y-%m-%d)"
  echo
  grep -v '^\\' "$ORIGEN/900_seed_dev.sql"
} > "$DESTINO_SEMILLA"

echo "escrito $DESTINO ($(wc -l < "$DESTINO") lineas)"
echo "escrito $DESTINO_SEMILLA ($(wc -l < "$DESTINO_SEMILLA") lineas)"
