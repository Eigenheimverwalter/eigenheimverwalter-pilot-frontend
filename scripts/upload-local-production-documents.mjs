import childProcess from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const mirror=JSON.parse(fs.readFileSync(process.argv[2]||'data/production-mirror.json','utf8')),directory=path.resolve(process.argv[3]||'storage/production-files');
const endpoint='https://rpniwtshbwjuesoeztyt.supabase.co/functions/v1/production-document-import',token=childProcess.execFileSync('gh',['auth','token'],{encoding:'utf8'}).trim();
if(!token)throw new Error('GitHub-Anmeldung fehlt');
const local=new Map(fs.readdirSync(directory,{withFileTypes:true}).filter(item=>item.isFile()).map(item=>[item.name,path.join(directory,item.name)]));
const rows=mirror.tables.property_files.filter(item=>item.file&&local.has(path.basename(String(item.file))));
const mime=name=>{const ext=path.extname(name).toLowerCase();return ext==='.pdf'?'application/pdf':ext==='.png'?'image/png':['.jpg','.jpeg'].includes(ext)?'image/jpeg':null;};
const request=async payload=>{const response=await fetch(endpoint,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(payload)});if(!response.ok)throw new Error(`Import fehlgeschlagen (${response.status}): ${await response.text()}`);return response.json();};
let imported=0,unsupported=0;
for(let offset=0;offset<rows.length;offset+=3)await Promise.all(rows.slice(offset,offset+3).map(async row=>{const name=path.basename(String(row.file)),type=mime(name);if(!type){unsupported++;return;}const contentBase64=fs.readFileSync(local.get(name)).toString('base64');await request({sourceId:String(row.id),propertyId:String(row.property_id),name,mime:type,contentBase64});imported++;}));
const final=await request({action:'finalize'});console.log(JSON.stringify({status:'validated',localFiles:local.size,matchedRows:rows.length,imported,unsupported,supabaseAvailable:final.available,manifestTotal:final.total},null,2));

