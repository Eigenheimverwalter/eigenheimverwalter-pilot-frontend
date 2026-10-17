import fs from 'node:fs';
import path from 'node:path';

const root=path.resolve(import.meta.dirname,'..');
const frontendFiles=['assets/app.js','assets/features.js','assets/management-ui.js','assets/supabase-bridge.js']
  .map(file=>path.join(root,file)).filter(fs.existsSync);
const serverFiles=['server.mjs','supabase/functions/_shared/read-routes.ts','supabase/functions/_shared/write-routes.ts']
  .map(file=>path.join(root,file)).filter(fs.existsSync);

const normalize=value=>String(value)
  .replace(/\$\{[^}]+\}/g,'{id}')
  .replace(/\([^)]*\)/g,'{id}')
  .replace(/\[\^\/\]\+/g,'{id}')
  .replace(/\/+$/,'')||'/';

const extract=(file,kind)=>{
  const source=fs.readFileSync(file,'utf8');
  const results=[];
  const patterns=kind==='frontend'
    ? [/api\(\s*([`'\"])(\/api\/[^`'\"]+)\1/g,/fetch\(\s*([`'\"])(\/api\/[^`'\"]+)\1/g]
    : [/pathname\s*===\s*([`'\"])(\/api\/[^`'\"]+)\1/g,/path\s*===\s*([`'\"])(\/[^`'\"]+)\1/g,/match\(\/\^\\?\/(?:api\\\/)?([^$]+)\$\//g];
  for(const pattern of patterns){
    for(const match of source.matchAll(pattern)){
      let route=match[2]||match[1];
      if(!route)continue;
      if(kind==='server'&&!route.startsWith('/api/'))route='/api'+route;
      results.push({route:normalize(route),file:path.relative(root,file).replaceAll('\\','/')});
    }
  }
  return results;
};

const frontend=frontendFiles.flatMap(file=>extract(file,'frontend'));
const server=serverFiles.flatMap(file=>extract(file,'server'));
const group=rows=>new Map(rows.map(row=>[row.route,row]));
const frontMap=group(frontend),serverMap=group(server);
const all=[...new Set([...frontMap.keys(),...serverMap.keys()])].sort();
const rows=all.map(route=>({route,frontend:frontMap.get(route)?.file||'',implementation:serverMap.get(route)?.file||'',status:frontMap.has(route)&&serverMap.has(route)?'COVERED':frontMap.has(route)?'MISSING':'SERVER_ONLY'}));
const summary={generatedAt:new Date().toISOString(),frontendRoutes:frontMap.size,implementedRoutes:serverMap.size,covered:rows.filter(x=>x.status==='COVERED').length,missing:rows.filter(x=>x.status==='MISSING').length};
fs.mkdirSync(path.join(root,'.prod-audit'),{recursive:true});
fs.writeFileSync(path.join(root,'.prod-audit','route-parity.json'),JSON.stringify({summary,rows},null,2));
fs.writeFileSync(path.join(root,'.prod-audit','route-parity.md'),[
  '# Portal route parity',
  '',
  `Generated: ${summary.generatedAt}`,
  '',
  `Frontend routes: ${summary.frontendRoutes}; implemented: ${summary.implementedRoutes}; covered: ${summary.covered}; missing: ${summary.missing}.`,
  '',
  '| Status | Route | Frontend | Implementation |',
  '|---|---|---|---|',
  ...rows.map(x=>`| ${x.status} | \`${x.route}\` | ${x.frontend} | ${x.implementation} |`),
  ''
].join('\n'));
console.log(JSON.stringify(summary,null,2));
if(summary.missing)process.exitCode=2;
