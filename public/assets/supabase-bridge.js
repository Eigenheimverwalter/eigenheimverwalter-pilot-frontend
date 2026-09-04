const config=window.__EHV_RUNTIME__||{};
const enabled=config.authMode==='supabase'&&config.supabaseUrl&&config.supabasePublishableKey;
const supported=new Set([
  '/api/me','/api/dashboard','/api/account','/api/customers','/api/production/customers',
  '/api/partners','/api/assignments','/api/cases','/api/sales','/api/valuations','/api/campaigns',
  '/api/role-profiles','/api/partner-role-templates','/api/admin/users',
  '/api/opportunity-engine','/api/partner/workbench','/api/audit','/api/postal-codes',
  '/api/portfolio/risks'
  ,'/api/admin-light-dashboard','/api/broker-dashboard','/api/broker/customers',
  '/api/partner-coverage','/api/partner-geography','/api/customer-coverage',
  '/api/analytics/overview','/api/system-overview'
  ,'/api/partner-performance','/api/broker-ranking','/api/property-ranking','/api/referral'
]);
const normalizedPath=path=>String(path||'').split('?')[0];
const dynamicSupported=[
  /^\/api\/(?:cases|partners|equipment|service-records)\/[^/]+$/,
  /^\/api\/equipment\/[^/]+\/service-records$/,
  /^\/api\/broker\/sales-files\/[^/]+(?:\/(?:document-status|address-verification|mandate|closing|release))?$/,
  /^\/api\/customer-actions\/[^/]+\/respond$/,
  /^\/api\/partner-opportunities\/[^/]+\/complete$/
  ,/^\/api\/production\/customers\/[^/]+$/,
  /^\/api\/properties\/[^/]+\/equipment$/
];
const supportsPath=path=>supported.has(normalizedPath(path))||dynamicSupported.some(pattern=>pattern.test(normalizedPath(path)));
const documentUploads=[/^\/api\/cases\/[^/]+\/documents$/, /^\/api\/broker\/sales-files\/[^/]+\/documents$/, /^\/api\/equipment\/[^/]+\/offers$/, /^\/api\/production\/properties\/[^/]+\/land-register$/];
const isDocumentUpload=path=>documentUploads.some(pattern=>pattern.test(normalizedPath(path)));
const publicPaths=[/^\/api\/partner-basic\/trades$/, /^\/api\/partner-basic\/register$/, /^\/api\/password\/forgot$/];
const isPublicPath=path=>publicPaths.some(pattern=>pattern.test(normalizedPath(path)));
let client=null;

const responseError=async response=>{
  let data={};
  try{data=await response.json()}catch{}
  throw Error(data.error||`Supabase-Anfrage fehlgeschlagen (${response.status})`);
};

if(enabled){
  const {createClient}=await import('https://esm.sh/@supabase/supabase-js@2');
  client=createClient(config.supabaseUrl,config.supabasePublishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
}

window.ehvSupabaseBridge={
  enabled:Boolean(enabled),
  async request(path,options={}){
    if(!enabled)return null;
    if(path==='/api/login'){
      const credentials=JSON.parse(options.body||'{}');
      const {error}=await client.auth.signInWithPassword({email:credentials.email,password:credentials.password});
      if(error)throw Error('E-Mail-Adresse oder Passwort ist nicht korrekt');
      return this.request('/api/me');
    }
    if(path==='/api/logout'){
      const {error}=await client.auth.signOut();
      if(error)throw error;
      return null;
    }
    if(isPublicPath(path)){
      const response=await fetch(`${config.supabaseUrl}/functions/v1/portal-public${path.replace(/^\/api/,'')}`,{...options,headers:{apikey:config.supabasePublishableKey,'Content-Type':'application/json',...(options.headers||{})}});
      if(!response.ok)return responseError(response);return response.json();
    }
    if(!supportsPath(path)&&!isDocumentUpload(path))return null;
    const {data:{session}}=await client.auth.getSession();
    if(!session)throw Error('Nicht angemeldet');
    if(isDocumentUpload(path)){
      const payload=JSON.parse(options.body||'{}');payload.legacyRoute=normalizedPath(path);
      const response=await fetch(`${config.supabaseUrl}/functions/v1/document-api`,{method:'POST',headers:{Authorization:`Bearer ${session.access_token}`,apikey:config.supabasePublishableKey,'Content-Type':'application/json'},body:JSON.stringify(payload)});
      if(!response.ok)return responseError(response);return response.json();
    }
    const route=path.replace(/^\/api/,'');
    const response=await fetch(`${config.supabaseUrl}/functions/v1/portal-api${route}`,{
      ...options,
      headers:{Authorization:`Bearer ${session.access_token}`,apikey:config.supabasePublishableKey,'Content-Type':'application/json',...(options.headers||{})},
    });
    if(!response.ok)return responseError(response);
    const data=await response.json();
    if(path==='/api/me')return {user:{id:data.user.id,name:data.user.display_name,email:data.user.email,role:data.user.role},csrf:null,supportView:null};
    return data;
  },
  async updatePassword(password){const {error}=await client.auth.updateUser({password});if(error)throw error;return {message:'Das Passwort wurde geändert.'};},
  handles(path){return Boolean(enabled)&&(path==='/api/login'||path==='/api/logout'||isPublicPath(path)||supportsPath(path)||isDocumentUpload(path));},
};

const legacyDocumentRequest=href=>{
  const url=new URL(href,location.origin),path=url.pathname;
  const direct=path.match(/^\/api\/(?:service-documents|offer-documents|broker\/sales-documents|production\/documents)\/([^/]+)$/);
  if(direct)return `id=${encodeURIComponent(direct[1])}`;
  const land=path.match(/^\/api\/production\/properties\/([^/]+)\/land-register$/);
  if(land)return `propertyId=${encodeURIComponent(land[1])}&class=land_register`;
  return null;
};

document.addEventListener('click',async event=>{
  if(!enabled)return;const anchor=event.target.closest('a[href]');if(!anchor)return;
  const query=legacyDocumentRequest(anchor.href);if(!query)return;event.preventDefault();
  const popup=window.open('about:blank','_blank','noopener');
  try{
    const {data:{session}}=await client.auth.getSession();if(!session)throw Error('Nicht angemeldet');
    const response=await fetch(`${config.supabaseUrl}/functions/v1/document-api?${query}`,{headers:{Authorization:`Bearer ${session.access_token}`,apikey:config.supabasePublishableKey}});
    if(!response.ok)return responseError(response);const result=await response.json();
    if(popup)popup.location.replace(result.url);else location.assign(result.url);
  }catch(error){if(popup)popup.close();window.dispatchEvent(new CustomEvent('ehv-document-error',{detail:{message:error.message}}));}
});
