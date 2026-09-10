import {serviceClient} from '../_shared/runtime.ts';
import {verifyStripeSignature} from '../_shared/partner-stripe.mjs';
import {applyPartnerStripeEvent} from '../_shared/partner-checkout-route.ts';
import {loadSigningSecret} from '../_shared/partner-stripe-configuration.mjs';
Deno.serve(async req=>{
  if(req.method==='GET'&&new URL(req.url).pathname.endsWith('/health'))return Response.json({service:'pilot-stripe',mode:'test'});
  if(req.method!=='POST')return new Response(null,{status:405});
  try{
    const reader=req.body?.getReader();let size=0;const chunks:Uint8Array[]=[];
    if(reader)try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>262144){await reader.cancel();return new Response(null,{status:413});}chunks.push(value);}}finally{reader.releaseLock();}
    const bytes=new Uint8Array(size);let at=0;for(const c of chunks){bytes.set(c,at);at+=c.length;}
    const raw=new TextDecoder().decode(bytes);
    const db=serviceClient();
    await verifyStripeSignature(raw,req.headers.get('stripe-signature'),await loadSigningSecret(db,Deno.env.get('PILOT_STRIPE_SECRET_KEY'),Deno.env.get('PILOT_STRIPE_WEBHOOK_SECRET')));
    const event=JSON.parse(raw);
    if(typeof event.id!=='string'||!event.id.startsWith('evt_'))return new Response(null,{status:400});
    const result=await applyPartnerStripeEvent(db,event);
    return Response.json(result);
  }catch(error){
    // Returning non-2xx makes Stripe retry; no success on partial activation.
    const status=Number((error as any).status||503);
    return Response.json({error:'Stripe event not applied',code:(error as any).code||'RETRY_REQUIRED'},{status});
  }
});
