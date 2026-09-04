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
smoke_role="${PILOT_SMOKE_ROLE:-admin_light}"
mail_recipient="${PILOT_MAIL_SMOKE_RECIPIENT:-}"
[[ "$smoke_role" == 'admin_light' || "$smoke_role" == 'super_admin' ]] || { echo 'Ungültige Smoke-Rolle.'; exit 1; }
admin_headers=(-H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}")
user_id=''
document_id=''
document_bucket=''
document_path=''

cleanup() {
  set +e
  if [[ -n "$document_id" ]]; then
    if [[ -n "$document_bucket" && -n "$document_path" ]]; then
      encoded_object=$(printf '%s' "$document_path" | jq -sRr @uri)
      curl --silent -X DELETE "${api}/storage/v1/object/${document_bucket}/${encoded_object}" "${admin_headers[@]}" >/dev/null
    fi
    curl --silent -X DELETE "${api}/rest/v1/audit_events?entity_id=eq.${document_id}" "${admin_headers[@]}" >/dev/null
    curl --silent -X DELETE "${api}/rest/v1/documents?id=eq.${document_id}" "${admin_headers[@]}" >/dev/null
  fi
  if [[ -n "$user_id" ]]; then
    curl --silent -X DELETE "${api}/rest/v1/audit_events?actor_user_id=eq.${user_id}" "${admin_headers[@]}" >/dev/null
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
  --arg role "$smoke_role" \
  '{source_user_id:$source,email:$email,display_name:"Pilot Auth Smoke",role:$role,active:true,activation_status:"pending"}')
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

# Prove the same Supabase recovery sequence used by the browser: create a
# recovery link, exchange its one-time token, update the password and log in
# with the replacement password. No token or password is written to the log.
recovery_password="$(openssl rand -base64 36 | tr -d '\n')Bb2!"
recovery_link=$(curl --fail --silent --show-error -X POST "${api}/auth/v1/admin/generate_link" \
  "${admin_headers[@]}" -H 'Content-Type: application/json' \
  --data "$(jq -nc --arg email "$email" '{type:"recovery",email:$email,options:{redirectTo:"https://eigenheimverwalter.github.io/eigenheimverwalter-pilot-frontend/passwort-zuruecksetzen"}}')")
recovery_token_hash=$(jq -r '.properties.hashed_token // empty' <<< "$recovery_link")
test -n "$recovery_token_hash"
recovery_session=$(curl --fail --silent --show-error -X POST "${api}/auth/v1/verify" \
  -H "apikey: ${SUPABASE_PUBLISHABLE_KEY}" -H 'Content-Type: application/json' \
  --data "$(jq -nc --arg token "$recovery_token_hash" '{type:"recovery",token_hash:$token}')")
recovery_access_token=$(jq -r '.access_token // empty' <<< "$recovery_session")
test -n "$recovery_access_token"
curl --fail --silent --show-error -X PUT "${api}/auth/v1/user" \
  -H "apikey: ${SUPABASE_PUBLISHABLE_KEY}" -H "Authorization: Bearer ${recovery_access_token}" \
  -H 'Content-Type: application/json' --data "$(jq -nc --arg password "$recovery_password" '{password:$password}')" >/dev/null
session=$(curl --fail --silent --show-error -X POST "${api}/auth/v1/token?grant_type=password" \
  -H "apikey: ${SUPABASE_PUBLISHABLE_KEY}" -H 'Content-Type: application/json' \
  --data "$(jq -nc --arg email "$email" --arg password "$recovery_password" '{email:$email,password:$password}')")
access_token=$(jq -r '.access_token // empty' <<< "$session")
test -n "$access_token"
unset password recovery_password recovery_link recovery_token_hash recovery_session recovery_access_token session created identity

me=$(curl --fail --silent --show-error "${api}/functions/v1/portal-api/me" \
  -H "Authorization: Bearer ${access_token}" -H "Origin: https://eigenheimverwalter.github.io")
jq -e --arg role "$smoke_role" '.user.role==$role and .user.status=="active"' >/dev/null <<< "$me"

dashboard=$(curl --fail --silent --show-error "${api}/functions/v1/portal-api/dashboard" \
  -H "Authorization: Bearer ${access_token}" -H "Origin: https://eigenheimverwalter.github.io")
jq -e '.source=="supabase" and (.kpis|type=="object")' >/dev/null <<< "$dashboard"
property_id=$(jq -r '.properties[0].id // empty' <<< "$dashboard")
test -n "$property_id"

upload_payload=$(jq -nc --arg property "$property_id" \
  '{propertyId:$property,documentClass:"other",entityType:"ci_smoke",entityId:"ephemeral",name:"pilot-upload-smoke.png",content:"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="}')
uploaded=$(curl --fail --silent --show-error -X POST "${api}/functions/v1/document-api" \
  -H "apikey: ${SUPABASE_PUBLISHABLE_KEY}" -H "Authorization: Bearer ${access_token}" \
  -H "Origin: https://eigenheimverwalter.github.io" -H 'Content-Type: application/json' \
  --data "$upload_payload")
document_id=$(jq -r '.document.id // empty' <<< "$uploaded")
[[ "$document_id" =~ ^[0-9a-f-]{36}$ ]] || { echo 'Upload-Dokument-ID fehlt.'; exit 1; }
document_record=$(curl --fail --silent --show-error \
  "${api}/rest/v1/documents?id=eq.${document_id}&select=bucket_id,object_path" "${admin_headers[@]}")
document_bucket=$(jq -r '.[0].bucket_id // empty' <<< "$document_record")
document_path=$(jq -r '.[0].object_path // empty' <<< "$document_record")
test -n "$document_bucket" && test -n "$document_path"

viewed=$(curl --fail --silent --show-error \
  "${api}/functions/v1/document-api?id=${document_id}" \
  -H "apikey: ${SUPABASE_PUBLISHABLE_KEY}" -H "Authorization: Bearer ${access_token}" \
  -H "Origin: https://eigenheimverwalter.github.io")
signed_url=$(jq -r '.url // empty' <<< "$viewed")
test -n "$signed_url"
curl --fail --silent --show-error --output /dev/null "$signed_url"

delete_status=$(curl --silent --output /dev/null --write-out '%{http_code}' -X DELETE \
  "${api}/functions/v1/document-api?id=${document_id}" \
  -H "apikey: ${SUPABASE_PUBLISHABLE_KEY}" -H "Authorization: Bearer ${access_token}" \
  -H "Origin: https://eigenheimverwalter.github.io")
test "$delete_status" = '204'

acl_status=$(curl --silent --output /dev/null --write-out '%{http_code}' \
  "${api}/functions/v1/portal-api/role-profiles" \
  -H "Authorization: Bearer ${access_token}" -H "Origin: https://eigenheimverwalter.github.io")
if [[ "$smoke_role" == 'admin_light' ]]; then test "$acl_status" = '403'; else test "$acl_status" = '200'; fi

if [[ -n "$mail_recipient" ]]; then
  [[ "$smoke_role" == 'super_admin' ]] || { echo 'Mailtest erfordert die isolierte Super-Admin-Smoke-Rolle.'; exit 1; }
  [[ "$mail_recipient" =~ ^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$ ]] || { echo 'Ungültiger Mailtest-Empfänger.'; exit 1; }
  for channel in partner registration info; do
    mail_result=$(curl --fail --silent --show-error -X POST \
      "${api}/functions/v1/portal-api/system/mail-test" \
      -H "Authorization: Bearer ${access_token}" -H "Origin: https://eigenheimverwalter.github.io" \
      -H 'Content-Type: application/json' \
      --data "$(jq -nc --arg channel "$channel" --arg to "$mail_recipient" '{channel:$channel,to:$to}')")
    jq -e --arg channel "$channel" '.status=="sent" and .channel==$channel and .delivery.status=="sent"' >/dev/null <<< "$mail_result"
  done
  echo 'Alle drei ALL-INKL-Mailkanäle meldeten einen bestätigten Versand.'
fi

cleanup
trap - EXIT
set -e
encoded_source=$(printf '%s' "$source_id" | jq -sRr @uri)
identity_left=$(curl --fail --silent --show-error \
  "${api}/rest/v1/identity_imports?source_user_id=eq.${encoded_source}&select=source_user_id" "${admin_headers[@]}")
document_left='[]'
if [[ -n "$document_id" ]]; then
  document_left=$(curl --fail --silent --show-error \
    "${api}/rest/v1/documents?id=eq.${document_id}&select=id" "${admin_headers[@]}")
fi
auth_status=$(curl --silent --output /dev/null --write-out '%{http_code}' \
  "${api}/auth/v1/admin/users/${user_id}" "${admin_headers[@]}")
test "$(jq 'length' <<< "$identity_left")" = '0'
test "$(jq 'length' <<< "$document_left")" = '0'
test "$auth_status" = '404'
echo 'Echtes Supabase-Login, Passwort-Recovery, Dashboard, Rollen-ACL, privater Dokumentzyklus und rückstandsfreie Bereinigung wurden bestätigt.'
