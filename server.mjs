import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { URL } from 'node:url';
import { Store } from './lib/store.mjs';
import { verifyPassword, randomToken, hasPermission, canAccessProperty, cleanText } from './lib/security.mjs';

const port=Number(process.env.PORT||8080), origin=process.env.APP_ORIGIN||`http://localhost:${port}`;
const store=new Store(process.env.DATA_FILE||'./data/runtime.json');
const sessions=new Map(), rate=new Map();
const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':"default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",'Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Permissions-Policy':'camera=(), microphone=(), geolocation=()'};
const send=(res,status,data,extra={})=>{res.writeHead(status,{...headers,...extra});res.end(data===undefined?'':JSON.stringify(data));};
const body=async req=>{let raw='';for await(const c of req){raw+=c;if(raw.length>6_000_000)throw Error('payload_too_large');}return raw?JSON.parse(raw):{};};
const cookies=req=>Object.fromEntries((req.headers.cookie||'').split(';').filter(Boolean).map(x=>x.trim().split('=')));
const auth=req=>sessions.get(cookies(req).ehv_session);
const requireAuth=(req,res,permission)=>{const session=auth(req);if(!session){send(res,401,{error:'Nicht angemeldet'});return null;}const user=store.data.users.find(u=>u.id===session.userId&&u.active);if(!user){send(res,401,{error:'Sitzung ungültig'});return null;}if(permission&&!hasPermission(user,permission)){store.audit(user,'access.denied','permission',permission,req.socket.remoteAddress);send(res,403,{error:'Keine Berechtigung'});return null;}if(!['GET','HEAD'].includes(req.method)&&req.headers['x-csrf-token']!==session.csrf){send(res,403,{error:'CSRF-Prüfung fehlgeschlagen'});return null;}return {user,session};};
const scopedProperties=user=>store.data.properties.filter(p=>canAccessProperty(user,p,store.data));

const server=http.createServer(async(req,res)=>{try{
  const url=new URL(req.url,origin), ip=req.socket.remoteAddress||'unknown';
  if(req.method==='GET' && (url.pathname==='/'||url.pathname==='/app')) return serve(res,'public/index.html','text/html; charset=utf-8');
  if(req.method==='GET' && url.pathname.startsWith('/assets/')) return serve(res,`public${url.pathname}`,url.pathname.endsWith('.css')?'text/css':'text/javascript');
  if(req.method==='POST'&&url.pathname==='/api/login'){
    const key=`${ip}:login`, hits=rate.get(key)||[]; const fresh=hits.filter(t=>Date.now()-t<60000); if(fresh.length>=8)return send(res,429,{error:'Zu viele Versuche. Bitte kurz warten.'}); fresh.push(Date.now());rate.set(key,fresh);
    const data=await body(req), user=store.data.users.find(u=>u.email.toLowerCase()===String(data.email||'').toLowerCase());
    if(!user||!user.active||!verifyPassword(String(data.password||''),user.passwordHash)){store.audit(null,'auth.failed','user',data.email||'',ip);return send(res,401,{error:'Anmeldedaten ungültig'});}
    const token=randomToken(), csrf=randomToken();sessions.set(token,{userId:user.id,csrf,expires:Date.now()+8*3600e3});store.audit(user,'auth.login','user',user.id,ip);
    return send(res,200,{user:{id:user.id,name:user.name,role:user.role},csrf},{'Set-Cookie':`ehv_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${origin.startsWith('https')?'; Secure':''}`});
  }
  if(req.method==='POST'&&url.pathname==='/api/logout'){const a=requireAuth(req,res);if(!a)return;sessions.delete(cookies(req).ehv_session);return send(res,204,undefined,{'Set-Cookie':'ehv_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'});}
  if(req.method==='GET'&&url.pathname==='/api/me'){const a=requireAuth(req,res);if(!a)return;return send(res,200,{user:{id:a.user.id,name:a.user.name,email:a.user.email,role:a.user.role},csrf:a.session.csrf});}
  if(req.method==='GET'&&url.pathname==='/api/dashboard'){const a=requireAuth(req,res,'dashboard.read');if(!a)return;const props=scopedProperties(a.user);const propertyIds=new Set(props.map(p=>p.id));return send(res,200,{kpis:{partners:store.data.partners.filter(p=>p.status==='active').length,properties:props.length,openCases:store.data.serviceCases.filter(s=>propertyIds.has(s.propertyId)&&s.status!=='done').length,salesFiles:store.data.salesFiles.filter(s=>propertyIds.has(s.propertyId)).length},recentCases:store.data.serviceCases.filter(s=>propertyIds.has(s.propertyId)).slice(0,5),properties:props});}
  if(req.method==='GET'&&url.pathname==='/api/partners'){const a=requireAuth(req,res,'partners.read');if(!a)return;return send(res,200,{partners:store.data.partners,trades:store.data.trades});}
  if(req.method==='POST'&&url.pathname==='/api/partners'){const a=requireAuth(req,res,'partners.write');if(!a)return;const d=await body(req), partner={id:store.id('p'),company:cleanText(d.company,120),contact:cleanText(d.contact,120),email:cleanText(d.email,160),status:'invited',tradeIds:Array.isArray(d.tradeIds)?d.tradeIds.filter(x=>store.data.trades.some(t=>t.id===x)):[],postalCodes:Array.isArray(d.postalCodes)?d.postalCodes.map(x=>cleanText(x,5)).filter(x=>/^\d{5}$/.test(x)):[],onboarding:10,lastContact:new Date().toISOString().slice(0,10)};if(!partner.company||!partner.email)return send(res,422,{error:'Firma und E-Mail sind erforderlich'});store.data.partners.push(partner);store.audit(a.user,'partner.created','partner',partner.id,ip,{company:partner.company});return send(res,201,partner);}
  if(req.method==='GET'&&url.pathname==='/api/customers'){const a=requireAuth(req,res,'customers.read');if(!a)return;const props=scopedProperties(a.user), ids=new Set(props.map(p=>p.customerId));return send(res,200,{customers:store.data.customers.filter(c=>ids.has(c.id)),properties:props});}
  if(req.method==='GET'&&url.pathname==='/api/cases'){const a=requireAuth(req,res,'service.read');if(!a)return;const ids=new Set(scopedProperties(a.user).map(p=>p.id));return send(res,200,{cases:store.data.serviceCases.filter(c=>ids.has(c.propertyId)),properties:scopedProperties(a.user)});}
  if(req.method==='POST'&&url.pathname==='/api/cases'){const a=requireAuth(req,res,'service.write');if(!a)return;const d=await body(req), prop=store.data.properties.find(p=>p.id===d.propertyId);if(!canAccessProperty(a.user,prop,store.data,true))return send(res,403,{error:'Kein Schreibzugriff auf dieses Objekt'});const item={id:store.id('s'),propertyId:prop.id,title:cleanText(d.title,160),category:cleanText(d.category,60),status:'new',priority:['low','medium','high'].includes(d.priority)?d.priority:'medium',partnerId:null,updatedAt:new Date().toISOString(),documents:[]};store.data.serviceCases.unshift(item);store.audit(a.user,'case.created','service_case',item.id,ip,{propertyId:prop.id});return send(res,201,item);}
  if(req.method==='GET'&&url.pathname==='/api/sales'){const a=requireAuth(req,res,'sales.read');if(!a)return;const ids=new Set(scopedProperties(a.user).map(p=>p.id));return send(res,200,{salesFiles:store.data.salesFiles.filter(x=>ids.has(x.propertyId)),valuations:store.data.valuations.filter(x=>ids.has(x.propertyId)),properties:scopedProperties(a.user)});}
  if(req.method==='POST'&&url.pathname==='/api/valuations'){const a=requireAuth(req,res,'valuations.write');if(!a)return;const d=await body(req),prop=store.data.properties.find(p=>p.id===d.propertyId);if(!canAccessProperty(a.user,prop,store.data,true))return send(res,403,{error:'Kein Schreibzugriff'});const v={id:store.id('w'),propertyId:prop.id,source:'Makler',value:Number(d.value),effectiveDate:String(d.effectiveDate||new Date().toISOString().slice(0,10)),createdBy:a.user.id,note:cleanText(d.note,500)};if(!Number.isFinite(v.value)||v.value<1)return send(res,422,{error:'Ungültiger Verkehrswert'});store.data.valuations.push(v);store.audit(a.user,'valuation.created','valuation',v.id,ip,{propertyId:prop.id,value:v.value});return send(res,201,v);}
  if(req.method==='GET'&&url.pathname==='/api/audit'){const a=requireAuth(req,res,'audit.read');if(!a)return;return send(res,200,{audit:store.data.audit.slice(0,200)});}
  if(req.method==='GET'&&url.pathname==='/api/export/properties.csv'){const a=requireAuth(req,res,'exports.read');if(!a)return;const rows=[['EHV-ID','Adresse','PLZ','Ort','Typ','Baujahr','Wohnfläche','Verkehrswert'],...scopedProperties(a.user).map(p=>[p.ehvId,p.address,p.postalCode,p.city,p.type,p.year,p.area,p.value])];const csv='\ufeff'+rows.map(r=>r.map(v=>`"${String(v).replaceAll('"','""')}"`).join(';')).join('\r\n');res.writeHead(200,{...headers,'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="ehv-objekte.csv"'});return res.end(csv);}
  send(res,404,{error:'Nicht gefunden'});
}catch(e){console.error(e);send(res,e.message==='payload_too_large'?413:500,{error:'Interner Fehler'});}});

function serve(res,file,type){const full=path.resolve(file),root=path.resolve('public');if(!full.startsWith(root)||!fs.existsSync(full))return send(res,404,{error:'Nicht gefunden'});res.writeHead(200,{...headers,'Content-Type':type,'Cache-Control':'public, max-age=300'});fs.createReadStream(full).pipe(res);}
server.listen(port,()=>console.log(`EHV Pilot Admin läuft auf ${origin}`));
export {server,store};
