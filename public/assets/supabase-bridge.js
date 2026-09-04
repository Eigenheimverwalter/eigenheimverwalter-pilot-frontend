const config=window.__EHV_RUNTIME__||{};
const enabled=config.authMode==='supabase'&&config.supabaseUrl&&config.supabasePublishableKey;
const supported=new Set([
  '/api/me','/api/dashboard','/api/account','/api/customers','/api/production/customers',
  '/api/partners','/api/assignments','/api/cases','/api/sales','/api/campaigns',
  '/api/role-profiles','/api/partner-role-templates','/api/admin/users',
  '/api/opportunity-engine','/api/partner/workbench','/api/audit','/api/postal-codes',
  '/api/portfolio/risks'
]);
const normalizedPath=path=>String(path||'').split('?')[0];
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
    if(!supported.has(normalizedPath(path)))return null;
    const {data:{session}}=await client.auth.getSession();
    if(!session)throw Error('Nicht angemeldet');
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
  handles(path){return Boolean(enabled)&&(path==='/api/login'||path==='/api/logout'||supported.has(normalizedPath(path)));},
};
