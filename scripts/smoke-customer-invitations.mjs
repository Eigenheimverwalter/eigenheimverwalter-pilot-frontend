// Read-only live verification. Never creates a user, invitation or mail.
const project=process.env.SUPABASE_PROJECT_REF||'rpniwtshbwjuesoeztyt';
if(project!=='rpniwtshbwjuesoeztyt')throw Error('Pilot project required');
const key=process.env.SUPABASE_SERVICE_ROLE_KEY;if(!key)throw Error('Service key required');
const response=await fetch(`https://${project}.supabase.co/rest/v1/rpc/customer_email_known`,{
  method:'POST',headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'},
  body:JSON.stringify({p_email:`no-send-${crypto.randomUUID()}@example.invalid`,p_skip_invitation_id:null}),
});
if(!response.ok||await response.json()!==false)throw Error('Read-only customer directory RPC failed');
console.log(JSON.stringify({customerInvitationDirectory:'ok',productionWrites:false,emailsSent:0}));
