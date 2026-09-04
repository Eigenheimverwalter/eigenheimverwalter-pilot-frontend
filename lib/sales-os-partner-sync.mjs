const tradeMap=new Map([
  ['dach','roof'],['fassade','facade'],['fenster','windows'],['heizung','heating'],['elektrik','electrical'],['sanitär','sanitary'],['sanitaer','sanitary'],
  ['abwasserrohre','wastewater_pipes'],['kamin/schornstein','fireplace'],['kamin','fireplace'],['lüftung/klimaanlage','ventilation'],['lueftung/klimaanlage','ventilation'],
  ['entlüftungsanlage','ventilation'],['photovoltaik','solar'],['pv','solar'],['batteriespeicher','solar_storage'],['solarspeicher','solar_storage'],['solarthermie','solar_thermal'],
  ['rauchmelder','smoke_detector'],['hebeanlage/pumpstation','wastewater_lifting'],['abwasserhebeanlage','wastewater_lifting'],['fahrstuhl','elevator'],['küche','kitchen'],
  ['waermepumpe','heat_pump'],['wärmepumpe','heat_pump'],['enthärtungsanlage','softening'],['white label on-site partner','whitelabel'],['whitelabelpartner','whitelabel'],
  ['makler','broker'],['immobilienmakler','broker']
]);

const fold=value=>String(value||'').normalize('NFKC').trim().toLocaleLowerCase('de-DE');
const date=value=>value&&/^\d{4}-\d{2}-\d{2}/.test(String(value))?String(value).slice(0,10):null;
const postal=value=>/^\d{5}$/.test(String(value||'').trim())?String(value).trim():null;

export function salesTradeToPilot(value,category){
  if(fold(category)==='makler')return'broker';
  return tradeMap.get(fold(value))||null;
}

export function normalizeSalesPartner(row){
  const tradeId=salesTradeToPilot(row.specialization||row.trade||row.scope,row.category);
  if(!row.id||!row.businessName&&!row.business_name)throw Error('source_partner_id_or_company_missing');
  if(!tradeId)throw Error(`unsupported_trade:${row.specialization||row.trade||row.scope||''}`);
  const licenses=(row.licenses||row.licenseAssignments||[]).map(item=>({postalCode:postal(item.postalCode||item.postal_code),kind:item.kind==='additional'||item.isAdditional?'additional':'included',bookedAt:date(item.bookedAt||item.assignedAt||item.assigned_at),startsAt:date(item.startsAt||item.starts_at||item.assignedAt||item.assigned_at),endsAt:date(item.endsAt||item.ends_at),active:item.active!==false&&!item.releasedAt&&!item.released_at})).filter(item=>item.postalCode);
  const postalCodes=[...new Set(licenses.filter(item=>item.active).map(item=>item.postalCode))];
  return {
    sourceSystem:'sales_os',sourcePartnerId:String(row.id),sourceLeadId:row.sourceLeadId||row.source_lead_id||null,
    company:String(row.businessName||row.business_name).trim(),contact:String(row.contactName||row.contact_name||'').trim(),email:String(row.email||'').trim().toLowerCase(),phone:String(row.phone||'').trim(),
    address:String(row.street||row.address||'').trim(),postalCode:postal(row.postalCode||row.postal_code)||'',city:String(row.city||'').trim(),partnerType:row.partnerType||row.partner_type||null,
    tradeId,postalCodes,contract:{startsAt:date(row.contractStartsAt||row.contract_starts_at),endsAt:date(row.contractEndsAt||row.contract_ends_at),status:row.contractStatus||row.contract_status||'active',includedPostalCodeLimit:Number(row.includedPostalCodeLimit||row.included_postal_code_limit||2),lastAdditionalBookingAt:date(row.lastAdditionalBookingAt||row.last_additional_booking_at)},licenses
  };
}

export function syncSalesPartners(data,rows,{now=new Date().toISOString(),id=prefix=>`${prefix}-${Date.now()}`}={}){
  data.partners||=[];data.partnerOrganizations||=[];data.audit||=[];const result={created:0,updated:0,skipped:0,errors:[]};
  for(const raw of rows||[]){
    try{
      const item=normalizeSalesPartner(raw);
      let partner=data.partners.find(p=>p.sourceRefs?.salesOsPartnerId===item.sourcePartnerId)||data.partners.find(p=>item.email&&p.email?.toLowerCase()===item.email&&p.primaryTradeId===item.tradeId);
      let organization=data.partnerOrganizations.find(o=>o.sourceRefs?.salesOsPartnerId===item.sourcePartnerId)||data.partnerOrganizations.find(o=>fold(o.name)===fold(item.company));
      if(!organization){organization={id:id('org'),name:item.company,type:'specialist',address:item.address,postalCode:item.postalCode,city:item.city,sourceRefs:{salesOsPartnerId:item.sourcePartnerId}};data.partnerOrganizations.push(organization)}
      else Object.assign(organization,{address:item.address||organization.address,postalCode:item.postalCode||organization.postalCode,city:item.city||organization.city,sourceRefs:{...(organization.sourceRefs||{}),salesOsPartnerId:item.sourcePartnerId}});
      const included=item.licenses.filter(x=>x.active&&x.kind==='included').map(x=>x.postalCode).slice(0,item.contract.includedPostalCodeLimit),additional=item.licenses.filter(x=>x.active&&x.kind==='additional');
      const license={includedPostalCodeLimit:item.contract.includedPostalCodeLimit,includedPostalCodes:included.length?included:item.postalCodes.slice(0,item.contract.includedPostalCodeLimit),cooperationStart:item.contract.startsAt,contractEnd:item.contract.endsAt,lastPostalReservationAt:item.contract.lastAdditionalBookingAt,postalReservations:additional.map(x=>({postalCode:x.postalCode,reservedAt:x.bookedAt||x.startsAt,extensionMonths:null,contractEndAfterReservation:x.endsAt||item.contract.endsAt,status:'active',source:'sales_os'}))};
      const values={organizationId:organization.id,company:item.company,contact:item.contact,email:item.email,phone:item.phone,status:item.contract.status==='active'?'active':'paused',lifecycle:item.contract.status,tradeIds:[item.tradeId],primaryTradeId:item.tradeId,postalCodes:item.postalCodes,license,postalLicenses:item.licenses,sourceRefs:{salesOsPartnerId:item.sourcePartnerId,salesOsLeadId:item.sourceLeadId},syncedAt:now};
      if(partner){Object.assign(partner,values);result.updated++}else{partner={id:id('p'),...values,onboarding:100,lastContact:now.slice(0,10),referralCode:`SALES-${item.sourcePartnerId.slice(0,12).toUpperCase()}`};data.partners.push(partner);result.created++}
      data.audit.unshift({id:id('log'),at:now,userId:'system',action:'partner.sales_os.synced',entity:'partner',entityId:partner.id,ip:'integration',details:{sourcePartnerId:item.sourcePartnerId,tradeId:item.tradeId,postalCodes:item.postalCodes,created:partner.createdAt===now}});
    }catch(error){result.skipped++;result.errors.push({sourcePartnerId:raw?.id||null,error:error.message})}
  }
  return result;
}
