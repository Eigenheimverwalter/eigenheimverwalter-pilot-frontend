export async function sendPortalMail(channel:"partner"|"registration"|"info",recipientEmail:string,subject:string,message:string){
  const token=Deno.env.get("PILOT_MAIL_GATEWAY_TOKEN")||"";if(token.length<48)throw Object.assign(new Error("Mailgateway nicht konfiguriert"),{status:503});
  const response=await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/portal-mail`,{method:"POST",headers:{"Content-Type":"application/json","x-pilot-mail-token":token},body:JSON.stringify({action:"pilot_send_email",channel,recipientEmail,subject,message})});
  const result=await response.json().catch(()=>({}));if(!response.ok)throw Object.assign(new Error(String(result.error||"Mailversand fehlgeschlagen")),{status:502});return result;
}
