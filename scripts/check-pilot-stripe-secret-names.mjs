const token=process.env.SUPABASE_ACCESS_TOKEN;
if(!token)throw Error('Supabase management access missing');
const response=await fetch('https://api.supabase.com/v1/projects/rpniwtshbwjuesoeztyt/secrets',{headers:{Authorization:`Bearer ${token}`}});
if(!response.ok)throw Error('Secret-name check HTTP '+response.status);
const rows=await response.json();
console.log(JSON.stringify({project:'rpniwtshbwjuesoeztyt',stripeSecretNames:rows.map(r=>r.name).filter(name=>name.includes('STRIPE')),valuesPrinted:false}));
