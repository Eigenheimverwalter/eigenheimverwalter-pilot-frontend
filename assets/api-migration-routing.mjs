const cleanPath=value=>{
  const raw=String(value||'').split('?')[0]||'/';
  return raw.length>1?raw.replace(/\/+$/,''):raw;
};

const patternSegments=value=>cleanPath(value).split('/').filter(Boolean);

const routeMatches=(path,entry)=>{
  const raw=String(entry||'');
  const wildcard=raw.endsWith('/*');
  const candidate=cleanPath(wildcard?raw.slice(0,-2):raw);
  if(candidate==='/'||path===candidate||(wildcard&&path.startsWith(`${candidate}/`)))return true;
  if(!candidate.includes(':'))return false;
  const actual=patternSegments(path),expected=patternSegments(candidate);
  if(actual.length!==expected.length)return false;
  return expected.every((segment,index)=>segment.startsWith(':')?actual[index].length>0:segment===actual[index]);
};

export const apiBackendFor=(path,config={})=>{
  const mode=String(config.apiMode||'supabase').toLowerCase();
  if(mode==='allinkl')return 'allinkl';
  if(mode!=='hybrid')return 'supabase';
  const current=cleanPath(path);
  const routes=Array.isArray(config.allinklRoutes)?config.allinklRoutes:[];
  return routes.some(entry=>routeMatches(current,entry))?'allinkl':'supabase';
};

export const allinklApiUrl=(path,config={})=>{
  const base=String(config.allinklApiBase||'').replace(/\/+$/,'');
  if(!base)throw Error('ALL-INKL API-Basis fehlt.');
  const requested=String(path||'').startsWith('/')?String(path):`/${path}`;
  const routeMap=config.allinklRouteMap&&typeof config.allinklRouteMap==='object'?config.allinklRouteMap:{};
  const exact=routeMap[cleanPath(requested)];
  const normalized=exact||requested;
  const portalBase=/\/api\/v1\/portal$/i.test(base);
  const relative=portalBase?String(normalized).replace(/^\/api(?=\/|$)/,''):String(normalized);
  const current=relative.startsWith('/')?relative:`/${relative}`;
  return `${base}${current}`;
};
