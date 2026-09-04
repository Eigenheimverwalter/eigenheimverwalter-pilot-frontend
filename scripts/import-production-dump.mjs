import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const [source,target='data/production-mirror.json']=process.argv.slice(2);
if(!source)throw new Error('Aufruf: node scripts/import-production-dump.mjs <dump.sql.gz> [ziel.json]');
const raw=fs.readFileSync(source),sql=source.endsWith('.gz')?zlib.gunzipSync(raw).toString('utf8'):raw.toString('utf8');
const wanted=new Set(['users','properties','property_files','communications','consumptions','financings','insurances','inspections','reminders','heating_data','roof_data','windows_data','facade_data','electrical1_data','sanitary_data','photvoltaik_data','fireplace_data','kitchen_data','room_data','ventilation_data','water_pipe_data','aircondition_data','lift_data','softening_data','wastewater_lifting_station_data','solar_storage_tank_data']);
const tables=Object.fromEntries([...wanted].map(t=>[t,[]]));

function values(input){
  const rows=[];let row=null,value='',quoted=false,escape=false,depth=0;
  const push=()=>{const v=value.trim();row.push(v.toUpperCase()==='NULL'?null:quotedValue(v));value=''};
  for(let i=0;i<input.length;i++){
    const c=input[i];
    if(escape){value+=c;escape=false;continue}
    if(quoted&&c==='\\'){value+=c;escape=true;continue}
    if(c==="'"){quoted=!quoted;value+=c;continue}
    if(!quoted&&c==='('){if(depth++===0){row=[];value=''}else value+=c;continue}
    if(!quoted&&c===')'){if(--depth===0){push();rows.push(row);row=null}else value+=c;continue}
    if(!quoted&&c===','&&depth===1){push();continue}
    if(depth>0)value+=c;
  }
  return rows;
}
function quotedValue(v){
  if(v.startsWith("'")&&v.endsWith("'"))return v.slice(1,-1).replace(/\\'/g,"'").replace(/\\r/g,'\r').replace(/\\n/g,'\n').replace(/\\\\/g,'\\');
  const n=Number(v);return v!==''&&Number.isFinite(n)?n:v;
}
const re=/INSERT INTO\s+`([^`]+)`\s*\(([^)]*)\)\s*VALUES\s*([\s\S]*?);/g;let match;
while((match=re.exec(sql))){const table=match[1];if(!wanted.has(table))continue;const columns=[...match[2].matchAll(/`([^`]+)`/g)].map(x=>x[1]);for(const row of values(match[3]))tables[table].push(Object.fromEntries(columns.map((c,i)=>[c,row[i]??null])))}
const mirror={meta:{createdAt:new Date().toISOString(),source:path.basename(source),classification:'CONFIDENTIAL_CUSTOMER_DATA',tables:Object.fromEntries(Object.entries(tables).map(([k,v])=>[k,v.length]))},tables};
fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,JSON.stringify(mirror));
console.log(JSON.stringify(mirror.meta,null,2));
