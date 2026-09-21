const base=process.env.SUPABASE_URL||'https://rpniwtshbwjuesoeztyt.supabase.co',serviceKey=process.env.SUPABASE_SERVICE_ROLE_KEY,publishableKey=process.env.SUPABASE_PUBLISHABLE_KEY,company=String(process.env.PARTNER_COMPANY||'').trim(),siteUrl=process.env.PILOT_PUBLIC_URL||'https://eigenheimverwalter.github.io/eigenheimverwalter-pilot-frontend',adminEmail='info@eigenheimverwalter.de';
if(!serviceKey||!publishableKey||!company)throw Error('SUPABASE_SERVICE_ROLE_KEY, SUPABASE_PUBLISHABLE_KEY und PARTNER_COMPANY sind erforderlich.');
const adminHeaders={apikey:serviceKey,Authorization:`Bearer ${serviceKey}`,'Content-Type':'application/json'};
async function call(path,{method='GET',headers={},body}={}){const response=await fetch(`${base}${path}`,{method,headers:{...headers,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)}),data=await response.json().catch(()=>({}));if(!response.ok)throw Error(data.error_description||data.error||data.message||`HTTP ${response.status}`);return data}

const generated=await call('/auth/v1/admin/generate_link',{method:'POST',headers:adminHeaders,body:{type:'magiclink',email:adminEmail,options:{redirectTo:siteUrl}}}),tokenHash=generated.properties?.hashed_token||generated.hashed_token;
if(!tokenHash)throw Error('Für den bestehenden Admin-Plus-Account konnte keine kurzlebige Sitzung erzeugt werden.');
const session=await call('/auth/v1/verify',{method:'POST',headers:{apikey:publishableKey},body:{type:'magiclink',token_hash:tokenHash}}),userHeaders={apikey:publishableKey,Authorization:`Bearer ${session.access_token}`};
const listing=await call('/functions/v1/portal-api/partners',{headers:userHeaders}),matches=listing.partners.filter(item=>String(item.company||'').trim().toLocaleLowerCase('de-DE')===company.toLocaleLowerCase('de-DE'));
if(matches.length!==1)throw Error(`Erwartet wurde genau ein Partner mit dem Firmennamen „${company}“, gefunden: ${matches.length}.`);
const result=await call(`/functions/v1/portal-api/partners/${encodeURIComponent(matches[0].id)}/registration-invitation/resend`,{method:'POST',headers:userHeaders,body:{siteUrl}});
if(result.delivery?.status!=='sent')throw Error('Das Mail-Gateway hat den Versand nicht als gesendet bestätigt.');
console.log(JSON.stringify({company,partnerId:matches[0].id,status:result.delivery.status,expiresAt:result.invitation.expiresAt}));
