import {normalizedPath,supportsPath,isDocumentUpload,isPublicPath,handlesRoute} from './supabase-routes.mjs?v=20261016-dashboard-routing-1';
import {apiBackendFor,allinklApiUrl} from './api-migration-routing.mjs?v=20261016-dashboard-routing-1';

const allinklError=async response=>{
  let data={};
  try{data=await response.json()}catch{}
  throw Object.assign(Error(data.message||data.error||`ALL-INKL-Anfrage fehlgeschlagen (${response.status})`),{status:response.status,code:data.code});
};

const config=window.__EHV_RUNTIME__||{};
const enabled=config.authMode==='supabase'&&config.supabaseUrl&&config.supabasePublishableKey;
const allinklAuthPreferred=config.allinklAuthPreferred===true;
const allinklTokenKey='ehv_allinkl_portal_token';
const allinklAuthRoot=String(config.allinklApiBase||'').replace(/\/+$/,'')||`${String(config.allinklAuthBase||'').replace(/\/+$/,'')}/v1/portal`;
const allinklAuthUrl=path=>`${allinklAuthRoot}/auth/${path}`;
const allinklToken=()=>sessionStorage.getItem(allinklTokenKey)||'';
let client=null,clientPromise=null;

const getClient=async()=>{
  if(client)return client;
  if(!clientPromise)clientPromise=import('https://esm.sh/@supabase/supabase-js@2').then(({createClient})=>createClient(config.supabaseUrl,config.supabasePublishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}}));
  client=await clientPromise;
  return client;
};

const responseError=async response=>{
  let data={};
  try{data=await response.json()}catch{}
  throw Object.assign(Error(data.error||`Supabase-Anfrage fehlgeschlagen (${response.status})`),{status:response.status,code:data.code});
};

window.ehvSupabaseBridge={
  enabled:Boolean(enabled),
  async request(path,options={}){
    // Supabase uses the bearer session, not the legacy cookie/CSRF header.
    // Sending the obsolete header causes the browser's CORS preflight to fail.
    if(options.headers){const headers=new Headers(options.headers);headers.delete('X-CSRF-Token');options={...options,headers:Object.fromEntries(headers)};}
    if(allinklAuthPreferred&&path==='/api/login'){
      const response=await fetch(allinklAuthUrl('login'),{method:'POST',headers:{Accept:'application/json','Content-Type':'application/json'},body:options.body||'{}'});
      if(!response.ok)return allinklError(response);
      const data=await response.json();
      if(!data.token)throw Error('Die sichere Portalverbindung hat kein Sitzungstoken geliefert.');
      sessionStorage.setItem(allinklTokenKey,data.token);
      return data;
    }
    if(allinklAuthPreferred&&path==='/api/logout'){
      const token=allinklToken();
      try{if(token){const response=await fetch(allinklAuthUrl('logout'),{method:'POST',headers:{Accept:'application/json',Authorization:`Bearer ${token}`}});if(!response.ok&&response.status!==401)return allinklError(response)}}finally{sessionStorage.removeItem(allinklTokenKey)}
      return null;
    }
    if(allinklAuthPreferred&&path==='/api/me'){
      const token=allinklToken();
      if(!token)throw Object.assign(Error('Nicht angemeldet'),{status:401});
      const response=await fetch(allinklAuthUrl('session'),{headers:{Accept:'application/json',Authorization:`Bearer ${token}`}});
      if(!response.ok){if(response.status===401)sessionStorage.removeItem(allinklTokenKey);return allinklError(response)}
      return response.json();
    }
    if(apiBackendFor(path,config)==='allinkl'){
      const token=allinklToken(),headers={Accept:'application/json','Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{}) ,...(options.headers||{})};
      const response=await fetch(allinklApiUrl(path,config),{...options,headers});
      if(!response.ok)return allinklError(response);
      return response.status===204?null:response.json();
    }
    if(!enabled)return null;
    if(isPublicPath(path)){
      const headers={apikey:config.supabasePublishableKey,'Content-Type':'application/json',...(options.headers||{})};
      if(/^\/api\/onboarding-invitations\/[^/]+\/claim$/.test(path)||path==='/api/onboarding-self-service/session'){
        const supabase=await getClient(),{data:{session}}=await supabase.auth.getSession();
        if(!session)throw Object.assign(Error('Bitte zuerst anmelden.'),{status:401});
        headers.Authorization=`Bearer ${session.access_token}`;
      }
      const supportTarget=sessionStorage.getItem('ehv-support-target');
      if((path.startsWith('/api/onboarding-invitations/')||path.startsWith('/api/onboarding-self-service/'))&&supportTarget)headers['x-ehv-support-user']=supportTarget;
      const response=await fetch(`${config.supabaseUrl}/functions/v1/portal-public${path.replace(/^\/api/,'')}`,{...options,headers});
      if(!response.ok)return responseError(response);return response.json();
    }
    const supabase=await getClient();
    if(path==='/api/login'){
      const credentials=JSON.parse(options.body||'{}');
      const {error}=await supabase.auth.signInWithPassword({email:credentials.email,password:credentials.password});
      if(error){
        const email=String(credentials.email||'').trim().toLowerCase();
        if(email.endsWith('@ehv.test'))throw Error('Dieser alte Render-Testzugang wurde nicht nach Supabase übernommen. Der Adminzugang erfolgt über info@eigenheimverwalter.de und „Passwort vergessen“.');
        throw Error('E-Mail-Adresse oder Passwort ist nicht korrekt');
      }
      return this.request('/api/me');
    }
    if(path==='/api/logout'){
      const {error}=await supabase.auth.signOut();
      if(error)throw error;
      return null;
    }
    if(!supportsPath(path)&&!isDocumentUpload(path))return null;
    const {data:{session}}=await supabase.auth.getSession();
    if(!session)throw Error('Nicht angemeldet');
    if(isDocumentUpload(path)){
      const payload=JSON.parse(options.body||'{}');payload.legacyRoute=normalizedPath(path);
      const response=await fetch(`${config.supabaseUrl}/functions/v1/document-api`,{method:'POST',headers:{Authorization:`Bearer ${session.access_token}`,apikey:config.supabasePublishableKey,'Content-Type':'application/json'},body:JSON.stringify(payload)});
      if(!response.ok)return responseError(response);return response.json();
    }
    const route=path.replace(/^\/api/,''),supportTarget=sessionStorage.getItem('ehv-support-target');
    if((['/api/customer-invitations','/api/referral/invitations','/api/partners'].includes(path)||/^\/api\/partners\/[^/]+\/registration-invitation\/resend$/.test(path))&&options.body){const payload=JSON.parse(options.body);payload.siteUrl=config.siteBaseUrl||location.origin;options={...options,body:JSON.stringify(payload)}}
    const response=await fetch(`${config.supabaseUrl}/functions/v1/portal-api${route}`,{
      ...options,
      headers:{Authorization:`Bearer ${session.access_token}`,apikey:config.supabasePublishableKey,'Content-Type':'application/json',...(supportTarget?{'x-ehv-support-user':supportTarget}:{}),...(options.headers||{})},
    });
    if(!response.ok)return responseError(response);
    const data=await response.json();
    if(path==='/api/support-view/start'){sessionStorage.setItem('ehv-support-target',data.supportView.target.id);return data}
    if(path==='/api/support-view/stop'){sessionStorage.removeItem('ehv-support-target');return data}
    if(path==='/api/me')return {user:{id:data.user.id,name:data.user.display_name||data.user.name,email:data.user.email,role:data.user.role},csrf:null,supportView:data.supportView||null};
    return data;
  },
  async updatePassword(password){const supabase=await getClient(),{error}=await supabase.auth.updateUser({password});if(error)throw error;return {message:'Das Passwort wurde geändert.'};},
  async signInForOnboarding(email,password){
    const supabase=await getClient(),{data,error}=await supabase.auth.signInWithPassword({email,password});
    if(error)throw Error('E-Mail-Adresse oder Passwort ist nicht korrekt.');
    return data.user;
  },
  async onboardingAuthUser(){const supabase=await getClient(),{data,error}=await supabase.auth.getUser();return error?null:data.user;},
  handles(path){return (allinklAuthPreferred&&['/api/login','/api/logout','/api/me'].includes(path))||apiBackendFor(path,config)==='allinkl'||Boolean(enabled)&&handlesRoute(path);},
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
    const supabase=await getClient(),{data:{session}}=await supabase.auth.getSession();if(!session)throw Error('Nicht angemeldet');
    const response=await fetch(`${config.supabaseUrl}/functions/v1/document-api?${query}`,{headers:{Authorization:`Bearer ${session.access_token}`,apikey:config.supabasePublishableKey}});
    if(!response.ok)return responseError(response);const result=await response.json();
    if(popup)popup.location.replace(result.url);else location.assign(result.url);
  }catch(error){if(popup)popup.close();window.dispatchEvent(new CustomEvent('ehv-document-error',{detail:{message:error.message}}));}
});
