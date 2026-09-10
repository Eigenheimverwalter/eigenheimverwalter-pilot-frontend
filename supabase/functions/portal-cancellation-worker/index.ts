import {serviceClient} from '../_shared/runtime.ts';
import {syncCancellationBilling} from '../_shared/partner-cancellation-route.ts';
Deno.serve(async req=>{
  const db=serviceClient(),token=req.headers.get('Authorization')?.replace(/^Bearer /,'');
  if(req.method!=='POST'||!token||token.length>200)return new Response('Forbidden',{status:403});
  const {data:allowed,error}=await db.rpc('verify_cancellation_job_token',{p_token:token});
  if(error||allowed!==true)return new Response('Forbidden',{status:403});
  const {data:rows,error:readError}=await db.from('partner_cancellations').select('*').in('billing_status',['PENDING','WAITING_NEXT_PERIOD']).order('billing_checked_at',{ascending:true,nullsFirst:true}).limit(20);
  if(readError)return new Response('Retry required',{status:503});
  let failures=0;for(const row of rows||[]){try{await syncCancellationBilling(db,row)}catch{failures++;await db.from('partner_cancellations').update({billing_checked_at:new Date().toISOString()}).eq('id',row.id);}}
  return Response.json({checked:rows?.length||0,failures},{status:failures?503:200});
});
