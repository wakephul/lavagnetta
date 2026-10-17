#!/bin/sh
# Esegue SQL sul progetto Supabase tramite la Management API.
# Uso: scripts/sql.sh file.sql   oppure   echo "select 1" | scripts/sql.sh
# Legge SUPABASE_ACCESS_TOKEN e SUPABASE_REF da .env.local.
set -e
cd "$(dirname "$0")/.."
. ./.env.local
if [ -n "$1" ]; then q=$(cat "$1"); else q=$(cat); fi
body=$(printf '%s' "$q" | python3 -c 'import json,sys; print(json.dumps({"query": sys.stdin.read()}))')
curl -sS -X POST "https://api.supabase.com/v1/projects/$SUPABASE_REF/database/query" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H 'Content-Type: application/json' -d "$body"
echo
