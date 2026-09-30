const hex=(bytes:ArrayBuffer)=>Array.from(new Uint8Array(bytes),x=>x.toString(16).padStart(2,"0")).join("");

export async function sendServiceRecordToCore(mutation:Record<string,unknown>){
  const base=(Deno.env.get("EHV_CORE_API_URL")||"").replace(/\/$/,"");
  const secret=(Deno.env.get("EHV_CORE_SIGNING_SECRET")||"").trim();
  if(!base||secret.length<48)return{status:"pending",configured:false};
  const source=(mutation.payload&&typeof mutation.payload==="object"?mutation.payload:{}) as Record<string,unknown>;
  const payload={
    idempotencyKey:String(mutation.id),requestId:String(mutation.requestId),orderId:String(mutation.orderId||mutation.requestId),
    partnerId:String(mutation.partnerId),propertyId:Number(mutation.propertyId),equipmentId:Number(mutation.equipmentId),
    serviceRecord:{measureTypeKey:String(source.measureTypeKey||source.type||"other"),serviceDate:String(source.serviceDate||source.date||""),carriedOutByKey:String(source.carriedOutByKey||"ehv_partner"),documented:Boolean(source.documented),comment:String(source.comment||source.notes||"").slice(0,2000),recommendedNextAppointment:source.recommendedNextAppointment||null}
  };
  const raw=JSON.stringify(payload),timestamp=Math.floor(Date.now()/1000).toString();
  const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const signature=hex(await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(`${timestamp}.${raw}`)));
  const response=await fetch(`${base}/api/integrations/partner-os/service-records`,{method:"POST",headers:{"Content-Type":"application/json","X-EHV-Timestamp":timestamp,"X-EHV-Signature":signature},body:raw});
  const result=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(`EHV Core antwortet mit ${response.status}`);
  return{status:"completed",configured:true,response:result};
}
