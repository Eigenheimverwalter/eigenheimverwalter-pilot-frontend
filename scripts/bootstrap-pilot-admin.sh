#!/usr/bin/env bash
set -euo pipefail

: "${SUPABASE_PROJECT_REF:?SUPABASE_PROJECT_REF fehlt}"
: "${SUPABASE_SERVICE_ROLE_KEY:?SUPABASE_SERVICE_ROLE_KEY fehlt}"

admin_email='info@eigenheimverwalter.de'
admin_source_id='pilot-admin-info'
reset_origin='https://eigenheimverwalter.github.io/eigenheimverwalter-pilot-frontend'
api="https://${SUPABASE_PROJECT_REF}.supabase.co"
headers=(-H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}")

status=$(curl --fail --silent --show-error -X POST \
  "${api}/rest/v1/rpc/pilot_migration_status" "${headers[@]}")
if jq -e '.activeInfoAdmin == true' >/dev/null <<< "$status"; then
  echo 'Der feste Pilot-info-Admin ist bereits aktiv.'
  exit 0
fi

identities=$(curl --fail --silent --show-error \
  "${api}/rest/v1/identity_imports?email=eq.${admin_email}&select=source_user_id&limit=1" \
  "${headers[@]}")
source_id=$(jq -r '.[0].source_user_id // empty' <<< "$identities")
if [[ -z "$source_id" ]]; then
  source_id="$admin_source_id"
  identity_payload=$(jq -nc --arg source "$source_id" --arg email "$admin_email" \
    '{source_user_id:$source,email:$email,display_name:"Antonio da Silva",role:"super_admin",active:true,activation_status:"pending"}')
  curl --fail --silent --show-error -X POST \
    "${api}/rest/v1/identity_imports" "${headers[@]}" \
    -H 'Content-Type: application/json' -H 'Prefer: return=minimal' \
    --data "$identity_payload"
fi

auth_users=$(curl --fail --silent --show-error \
  "${api}/auth/v1/admin/users?page=1&per_page=1000" "${headers[@]}")
admin_id=$(jq -r --arg email "$admin_email" \
  '.users[]? | select((.email // "" | ascii_downcase) == ($email | ascii_downcase)) | .id' \
  <<< "$auth_users" | head -n1)
if [[ -z "$admin_id" ]]; then
  temporary_password=$(openssl rand -base64 48 | tr -d '\n')
  user_payload=$(jq -nc --arg email "$admin_email" --arg password "$temporary_password" \
    '{email:$email,password:$password,email_confirm:true,user_metadata:{source:"pilot_admin_bootstrap"}}')
  created=$(curl --fail --silent --show-error -X POST \
    "${api}/auth/v1/admin/users" "${headers[@]}" \
    -H 'Content-Type: application/json' --data "$user_payload")
  admin_id=$(jq -r '.id // .user.id // empty' <<< "$created")
  unset temporary_password user_payload created
fi
[[ "$admin_id" =~ ^[0-9a-f-]{36}$ ]] || { echo 'Admin-Identität konnte nicht bestimmt werden.'; exit 1; }

profile_payload=$(jq -nc --arg id "$admin_id" \
  '{id:$id,display_name:"Antonio da Silva",role:"super_admin",status:"active"}')
curl --fail --silent --show-error -X POST \
  "${api}/rest/v1/portal_users?on_conflict=id" "${headers[@]}" \
  -H 'Content-Type: application/json' -H 'Prefer: resolution=merge-duplicates,return=minimal' \
  --data "$profile_payload"

encoded_source=$(printf '%s' "$source_id" | jq -sRr @uri)
activation_payload=$(jq -nc --arg id "$admin_id" \
  '{auth_user_id:$id,activation_status:"activated",activated_at:(now|todateiso8601),active:true,role:"super_admin"}')
curl --fail --silent --show-error -X PATCH \
  "${api}/rest/v1/identity_imports?source_user_id=eq.${encoded_source}" "${headers[@]}" \
  -H 'Content-Type: application/json' -H 'Prefer: return=minimal' \
  --data "$activation_payload"

response=$(curl --silent --show-error --write-out '\n%{http_code}' -X POST \
  "${api}/functions/v1/portal-public/password/forgot" \
  -H 'Content-Type: application/json' -H "Origin: ${reset_origin}" \
  --data "$(jq -nc --arg email "$admin_email" '{email:$email}')")
mail_status=$(tail -n1 <<< "$response")
test "$mail_status" = '202' || { echo 'Admin-Passwortmail konnte nicht versendet werden.'; exit 1; }
echo 'Der feste Pilot-info-Admin wurde aktiviert und die Passwortmail wurde versendet.'
