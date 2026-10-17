#!/bin/sh
# Cambia la password della squadra o quella dell'allenatore.
# Uso: scripts/password.sh squadra   oppure   scripts/password.sh allenatore
# La password non finisce nel testo di nessuna query: passa come parametro
# della funzione set_password, con una sessione temporanea creata e poi cancellata.
set -e
cd "$(dirname "$0")/.."
. ./.env.local
case "$1" in
  squadra) kind=view ;;
  allenatore) kind=edit ;;
  *) echo "Uso: $0 squadra|allenatore"; exit 1 ;;
esac
printf 'Nuova password (%s): ' "$1"
stty -echo; read -r pw; stty echo; echo
printf 'Ripetila: '
stty -echo; read -r pw2; stty echo; echo
[ "$pw" = "$pw2" ] || { echo "Le due password non coincidono."; exit 1; }
[ ${#pw} -ge 8 ] || { echo "Servono almeno 8 caratteri."; exit 1; }
tok=$(echo "insert into sessions (role) values ('edit') returning token" | scripts/sql.sh | python3 -c 'import json,sys; print(json.load(sys.stdin)[0]["token"])')
body=$(PW="$pw" TOK="$tok" KIND="$kind" python3 -c 'import json,os; print(json.dumps({"p_token": os.environ["TOK"], "p_kind": os.environ["KIND"], "p_password": os.environ["PW"]}))')
out=$(curl -sS -X POST "$VITE_SUPABASE_URL/rest/v1/rpc/set_password" -H "apikey: $VITE_SUPABASE_KEY" -H 'Content-Type: application/json' -d "$body")
echo "delete from sessions where token = '$tok'" | scripts/sql.sh > /dev/null
if [ -n "$out" ]; then echo "Errore: $out"; exit 1; fi
echo "Fatto. Chi era entrato con la vecchia password deve rientrare."
