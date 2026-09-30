import fs from 'node:fs';
import {toBookablePostalEntry} from './postal-catalog-policy.mjs';

const [catalogFile='data/geonames-de-postal-codes.json',migrationFile='supabase/migrations/202609160001_bookable_locality_postal_catalog.sql',runtimeFile='data/runtime.json']=process.argv.slice(2);
const source=JSON.parse(fs.readFileSync(catalogFile,'utf8'));
const entries=source.entries.map(toBookablePostalEntry).filter(Boolean);
const metadata={...source.metadata,postalCodeCount:entries.length,importedAt:new Date().toISOString(),excludedInstitutionalRecipients:true,catalogPurpose:'bookable-locality-postal-codes'};
const catalog={metadata,entries};
if(entries.length<7000||new Set(entries.map(item=>item.state)).size!==16)throw new Error('POSTAL_CATALOG_INCOMPLETE');
fs.writeFileSync(catalogFile,JSON.stringify(catalog,null,2)+'\n');
const sqlJson=JSON.stringify(catalog).replaceAll('$postal_catalog$','$postal_catalog_safe$');
fs.writeFileSync(migrationFile,`-- Bookable German locality postal codes; institutional and bulk-recipient codes are excluded.\ndo $$\ndeclare catalog jsonb := $postal_catalog$${sqlJson}$postal_catalog$::jsonb;\nbegin\n  if jsonb_array_length(catalog->'entries') < 7000 then raise exception 'POSTAL_CATALOG_INCOMPLETE'; end if;\n  update public.portal_runtime_state\n  set payload=jsonb_set(jsonb_set(payload,'{postalDirectory}',catalog->'entries',true),'{postalCatalogMeta}',catalog->'metadata',true), revision=revision+1,updated_at=now()\n  where id='primary';\n  if not found then raise exception 'PORTAL_RUNTIME_STATE_MISSING'; end if;\nend $$;\n`);
if(runtimeFile&&fs.existsSync(runtimeFile)){
  const runtime=JSON.parse(fs.readFileSync(runtimeFile,'utf8'));
  runtime.postalDirectory=entries;
  runtime.postalCatalogMeta=metadata;
  fs.writeFileSync(runtimeFile,JSON.stringify(runtime,null,2)+'\n');
}
console.log(JSON.stringify({before:source.entries.length,after:entries.length,excluded:source.entries.length-entries.length,states:new Set(entries.map(item=>item.state)).size}));
