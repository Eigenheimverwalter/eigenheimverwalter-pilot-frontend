const tokenKey='ehv_allinkl_portal_token';
const config=window.__EHV_RUNTIME__||{};
const token=()=>sessionStorage.getItem(tokenKey)||'';
const proxy=String(config.portalProxy||'./portal-api.php');

const unpack=payload=>payload?.data&&typeof payload.data==='object'?payload.data:payload;
const errorFrom=async response=>{
  let data={};
  try{data=await response.json()}catch{}
  throw Object.assign(Error(data.message||data.error||`Anfrage fehlgeschlagen (${response.status})`),{status:response.status,code:data.code});
};
const requestProxy=async(path,options={})=>{
  const current=token(),headers={Accept:'application/json',...(options.body?{'Content-Type':'application/json'}:{}),...(current?{Authorization:`Bearer ${current}`}:{}) ,...(options.headers||{})};
  delete headers['X-CSRF-Token'];
  const response=await fetch(`${proxy}?path=${encodeURIComponent(path)}`,{...options,headers,credentials:'same-origin'});
  if(!response.ok)return errorFrom(response);
  if(response.status===204)return null;
  return unpack(await response.json());
};

window.ehvApiBridge={
  enabled:true,
  handles(){return true},
  async request(path,options={}){
    if(path==='/api/login'){
      const payload=JSON.parse(options.body||'{}');
      const result=await requestProxy('/api/v1/portal/auth/login',{method:'POST',body:JSON.stringify({email:payload.email||payload.username,username:payload.username||payload.email,password:payload.password})});
      if(!result?.token)throw Error('Die sichere Portalverbindung hat kein Sitzungstoken geliefert.');
      sessionStorage.setItem(tokenKey,result.token);
      const session=await requestProxy('/api/v1/portal/auth/session');
      return {user:session.user,csrf:null,supportView:null};
    }
    if(path==='/api/logout'){
      try{if(token())await requestProxy('/api/v1/portal/auth/logout',{method:'POST',body:'{}'})}finally{sessionStorage.removeItem(tokenKey)}
      return null;
    }
    if(path==='/api/me'){
      if(!token())throw Object.assign(Error('Nicht angemeldet'),{status:401});
      const session=await requestProxy('/api/v1/portal/auth/session');
      return {user:session.user,csrf:null,supportView:null};
    }
    return requestProxy(`/api/v1/portal${path.replace(/^\/api/,'')}`,options);
  },
  async updatePassword(password){return this.request('/api/account/password',{method:'PUT',body:JSON.stringify({password})})},
  async signInForOnboarding(email,password){const result=await this.request('/api/login',{method:'POST',body:JSON.stringify({email,password})});return result.user},
  async onboardingAuthUser(){try{return (await this.request('/api/me')).user}catch{return null}},
};
