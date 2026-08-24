export const EQUIPMENT_TYPES = Object.freeze([
  {id:'EQUIP_DACH',name:'Dach',tier:'standard',phase4:['roof','roof_data']},
  {id:'EQUIP_FASSADE',name:'Fassade',tier:'standard',phase4:['facade','facade_data']},
  {id:'EQUIP_FENSTER',name:'Fenster',tier:'standard',phase4:['windows','windows_data']},
  {id:'EQUIP_HEIZUNG',name:'Heizung',tier:'standard',phase4:['heating','heating_data','heat_pump','heat_pump_data']},
  {id:'EQUIP_ELEKTRIK',name:'Elektrik',tier:'standard',phase4:['electrical','electrical1_data']},
  {id:'EQUIP_SANITAER',name:'Sanitär',tier:'standard',phase4:['sanitary','sanitary_data','softening','softening_data']},
  {id:'EQUIP_ABWASSER',name:'Abwasserrohre',tier:'premium',phase4:['wastewater_pipes','wastewater_pipe_data']},
  {id:'EQUIP_KAMIN',name:'Kamin / Schornstein',tier:'premium',phase4:['fireplace','fireplace_data']},
  {id:'EQUIP_LUEFTUNG',name:'Lüftung / Klimaanlage',tier:'premium',phase4:['ventilation','ventilation_data','air_conditioning','aircondition_data']},
  {id:'EQUIP_PV',name:'Photovoltaik',tier:'premium',phase4:['solar','photvoltaik_data']},
  {id:'EQUIP_BATTERIE',name:'Batteriespeicher',tier:'premium',phase4:['solar_storage','solar_storage_tank_data']},
  {id:'EQUIP_SOLARTHERMIE',name:'Solarthermie',tier:'premium',phase4:['solar_thermal','solar_thermal_data']},
  {id:'EQUIP_RAUCHMELDER',name:'Rauchmelder',tier:'premium',phase4:['smoke_detector','smoke_detector_data']},
  {id:'EQUIP_HEBEANLAGE',name:'Hebeanlage / Pumpstation',tier:'premium',phase4:['wastewater_lifting','wastewater_lifting_station_data']},
  {id:'EQUIP_FAHRSTUHL',name:'Fahrstuhl',tier:'premium',phase4:['elevator','lift_data']},
  {id:'EQUIP_KUECHE',name:'Küche',tier:'premium',phase4:['kitchen','kitchen_data']}
]);

export const PARTNER_CATEGORIES = Object.freeze([
  {id:'BROKER',name:'Immobilienmakler',kind:'broker'},
  {id:'WHITE_LABEL',name:'White Label',kind:'white_label'}
]);

export const LEGACY_EQUIPMENT_ALIASES = Object.freeze({
  roof:'EQUIP_DACH',facade:'EQUIP_FASSADE',windows:'EQUIP_FENSTER',heating:'EQUIP_HEIZUNG',heat_pump:'EQUIP_HEIZUNG',
  electrical:'EQUIP_ELEKTRIK',sanitary:'EQUIP_SANITAER',softening:'EQUIP_SANITAER',wastewater_pipes:'EQUIP_ABWASSER',
  fireplace:'EQUIP_KAMIN',ventilation:'EQUIP_LUEFTUNG',air_conditioning:'EQUIP_LUEFTUNG',EQUIP_LUEFTUNG_KLIMA:'EQUIP_LUEFTUNG',solar:'EQUIP_PV',
  solar_storage:'EQUIP_BATTERIE',solar_thermal:'EQUIP_SOLARTHERMIE',smoke_detector:'EQUIP_RAUCHMELDER',
  wastewater_lifting:'EQUIP_HEBEANLAGE',elevator:'EQUIP_FAHRSTUHL',kitchen:'EQUIP_KUECHE',broker:'BROKER',whitelabel:'WHITE_LABEL'
});

export const canonicalPartnerType=id=>LEGACY_EQUIPMENT_ALIASES[id]||id;
export const isEquipmentType=id=>EQUIPMENT_TYPES.some(x=>x.id===id);
export const isPartnerCategory=id=>PARTNER_CATEGORIES.some(x=>x.id===id);

const equipmentPermissions=['customers.read','properties.read','equipment.read','equipment.write','service.read','service.write','documents.write','opportunities.read'];
const brokerPermissions=['customers.read','properties.read','sales.read','sales.write','valuations.read','valuations.write','documents.read','opportunities.read','exports.read'];
const whiteLabelPermissions=['customers.read','properties.read','service.read','service.write','documents.read','documents.write','opportunities.read'];

export function migrateEquipmentModel(data){
  data.equipmentRegistry=EQUIPMENT_TYPES.map(x=>({...x,phase4:[...x.phase4]}));
  data.partnerCategories=PARTNER_CATEGORIES.map(x=>({...x}));
  data.trades=[...EQUIPMENT_TYPES.map(x=>({id:x.id,name:x.name,tier:x.tier,onboarding:true,kind:'equipment'})),...PARTNER_CATEGORIES.map(x=>({id:x.id,name:x.name,tier:'special',onboarding:true,kind:x.kind}))];
  for(const partner of data.partners||[]){
    const previous=partner.primaryTradeId||partner.tradeIds?.[0];
    if(previous==='energy'){
      partner.status='archived';partner.lifecycle='archived';partner.migrationIssue='Legacy-Energieberatung besitzt in V2 keine operative Partnerkategorie';partner.tradeIds=[];partner.primaryTradeId=null;continue;
    }
    const canonical=canonicalPartnerType(previous);
    partner.primaryTradeId=canonical;partner.tradeIds=canonical?[canonical]:[];partner.partnerCategory=isEquipmentType(canonical)?'equipment':canonical==='BROKER'?'broker':canonical==='WHITE_LABEL'?'white_label':null;partner.equipmentTypeId=isEquipmentType(canonical)?canonical:null;partner.lifecycle=partner.lifecycle||partner.status||'configuration_incomplete';
  }
  for(const assignment of data.assignments||[])assignment.tradeId=canonicalPartnerType(assignment.tradeId);
  for(const equipment of data.equipmentRecords||[])equipment.tradeId=canonicalPartnerType(equipment.tradeId);
  for(const campaign of data.campaigns||[])campaign.tradeIds=(campaign.tradeIds||[]).map(canonicalPartnerType).filter(id=>isEquipmentType(id)||isPartnerCategory(id));
  for(const definition of data.triggerDefinitions||[]){definition.relevantEquipmentTypes=(definition.relevantEquipmentTypes||[]).map(canonicalPartnerType);definition.relevantTrades=(definition.relevantTrades||[]).map(canonicalPartnerType);definition.partnerActionType=canonicalPartnerType(definition.partnerActionType);}
  data.partnerRoleTemplates=[...EQUIPMENT_TYPES.map(x=>({id:`prt-${x.id.toLowerCase()}`,title:`Standardrolle ${x.name}`,status:'active',category:'equipment',equipmentTypeId:x.id,tradeId:x.id,permissions:[...equipmentPermissions],systemDefault:true})),{id:'prt-broker',title:'Standardrolle Immobilienmakler',status:'active',category:'broker',tradeId:'BROKER',permissions:[...brokerPermissions],systemDefault:true},{id:'prt-white-label',title:'Standardrolle White Label',status:'active',category:'white_label',tradeId:'WHITE_LABEL',permissions:[...whiteLabelPermissions],systemDefault:true}];
  for(const partner of data.partners||[])partner.roleTemplateId=data.partnerRoleTemplates.find(r=>r.tradeId===partner.primaryTradeId)?.id||null;
  data.meta.equipmentModelVersion=2;
  return data;
}
