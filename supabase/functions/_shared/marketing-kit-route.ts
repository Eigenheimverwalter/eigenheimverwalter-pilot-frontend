import {marketingKitRequest} from './marketing-kit.mjs';
const bucket='ehv-marketing-kit';
const checked=async(promise:PromiseLike<any>,message:string)=>{const result=await promise;if(result.error)throw Object.assign(new Error(message),{status:503});return result.data;};
export async function readMarketingBody(req:Request){
  if(req.method==='GET')return{};
  const reader=req.body?.getReader();if(!reader)return{};
  const decoder=new TextDecoder();let length=0,text='';
  try{while(true){const {value,done}=await reader.read();if(done)break;length+=value.length;if(length>14*1024*1024){await reader.cancel();throw Object.assign(new Error('Datei ist zu groß.'),{status:413});}text+=decoder.decode(value,{stream:true});}text+=decoder.decode();return JSON.parse(text||'{}');}
  catch(error){if((error as any).status)throw error;throw Object.assign(new Error('Ungültiger Upload.'),{status:422});}
}
export async function marketingKitRoute(req:Request,path:string,service:any,profile:any,partner:any,supportView:boolean){
  const store={
    list:async(manage:boolean)=>{let query=service.from('marketing_kit_assets').select('*').is('storage_deleted_at',null);if(!manage)query=query.eq('status','published').is('deleted_at',null);return await checked(query.order('created_at',{ascending:false}),'Marketing-Kit konnte nicht geladen werden.');},
    get:async(id:string)=>await checked(service.from('marketing_kit_assets').select('*').eq('id',id).maybeSingle(),'Dokument konnte nicht geprüft werden.'),
    insert:async(row:any)=>await checked(service.from('marketing_kit_assets').insert(row),'Dateiinformationen konnten nicht gespeichert werden.'),
    update:async(id:string,version:number,patch:any)=>await checked(service.from('marketing_kit_assets').update(patch).eq('id',id).eq('version',version).select('*').maybeSingle(),'Änderung konnte nicht gespeichert werden.'),
  };
  const files={
    upload:async(path:string,bytes:Uint8Array,mime:string)=>await checked(service.storage.from(bucket).upload(path,bytes,{contentType:mime,upsert:false,cacheControl:'60'}),'Datei konnte nicht gespeichert werden.'),
    remove:async(path:string)=>await checked(service.storage.from(bucket).remove([path]),'Dateilöschung noch nicht abgeschlossen. Bitte erneut löschen.'),
    signedUrl:async(path:string,seconds:number,name:string)=>(await checked(service.storage.from(bucket).createSignedUrl(path,seconds),'Datei konnte nicht geöffnet werden.')).signedUrl,
  };
  return marketingKitRequest({method:req.method,path,body:await readMarketingBody(req),store,files,profile,partner,supportView});
}
