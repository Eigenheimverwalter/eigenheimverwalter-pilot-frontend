#!/usr/bin/env bash
set -euo pipefail

: "${SUPABASE_PROJECT_REF:?SUPABASE_PROJECT_REF fehlt}"
: "${SUPABASE_ACCESS_TOKEN:?SUPABASE_ACCESS_TOKEN fehlt}"

management="https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_REF}/config/auth"
site='https://eigenheimverwalter.github.io/eigenheimverwalter-pilot-frontend'
auth=$(curl --fail --silent --show-error "$management" \
  -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}")
current=$(jq -r '.uri_allow_list // ""' <<< "$auth")
payload=$(jq -nc --arg current "$current" --arg site "$site" \
  '{site_url:$site,uri_allow_list:((($current|split(","))+[$site,($site+"/passwort-zuruecksetzen"),($site+"/**")])|map(gsub("^\\s+|\\s+$";""))|map(select(length>0))|unique|join(","))}')
curl --fail --silent --show-error -X PATCH "$management" \
  -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
  -H 'Content-Type: application/json' --data "$payload" >/dev/null

verified=$(curl --fail --silent --show-error "$management" \
  -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}")
jq -e --arg site "$site" \
  '.site_url==$site and ((.uri_allow_list//"")|split(",")|index($site)!=null) and ((.uri_allow_list//"")|split(",")|index($site+"/**")!=null)' \
  >/dev/null <<< "$verified"
echo 'Pilot-Auth-Ziel und konkrete GitHub-Pages-Redirects sind konfiguriert.'
