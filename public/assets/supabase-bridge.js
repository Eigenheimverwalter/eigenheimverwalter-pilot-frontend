import {normalizedPath,supportsPath,isDocumentUpload,isPublicPath,handlesRoute} from './supabase-routes.mjs?v=20260909-onboarding-entry';

const config=window.__EHV_RUNTIME__||{};
const enabled=config.authMode==='supabase'&&config.supabaseUrl&&config.supabasePublishableKey;
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
    if(!enabled)return null;
    if(isPublicPath(path)){
      const headers={apikey:config.supabasePublishableKey,'Content-Type':'application/json',...(options.headers||{})};
      if(/^\/api\/onboarding-invitations\/[^/]+\/claim$/.test(path)){
        const supabase=await getClient(),{data:{session}}=await supabase.auth.getSession();
        if(!session)throw Object.assign(Error('Bitte zuerst anmelden.'),{status:401});
        headers.Authorization=`Bearer ${session.access_token}`;
      }
      const supportTarget=sessionStorage.getItem('ehv-support-target');
      if(path.startsWith('/api/onboarding-invitations/')&&supportTarget)headers['x-ehv-support-user']=supportTarget;
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
    if(['/api/customer-invitations','/api/referral/invitations','/api/partners'].includes(path)&&options.body){const payload=JSON.parse(options.body);payload.siteUrl=config.siteBaseUrl||location.origin;options={...options,body:JSON.stringify(payload)}}
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
  handles(path){return Boolean(enabled)&&handlesRoute(path);},
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
