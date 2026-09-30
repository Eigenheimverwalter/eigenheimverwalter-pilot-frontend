import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const input=path.resolve(process.argv[2]||process.env.DATA_FILE||'data/runtime.json');
const output=path.resolve(process.argv[3]||'tmp/supabase-migration');
if(!fs.existsSync(input))throw new Error(`Quelldatei nicht gefunden: ${input}`);
const rawData=JSON.parse(fs.readFileSync(input,'utf8'));
const blockedCollections=new Set(['authChallenges','passwordResetRequests']);
const blockedKeys=new Set(['password','passwordHash','token','secret','remember_token','fcm_token']);
const scrub=value=>Array.isArray(value)
  ? value.map(scrub)
  : value&&typeof value==='object'
    ? Object.fromEntries(Object.entries(value).filter(([key])=>!blockedKeys.has(key)).map(([key,item])=>[key,scrub(item)]))
    : value;
const data=Object.fromEntries(Object.entries(rawData).filter(([collection])=>!blockedCollections.has(collection)).map(([collection,value])=>[collection,scrub(value)]));
fs.mkdirSync(output,{recursive:true});
const runtimeState=Object.fromEntries(Object.entries(data).filter(([collection])=>collection!=='meta'));
fs.writeFileSync(path.join(output,'portal-runtime-state.json'),JSON.stringify(runtimeState,null,2));
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const records=[];
for(const [collection,value] of Object.entries(data)){
  if(collection==='meta')continue;
  const items=Array.isArray(value)
    ? value
    : value&&typeof value==='object'
      ? Object.entries(value).map(([id,payload])=>payload&&typeof payload==='object'?{id,...payload}:{id,value:payload})
      : [{id:'singleton',value}];
  for(const [index,item] of items.entries()){
    const payload=JSON.stringify(item);
    records.push({collection,source_id:String(item?.id??index),payload:item,payload_sha256:sha(payload)});
  }
}
fs.writeFileSync(path.join(output,'legacy_portal_records.json'),JSON.stringify(records,null,2));

const roots=['storage/uploads','storage/address-verification'];
const documents=[];
for(const root of roots){
  if(!fs.existsSync(root))continue;
  for(const name of fs.readdirSync(root)){
    if(name==='.gitkeep')continue;
    const file=path.join(root,name),stat=fs.statSync(file);
    if(!stat.isFile())continue;
    documents.push({source:file.replaceAll('\\','/'),name,size_bytes:stat.size,sha256:sha(fs.readFileSync(file)),bucket:root.includes('address-verification')?'ehv-sensitive-documents':'ehv-service-documents'});
  }
}
fs.writeFileSync(path.join(output,'documents-manifest.json'),JSON.stringify(documents,null,2));
const count=value=>Array.isArray(value)?value.length:value&&typeof value==='object'?Object.keys(value).length:1;
const manifest={source:path.basename(input),created_at:new Date().toISOString(),collections:Object.fromEntries(Object.entries(data).filter(([k])=>k!=='meta').map(([k,v])=>[k,count(v)])),record_count:records.length,document_count:documents.length,records_sha256:sha(JSON.stringify(records)),runtime_state_sha256:sha(JSON.stringify(runtimeState)),documents_manifest_sha256:sha(JSON.stringify(documents))};
fs.writeFileSync(path.join(output,'migration-manifest.json'),JSON.stringify(manifest,null,2));
console.log(JSON.stringify(manifest,null,2));
