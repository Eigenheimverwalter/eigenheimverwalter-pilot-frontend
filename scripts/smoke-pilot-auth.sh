#!/usr/bin/env bash
set -euo pipefail

: "${SUPABASE_PROJECT_REF:?SUPABASE_PROJECT_REF fehlt}"
: "${SUPABASE_SERVICE_ROLE_KEY:?SUPABASE_SERVICE_ROLE_KEY fehlt}"
: "${SUPABASE_PUBLISHABLE_KEY:?SUPABASE_PUBLISHABLE_KEY fehlt}"

api="https://${SUPABASE_PROJECT_REF}.supabase.co"
stamp="$(date +%s)-${RANDOM}"
email="ehv-pilot-smoke-${stamp}@example.invalid"
source_id="pilot-smoke-${stamp}"
password="$(openssl rand -base64 36 | tr -d '\n')Aa1!"
admin_headers=(-H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}")
user_id=''

cleanup() {
  set +e
  if [[ -n "$user_id" ]]; then
    curl --silent -X DELETE "${api}/rest/v1/portal_users?id=eq.${user_id}" "${admin_headers[@]}" >/dev/null
  fi
  encoded_source=$(printf '%s' "$source_id" | jq -sRr @uri)
  curl --silent -X DELETE "${api}/rest/v1/identity_imports?source_user_id=eq.${encoded_source}" "${admin_headers[@]}" >/dev/null
  if [[ -n "$user_id" ]]; then
    curl --silent -X DELETE "${api}/auth/v1/admin/users/${user_id}" "${admin_headers[@]}" >/dev/null
  fi
  unset password access_token
}
trap cleanup EXIT

identity=$(jq -nc --arg source "$source_id" --arg email "$email" \
  '{source_user_id:$source,email:$email,display_name:"Pilot Auth Smoke",role:"admin_light",active:true,activation_status:"pending"}')
curl --fail --silent --show-error -X POST "${api}/rest/v1/identity_imports" \
  "${admin_headers[@]}" -H 'Content-Type: application/json' -H 'Prefer: return=minimal' \
  --data "$identity"

created=$(curl --fail --silent --show-error -X POST "${api}/auth/v1/admin/users" \
  "${admin_headers[@]}" -H 'Content-Type: application/json' \
  --data "$(jq -nc --arg email "$email" --arg password "$password" '{email:$email,password:$password,email_confirm:true,user_metadata:{source:"pilot_auth_smoke"}}')")
user_id=$(jq -r '.id // empty' <<< "$created")
[[ "$user_id" =~ ^[0-9a-f-]{36}$ ]] || { echo 'Temporäre Auth-Identität fehlt.'; exit 1; }

session=$(curl --fail --silent --show-error -X POST "${api}/auth/v1/token?grant_type=password" \
  -H "apikey: ${SUPABASE_PUBLISHABLE_KEY}" -H 'Content-Type: application/json' \
  --data "$(jq -nc --arg email "$email" --arg password "$password" '{email:$email,password:$password}')")
access_token=$(jq -r '.access_token // empty' <<< "$session")
test -n "$access_token"
unset password session created identity

me=$(curl --fail --silent --show-error "${api}/functions/v1/portal-api/me" \
  -H "Authorization: Bearer ${access_token}" -H "Origin: https://eigenheimverwalter.github.io")
jq -e '.user.role=="admin_light" and .user.status=="active"' >/dev/null <<< "$me"

dashboard=$(curl --fail --silent --show-error "${api}/functions/v1/portal-api/dashboard" \
  -H "Authorization: Bearer ${access_token}" -H "Origin: https://eigenheimverwalter.github.io")
jq -e '.source=="supabase" and (.kpis|type=="object")' >/dev/null <<< "$dashboard"

acl_status=$(curl --silent --output /dev/null --write-out '%{http_code}' \
  "${api}/functions/v1/portal-api/role-profiles" \
  -H "Authorization: Bearer ${access_token}" -H "Origin: https://eigenheimverwalter.github.io")
test "$acl_status" = '403'
echo 'Echtes Supabase-Login, Dashboard und Admin-Light-ACL wurden bestätigt.'
