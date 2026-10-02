import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const sourceVersion=item=>crypto.createHash('sha256').update(JSON.stringify({id:String(item.id||''),propertyId:String(item.property_id||''),file:String(item.file||''),createdAt:String(item.created_at||''),updatedAt:String(item.updated_at||'')})).digest('hex');

test('document import reuses unchanged files and downloads new files exactly once',async()=>{
  const unchanged={id:1,property_id:10,file:'bestand.pdf',created_at:'2026-01-01T00:00:00Z',updated_at:'2026-01-01T00:00:00Z'};
  const added={id:2,property_id:10,file:'neu.pdf',created_at:'2026-10-02T00:00:00Z',updated_at:'2026-10-02T00:00:00Z'};
  const source={meta:{classification:'CONFIDENTIAL_CUSTOMER_DATA',source:'api.eigenheimverwalter.de'},tables:{property_files:[unchanged,added]}};
  let state={revision:4,payload:{productionMirror:{tables:{property_files:[{...unchanged,fileAvailable:true,supabaseDocumentId:'doc-existing',storageBucket:'ehv-sensitive-documents',storageObjectPath:'production/10/existing.pdf',sourceVersion:sourceVersion(unchanged)},{...added,fileAvailable:false,sourceVersion:sourceVersion(added)}]}}}};
  const requests=[];
  const server=http.createServer(async(req,res)=>{
    requests.push(`${req.method} ${req.url}`);
    if(req.url.startsWith('/rest/v1/portal_runtime_state')){res.setHeader('content-type','application/json');return res.end(JSON.stringify([state]));}
    if(req.url==='/api/migration/production-files/2'){res.setHeader('content-type','application/pdf');return res.end(Buffer.from('%PDF-1.4 test'));}
    if(req.url.startsWith('/storage/v1/object/')){res.setHeader('content-type','application/json');return res.end('{}');}
    if(req.url.startsWith('/rest/v1/documents')){res.setHeader('content-type','application/json');return res.end(JSON.stringify([{id:'doc-new'}]));}
    if(req.url==='/rest/v1/rpc/replace_portal_runtime_state'){
      let body='';for await(const chunk of req)body+=chunk;
      const parsed=JSON.parse(body);state={revision:5,payload:parsed.next_payload};res.setHeader('content-type','application/json');return res.end('{}');
    }
    res.statusCode=404;res.end();
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const port=server.address().port,temp=fs.mkdtempSync(path.join(os.tmpdir(),'ehv-document-import-')),sourceFile=path.join(temp,'source.json');
  fs.writeFileSync(sourceFile,JSON.stringify(source));
  try{
    const result=await new Promise((resolve,reject)=>{
      const child=spawn(process.execPath,['scripts/import-production-documents.mjs',sourceFile],{cwd:new URL('..',import.meta.url),env:{...process.env,SUPABASE_URL:`http://127.0.0.1:${port}`,SUPABASE_SERVICE_ROLE_KEY:'test-service-key',PILOT_MIGRATION_EXPORT_BASE:'https://api.eigenheimverwalter.de',PILOT_MIGRATION_EXPORT_TOKEN:'test-export-token',TEST_LOCAL_BASE:`http://127.0.0.1:${port}`,NODE_OPTIONS:`--require=${fileURLToPath(new URL('./production-document-import-fetch-hook.cjs',import.meta.url))}`}});
      let stdout='',stderr='';child.stdout.on('data',chunk=>stdout+=chunk);child.stderr.on('data',chunk=>stderr+=chunk);child.on('error',reject);child.on('close',code=>code===0?resolve(JSON.parse(stdout)):reject(new Error(stderr||`exit ${code}`)));
    });
    assert.equal(result.reused,1);assert.equal(result.downloaded,1);assert.equal(result.available,2);assert.equal(result.notFound,0);assert.equal(result.complete,true);
    assert.equal(requests.filter(item=>item.includes('/api/migration/production-files/2')).length,1);
    assert.equal(requests.filter(item=>item.includes('/api/migration/production-files/1')).length,0);
    const [first,second]=state.payload.productionMirror.tables.property_files;
    assert.equal(first.supabaseDocumentId,'doc-existing');assert.equal(second.supabaseDocumentId,'doc-new');assert.equal(state.payload.productionSync.documents.status,'success');
  }finally{server.close();fs.rmSync(temp,{recursive:true,force:true});}
});
