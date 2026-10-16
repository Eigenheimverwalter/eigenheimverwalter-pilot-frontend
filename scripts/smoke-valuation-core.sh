#!/usr/bin/env bash
set -euo pipefail
: "${SUPABASE_PROJECT_REF:?SUPABASE_PROJECT_REF fehlt}"
: "${SUPABASE_SERVICE_ROLE_KEY:?SUPABASE_SERVICE_ROLE_KEY fehlt}"
: "${SUPABASE_PUBLISHABLE_KEY:?SUPABASE_PUBLISHABLE_KEY fehlt}"

api="https://${SUPABASE_PROJECT_REF}.supabase.co"
stamp="$(date +%s)-${RANDOM}"
email="ehv-valuation-smoke-${stamp}@example.invalid"
source_id="valuation-smoke-${stamp}"
password="$(openssl rand -base64 36 | tr -d '\n')Aa1!"
admin_headers=(-H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}")
user_id=''

cleanup() {
  set +e
  encoded_source=$(printf '%s' "$source_id" | jq -sRr @uri)
  if [[ -n "$user_id" ]]; then
    curl --silent -X DELETE "${api}/rest/v1/audit_events?actor_user_id=eq.${user_id}" "${admin_headers[@]}" >/dev/null
    curl --silent -X DELETE "${api}/rest/v1/portal_users?id=eq.${user_id}" "${admin_headers[@]}" >/dev/null
    curl --silent -X DELETE "${api}/auth/v1/admin/users/${user_id}" "${admin_headers[@]}" >/dev/null
  fi
  curl --silent -X DELETE "${api}/rest/v1/identity_imports?source_user_id=eq.${encoded_source}" "${admin_headers[@]}" >/dev/null
  unset password access_token
}
trap cleanup EXIT

curl --fail --silent --show-error -X POST "${api}/rest/v1/identity_imports" \
  "${admin_headers[@]}" -H 'Content-Type: application/json' -H 'Prefer: return=minimal' \
  --data "$(jq -nc --arg source "$source_id" --arg email "$email" '{source_user_id:$source,email:$email,display_name:"Valuation Core Smoke",role:"super_admin",active:true,activation_status:"pending"}')"
created=$(curl --fail --silent --show-error -X POST "${api}/auth/v1/admin/users" \
  "${admin_headers[@]}" -H 'Content-Type: application/json' \
  --data "$(jq -nc --arg email "$email" --arg password "$password" '{email:$email,password:$password,email_confirm:true,user_metadata:{source:"valuation_core_smoke"}}')")
user_id=$(jq -r '.id // empty' <<< "$created")
[[ "$user_id" =~ ^[0-9a-f-]{36}$ ]] || { echo 'Temporäre Bewertungsidentität fehlt.'; exit 1; }
session=$(curl --fail --silent --show-error -X POST "${api}/auth/v1/token?grant_type=password" \
  -H "apikey: ${SUPABASE_PUBLISHABLE_KEY}" -H 'Content-Type: application/json' \
  --data "$(jq -nc --arg email "$email" --arg password "$password" '{email:$email,password:$password}')")
access_token=$(jq -r '.access_token // empty' <<< "$session")
test -n "$access_token"
me=$(curl --fail --silent --show-error "${api}/functions/v1/portal-api/me" \
  -H "Authorization: Bearer ${access_token}" -H "Origin: https://eigenheimverwalter-pilot.de")
jq -e '.user.role=="super_admin" and .user.status=="active"' >/dev/null <<< "$me" \
  || { echo 'Isolierter Admin-Plus-Testzugang wurde nicht korrekt aktiviert.'; exit 1; }

customers=$(curl --fail --silent --show-error "${api}/functions/v1/portal-api/production/customers" \
  -H "Authorization: Bearer ${access_token}" -H "Origin: https://eigenheimverwalter-pilot.de")
property_id=$(jq -r '[.customers[] | .property_id | select(. != null and (tostring | test("^[0-9]+$")))][0] // empty' <<< "$customers")
test -n "$property_id" || { echo 'Keine produktive Immobilie für den Bewertungs-Smoke-Test verfügbar.'; exit 1; }

response=$(mktemp)
status=$(curl --silent --show-error --output "$response" --write-out '%{http_code}' \
  "${api}/functions/v1/portal-api/admin/valuation-preview/${property_id}" \
  -H "Authorization: Bearer ${access_token}" -H "Origin: https://eigenheimverwalter-pilot.de")
if [[ "$status" == '200' ]]; then
  jq -e '(.result.indicative_value | type)=="number" and (.result.range_low | type)=="number" and (.result.range_high | type)=="number"' "$response" >/dev/null
elif [[ "$status" == '422' ]]; then
  jq -e '(.error // .message | type)=="string"' "$response" >/dev/null
else
  jq '{error:(.error // .message // "Nicht lesbare Fehlerantwort")}' "$response" 2>/dev/null || true
  rm -f "$response"
  echo "Signierter Bewertungs-Smoke-Test fehlgeschlagen (HTTP ${status})."
  exit 1
fi
rm -f "$response"
echo 'Admin-ACL und signierte EHV-Core-Bewertungsverbindung bestätigt.'
