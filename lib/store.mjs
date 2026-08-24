import fs from 'node:fs';
import path from 'node:path';
import { hashPassword } from './security.mjs';
import { migrateEquipmentModel } from './equipment-registry.mjs';

export const SEED_VERSION=2;
export function seed(){
  const now=new Date().toISOString();
  const customerRows=[
    ['Petersen','Nina Petersen','22043','Wandsbeker Zollstraße 12','Einfamilienhaus',1998,142,612000],
    ['Schneider','Anna Schneider','22301','Dorotheenstraße 48','Reihenhaus',2012,118,749000],
    ['Weber','Markus Weber','22111','Möllner Landstraße 91','Doppelhaushälfte',1976,126,524000],
    ['Albrecht','Julia Albrecht','22085','Schürbeker Straße 27','Stadthaus',1908,164,1095000],
    ['Yilmaz','Emre Yilmaz','22529','Lokstedter Steindamm 84','Einfamilienhaus',2004,151,895000],
    ['Hansen','Liv Hansen','22880','Wedeler Landstraße 31','Bungalow',1986,109,538000],
    ['Kowalski','Marek Kowalski','21075','Eißendorfer Pferdeweg 52','Reihenendhaus',1994,121,489000],
    ['Neumann','Carolin Neumann','22457','Frohmestraße 116','Doppelhaushälfte',2018,139,829000],
    ['Martens','Tobias Martens','21509','Reinbeker Weg 18','Einfamilienhaus',1969,132,455000],
    ['Becker','Svenja Becker','25421','Rübekamp 7','Einfamilienhaus',2009,146,649000],
    ['Sommer','David Sommer','21465','Sachsenwaldstraße 44','Villa',1927,218,1280000],
    ['Nguyen','Linh Nguyen','22549','Luruper Hauptstraße 203','Reihenhaus',2015,114,592000]
  ];
  const customers=customerRows.map((r,i)=>({id:`c-${2001+i}`,name:r[1],email:`${r[0].toLowerCase()}@example.test`,phone:`+49 40 555 ${String(1100+i).padStart(4,'0')}`,propertyIds:[`o-${3001+i}`],consent:i!==8,consentAt:i!==8?'2026-06-03T10:00:00Z':null,dataClass:'fictional'}));
  const properties=customerRows.map((r,i)=>({id:`o-${3001+i}`,ehvId:`EHV-2026-${String(1842+i*37).padStart(6,'0')}`,customerId:`c-${2001+i}`,address:r[3],postalCode:r[2],city:i===5?'Wedel':i===8?'Glinde':i===9?'Pinneberg':i===10?'Reinbek':'Hamburg',type:r[4],year:r[5],area:r[6],value:r[7],phase4Ref:`pilot:property:${1842+i*37}`,energyClass:['C','B','E','D','B','C','F','A+','G','B','D','A'][i],dataClass:'fictional'}));
  return {
    meta:{version:SEED_VERSION,createdAt:now,dataClassification:'SYNTHETIC_ONLY',replacementKey:'ehvId'},
    users:[
      {id:'u-admin',name:'Sophie Keller',email:'admin@ehv.test',role:'super_admin',phone:'+49 40 555 0100',address:'Jenfelder Straße 244',postalCode:'22043',city:'Hamburg',passwordHash:hashPassword('ChangeMe123!'),active:true},
      {id:'u-support',name:'Mia Hoffmann',email:'support@ehv.test',role:'admin_light',phone:'+49 40 555 0101',address:'Jenfelder Straße 244',postalCode:'22043',city:'Hamburg',passwordHash:hashPassword('ChangeMe123!'),active:true},
      {id:'u-craft',name:'Daniel Müller',email:'partner@ehv.test',role:'crafts_partner',phone:'+49 40 555 0201',address:'Wandsbeker Marktstraße 18',postalCode:'22041',city:'Hamburg',passwordHash:hashPassword('ChangeMe123!'),active:true},
      {id:'u-broker',name:'Lea Wagner',email:'makler@ehv.test',role:'broker_partner',phone:'+49 40 555 0202',address:'Dorotheenstraße 12',postalCode:'22301',city:'Hamburg',passwordHash:hashPassword('ChangeMe123!'),active:true}
    ],
    trades:[
      ['heating','Heizung','standard'],['roof','Dach','standard'],['facade','Fassade','standard'],['windows','Fenster','standard'],['electrical','Elektrik','standard'],['sanitary','Sanitär','standard'],
      ['ventilation','Entlüftungsanlage','premium'],['wastewater_pipes','Abwasserrohre','premium'],['air_conditioning','Klimaanlage','premium'],['kitchen','Küche','premium'],['solar','Photovoltaik','premium'],
      ['solar_storage','Solarspeicher','premium'],['solar_thermal','Solarthermie','premium'],['smoke_detector','Rauchmelder','premium'],['elevator','Fahrstuhl','premium'],['fireplace','Kamin','premium'],
      ['heat_pump','Wärmepumpe','premium'],['softening','Enthärtungsanlage','premium'],['wastewater_lifting','Abwasserhebeanlage','premium'],['broker','Immobilienmakler','special'],['whitelabel','Whitelabelpartner','special'],
      ['energy','Energieberatung','legacy']
    ].map(([id,name,tier])=>({id,name,tier,onboarding:tier!=='legacy'})),
    partnerOrganizations:[
      {id:'org-1',name:'Müller Gebäudetechnik',type:'multi_trade',address:'Wandsbeker Marktstraße 18',postalCode:'22041',city:'Hamburg'},
      {id:'org-2',name:'Wagner Immobilien',type:'specialist',address:'Dorotheenstraße 12',postalCode:'22301',city:'Hamburg'},
      {id:'org-3',name:'NordDach GmbH',type:'specialist',address:'Billstraße 80',postalCode:'20539',city:'Hamburg'}
    ],
    partners:[
      {id:'p-1001',organizationId:'org-1',userId:'u-craft',company:'Müller Gebäudetechnik',contact:'Daniel Müller',email:'partner@ehv.test',status:'active',tradeIds:['heating'],primaryTradeId:'heating',postalCodes:['22043','22045','22111'],onboarding:100,lastContact:'2026-08-18',referralCode:'MUELLER-HEIZUNG'},
      {id:'p-1008',organizationId:'org-1',company:'Müller Gebäudetechnik · Elektro',contact:'Elektro-Team',email:'elektro.demo@ehv.test',status:'invited',tradeIds:['electrical'],primaryTradeId:'electrical',postalCodes:['22043','22045'],onboarding:35,lastContact:'2026-08-18',referralCode:'MUELLER-ELEKTRO'},
      {id:'p-1002',organizationId:'org-2',userId:'u-broker',company:'Wagner Immobilien',contact:'Lea Wagner',email:'makler@ehv.test',status:'active',tradeIds:['broker'],primaryTradeId:'broker',postalCodes:['22301','22085','22529'],onboarding:100,lastContact:'2026-08-19',referralCode:'WAGNER-IMMOBILIEN'},
      {id:'p-1003',company:'NordDach GmbH',contact:'Jannis Paulsen',email:'kontakt@norddach.test',status:'active',tradeIds:['roof'],primaryTradeId:'roof',postalCodes:['22111','21075'],onboarding:88,lastContact:'2026-08-12'},
      {id:'p-1004',company:'Elbe Energieberatung',contact:'Sara König',email:'koenig@elbe-energie.test',status:'active',tradeIds:['energy'],primaryTradeId:'energy',postalCodes:['22529','22457','22549'],onboarding:100,lastContact:'2026-08-17'},
      {id:'p-1009',company:'Elbe Energieberatung · Photovoltaik',contact:'Sara König',email:'solar@elbe-energie.test',status:'active',tradeIds:['solar'],primaryTradeId:'solar',postalCodes:['22529','22457','22549'],onboarding:100,lastContact:'2026-08-17'},
      {id:'p-1005',company:'Hanse Fensterbau',contact:'Ole Brandt',email:'brandt@hansefenster.test',status:'invited',tradeIds:['windows'],primaryTradeId:'windows',postalCodes:['22880','25421'],onboarding:42,lastContact:'2026-08-14'},
      {id:'p-1006',company:'Fassadenwerk Nord',contact:'Aylin Demir',email:'demir@fassadenwerk.test',status:'active',tradeIds:['facade'],primaryTradeId:'facade',postalCodes:['21465','21509'],onboarding:76,lastContact:'2026-08-16'},
      {id:'p-1007',company:'Alster Immobilienkontor',contact:'Jonas Richter',email:'richter@alster-immo.test',status:'paused',tradeIds:['broker'],primaryTradeId:'broker',postalCodes:['22043','22085'],onboarding:100,lastContact:'2026-07-28'}
    ],customers,properties,
    assignments:[
      ['a-1','p-1001','o-3001','heating',false],['a-2','p-1002','o-3002','broker',false],['a-3','p-1003','o-3003','roof',false],['a-4','p-1004','o-3005','energy',false],['a-5','p-1005','o-3006','windows',false],['a-6','p-1006','o-3011','facade',false],['a-7','p-1002','o-3004','broker',false],['a-8','p-1001','o-3009','electrical',true]
    ].map(([id,partnerId,propertyId,tradeId,overrideRegion])=>({id,partnerId,propertyId,tradeId,status:'active',overrideRegion,accessStart:'2026-08-01',accessEnd:overrideRegion?'2026-10-31':null})),
    serviceCases:[
      ['s-4001','o-3001','Heizungswartung und hydraulischer Abgleich','Heizung','in_progress','high','p-1001'],
      ['s-4002','o-3003','Dachprüfung nach Starkregen','Dach','new','medium','p-1003'],
      ['s-4003','o-3005','PV-Potenzialanalyse','Photovoltaik','waiting','medium','p-1004'],
      ['s-4004','o-3006','Fenster im Wohnbereich prüfen','Fenster','new','low','p-1005'],
      ['s-4005','o-3009','Zählerschrank modernisieren','Elektro','in_progress','high','p-1001'],
      ['s-4006','o-3011','Fassadenrisse dokumentieren','Fassade','done','medium','p-1006']
    ].map(([id,propertyId,title,category,status,priority,partnerId],i)=>({id,propertyId,title,category,status,priority,partnerId,updatedAt:`2026-08-${String(19-i).padStart(2,'0')}T09:15:00Z`,documents:[]})),
    salesFiles:[
      {id:'v-5001',propertyId:'o-3002',partnerId:'p-1002',status:'review',completeness:78,askingPrice:779000,documents:6,portalStatus:'not_connected'},
      {id:'v-5002',propertyId:'o-3004',partnerId:'p-1002',status:'ready',completeness:96,askingPrice:1149000,documents:14,portalStatus:'ready'},
      {id:'v-5003',propertyId:'o-3001',partnerId:null,status:'draft',completeness:44,askingPrice:629000,documents:3,portalStatus:'not_released'}
    ],
    valuations:[
      {id:'w-1',propertyId:'o-3002',source:'EHV Phase 4',value:749000,effectiveDate:'2026-07-01',createdBy:'system',note:'Referenzwert; nicht lokal berechnet.'},
      {id:'w-2',propertyId:'o-3002',source:'Makler',value:768000,effectiveDate:'2026-08-15',createdBy:'u-broker',note:'Marktanpassung nach Objektbegehung.'},
      {id:'w-3',propertyId:'o-3004',source:'EHV Phase 4',value:1095000,effectiveDate:'2026-06-30',createdBy:'system',note:'Referenzwert; nicht lokal berechnet.'},
      {id:'w-4',propertyId:'o-3004',source:'Makler',value:1130000,effectiveDate:'2026-08-10',createdBy:'u-broker',note:'Sehr gute Mikrolage und modernisierte Haustechnik.'}
    ],
    roleProfiles:[
      {id:'rp-super',role:'super_admin',label:'Admin Plus',plans:['standard','premium'],tradeIds:['*'],permissions:['*']},
      {id:'rp-support',role:'admin_light',label:'Admin Light / Support',plans:['standard','premium'],tradeIds:['*'],permissions:['dashboard.read','customers.read','properties.read','service.read','opportunities.read','audit.read']},
      {id:'rp-craft',role:'crafts_partner',label:'Fachpartner',plans:['standard','premium'],tradeIds:['*'],permissions:['dashboard.read','customers.read','properties.read','service.read','service.write','opportunities.read']},
      {id:'rp-broker',role:'broker_partner',label:'Maklerpartner',plans:['standard'],tradeIds:['broker'],permissions:['dashboard.read','customers.read','properties.read','sales.read','valuations.write','opportunities.read']}
    ],
    partnerRoleTemplates:[
      {id:'prt-heating',title:'Fachpartner Heizung',status:'active',tradeId:'heating',permissions:['customers.read','properties.read','equipment.read','equipment.write','service.read','service.write','documents.write','opportunities.read']},
      {id:'prt-roof',title:'Fachpartner Dach',status:'active',tradeId:'roof',permissions:['customers.read','properties.read','equipment.read','equipment.write','service.read','service.write','documents.write','opportunities.read']},
      {id:'prt-broker',title:'Immobilienmakler',status:'active',tradeId:'broker',permissions:['customers.read','properties.read','sales.read','sales.write','valuations.write','documents.write']}
    ],
    equipmentRecords:properties.slice(0,8).map((p,i)=>({id:`eq-${6001+i}`,propertyId:p.id,tradeId:['heating','roof','windows','electrical','solar','windows','facade','heating'][i],label:['Gas-Brennwertheizung','Steildach','Fensteranlage','Elektroinstallation','Photovoltaikanlage','Fensteranlage','Fassade','Wärmepumpe'][i],manufacturer:['Viessmann',null,'Schüco','Hager','SMA','Internorm',null,'Vaillant'][i],model:['Vitodens 200-W',null,'Living 82','univers N','Sunny Tripower','KF 410',null,'aroTHERM plus'][i],serialNumber:i%2===0?`SN-${202600+i}`:null,year:[2004,1998,2012,1994,2019,1986,1969,2018][i],lastModernization:i%3===0?'2020-06-12':null,lastMaintenance:['2024-04-18','2023-08-20','2025-02-11','2022-10-03','2025-06-20',null,'2021-05-14','2026-03-10'][i],verification:{status:i<2?'verified':i<5?'partial':'unverified',verifiedAt:i<2?'2026-08-10T10:00:00Z':null,verifiedBy:i<2?'u-craft':null,source:i<2?'licensed_partner':'customer',fieldCount:i<2?8:3,requiredCount:8},documents:[],serviceRecordIds:[]})),
    partnerServiceRecords:[],notifications:[],analyticsEvents:[],analyticsStartedAt:now,
    campaigns:[
      {id:'camp-weather-1',title:'Dachprüfung nach Unwetter',type:'weather',status:'draft',source:{title:'Unwetterwarnung Brandenburg',url:'',authority:'Wetter-API noch nicht verbunden',publishedAt:'2026-08-20',verified:false},regions:['Brandenburg'],tradeIds:['roof'],criteria:{healthMax:70,maintenanceOlderMonths:24,requiresEquipment:true},analysis:{summary:'Sturm- und Hagelereignisse können Dachdeckung, Anschlüsse und Entwässerung beeinträchtigen.',recommendation:'Priorisierte Sichtprüfung anbieten.',confidence:'provisional'},approvals:{technical:false,legal:false,customerCommunication:false},audience:{properties:0,customers:0,partners:0,dataQuality:0},metrics:{partnerNotified:0,partnerAccepted:0,customerNotified:0,requests:0,cases:0,offers:0,acceptedOffers:0,completed:0},createdAt:'2026-08-20T10:00:00Z',createdBy:'u-admin'},
      {id:'camp-regulation-1',title:'Gebäudeenergie-Handlungscheck',type:'regulation',status:'source_review',source:{title:'Offizielle Quelle erforderlich',url:'',authority:'Noch nicht bestätigt',publishedAt:null,verified:false},regions:['Deutschland'],tradeIds:['heating','energy'],criteria:{healthMax:65,requiresEquipment:true},analysis:{summary:'Entwurf für eine fachlich und rechtlich zu prüfende Informationskampagne.',recommendation:'Keine Aussendung vor Quellen- und Rechtsprüfung.',confidence:'blocked'},approvals:{technical:false,legal:false,customerCommunication:false},audience:{properties:0,customers:0,partners:0,dataQuality:0},metrics:{partnerNotified:0,partnerAccepted:0,customerNotified:0,requests:0,cases:0,offers:0,acceptedOffers:0,completed:0},createdAt:'2026-08-20T10:30:00Z',createdBy:'u-admin'}
    ],campaignEvents:[],
    partnerCases:[
      {id:'pc-1',partnerId:'p-1001',kind:'service',createdAt:'2026-08-01T08:00:00Z',firstViewedAt:'2026-08-01T09:12:00Z',acceptedAt:'2026-08-01T10:00:00Z',offerUploadedAt:'2026-08-02T11:00:00Z',offerAcceptedAt:'2026-08-03T09:00:00Z',completedAt:'2026-08-07T14:00:00Z',invoiceUploadedAt:'2026-08-08T10:00:00Z',documentationComplete:true},
      {id:'pc-2',partnerId:'p-1001',kind:'service',createdAt:'2026-08-05T07:30:00Z',firstViewedAt:'2026-08-05T13:40:00Z',acceptedAt:'2026-08-06T08:00:00Z',offerUploadedAt:null,offerAcceptedAt:null,completedAt:'2026-08-12T16:00:00Z',invoiceUploadedAt:'2026-08-16T10:00:00Z',documentationComplete:true},
      {id:'pc-3',partnerId:'p-1002',kind:'sales_mandate',createdAt:'2026-07-10T10:00:00Z',firstViewedAt:'2026-07-10T10:35:00Z',acceptedAt:'2026-07-10T13:00:00Z',mandateReceivedAt:'2026-07-14T09:00:00Z',completedAt:null,documentationComplete:true},
      {id:'pc-4',partnerId:'p-1002',kind:'sales_mandate',createdAt:'2026-07-20T11:00:00Z',firstViewedAt:'2026-07-20T12:20:00Z',acceptedAt:'2026-07-21T08:00:00Z',mandateReceivedAt:null,completedAt:null,documentationComplete:true},
      {id:'pc-5',partnerId:'p-1003',kind:'service',createdAt:'2026-08-02T08:00:00Z',firstViewedAt:'2026-08-04T12:00:00Z',acceptedAt:'2026-08-05T09:00:00Z',offerUploadedAt:'2026-08-08T10:00:00Z',offerAcceptedAt:null,completedAt:null,invoiceUploadedAt:null,documentationComplete:false},
      {id:'pc-6',partnerId:'p-1003',kind:'service',createdAt:'2026-08-09T08:00:00Z',firstViewedAt:'2026-08-11T15:00:00Z',acceptedAt:null,offerUploadedAt:null,offerAcceptedAt:null,completedAt:null,invoiceUploadedAt:null,documentationComplete:false},
      {id:'pc-7',partnerId:'p-1003',kind:'service',createdAt:'2026-08-13T08:00:00Z',firstViewedAt:'2026-08-15T10:00:00Z',acceptedAt:'2026-08-17T09:00:00Z',offerUploadedAt:null,offerAcceptedAt:null,completedAt:null,invoiceUploadedAt:null,documentationComplete:false}
    ],
    postalDirectory:[
      ['22041','Hamburg','Hamburg'],['22043','Hamburg','Hamburg'],['22045','Hamburg','Hamburg'],['22085','Hamburg','Hamburg'],['22111','Hamburg','Hamburg'],['22301','Hamburg','Hamburg'],['22457','Hamburg','Hamburg'],['22529','Hamburg','Hamburg'],['22549','Hamburg','Hamburg'],['20539','Hamburg','Hamburg'],['21075','Hamburg','Hamburg'],['22880','Wedel','Schleswig-Holstein'],['25421','Pinneberg','Schleswig-Holstein'],['21465','Reinbek','Schleswig-Holstein'],['21509','Glinde','Schleswig-Holstein'],['10115','Berlin','Berlin'],['14467','Potsdam','Brandenburg'],['19053','Schwerin','Mecklenburg-Vorpommern'],['30159','Hannover','Niedersachsen'],['28195','Bremen','Bremen'],['40213','Düsseldorf','Nordrhein-Westfalen'],['60311','Frankfurt am Main','Hessen'],['55116','Mainz','Rheinland-Pfalz'],['70173','Stuttgart','Baden-Württemberg'],['80331','München','Bayern'],['66111','Saarbrücken','Saarland'],['01067','Dresden','Sachsen'],['39104','Magdeburg','Sachsen-Anhalt'],['99084','Erfurt','Thüringen'],['24103','Kiel','Schleswig-Holstein']
    ].map(([postalCode,city,state])=>({postalCode,city,state})),
    referralLeads:[],
    audit:[
      {id:'log-3',at:'2026-08-20T07:52:00Z',userId:'u-admin',action:'assignment.created',entity:'assignment',entityId:'a-8',ip:'local',details:{reason:'Einzelfreigabe außerhalb Lizenzgebiet'}},
      {id:'log-2',at:'2026-08-20T07:40:00Z',userId:'u-broker',action:'valuation.created',entity:'valuation',entityId:'w-4',ip:'local',details:{propertyId:'o-3004'}},
      {id:'log-1',at:now,userId:'system',action:'synthetic.seeded',entity:'system',entityId:'runtime',ip:'local',details:{version:SEED_VERSION,records:12}}
    ]
  };
}

export class Store{
  constructor(file){
    this.file=path.resolve(file);fs.mkdirSync(path.dirname(this.file),{recursive:true});
    const existing=fs.existsSync(this.file)?JSON.parse(fs.readFileSync(this.file,'utf8')):null;
    this.data=!existing||Number(existing.meta?.version||0)<SEED_VERSION?seed():existing;
    this.data.assignments||=[];this.data.resourceGrants||=[];this.data.audit||=[];this.data.serviceCases||=[];this.data.salesFiles||=[];this.data.valuations||=[];this.data.productionCustomerOverrides||={};this.data.productionCustomerDeletions||={};this.data.propertyAddressVerifications||={};const defaults=seed();if(!this.data.roleProfiles?.length)this.data.roleProfiles=defaults.roleProfiles;this.data.partnerRoleTemplates||=defaults.partnerRoleTemplates;for(const trade of defaults.trades)if(!this.data.trades.some(x=>x.id===trade.id))this.data.trades.push(trade);for(const trade of this.data.trades){const canonical=defaults.trades.find(x=>x.id===trade.id);if(canonical)Object.assign(trade,canonical)}if(!this.data.equipmentRecords?.length)this.data.equipmentRecords=defaults.equipmentRecords;this.data.partnerServiceRecords||=[];this.data.partnerOffers||=[];this.data.emailOutbox||=[];this.data.notifications||=[];if(!this.data.partnerCases?.length)this.data.partnerCases=defaults.partnerCases;this.data.analyticsEvents||=[];this.data.analyticsStartedAt||=new Date().toISOString();if(!this.data.campaigns?.length)this.data.campaigns=defaults.campaigns;this.data.campaignEvents||=[];if(!this.data.partnerOrganizations?.length)this.data.partnerOrganizations=defaults.partnerOrganizations;if(!this.data.postalDirectory?.length)this.data.postalDirectory=defaults.postalDirectory;this.data.referralLeads||=[];for(const u of this.data.users){const fallback=defaults.users.find(x=>x.id===u.id);for(const key of ['phone','address','postalCode','city'])if(u[key]===undefined)u[key]=fallback?.[key]||''}for(const p of this.data.partners){p.primaryTradeId||=p.tradeIds?.[0]||null;p.referralCode||=`PARTNER-${p.id.toUpperCase()}`}const heating=this.data.partners.find(p=>p.id==='p-1001');if(heating){heating.tradeIds=['heating'];heating.primaryTradeId='heating'}if(!this.data.partners.some(p=>p.id==='p-1008'))this.data.partners.push(defaults.partners.find(p=>p.id==='p-1008'));const electricalAssignment=this.data.assignments.find(a=>a.id==='a-8');if(electricalAssignment)electricalAssignment.partnerId='p-1008';const energy=this.data.partners.find(p=>p.id==='p-1004');if(energy&&energy.tradeIds?.length>1){energy.tradeIds=['energy'];energy.primaryTradeId='energy'}if(!this.data.partners.some(p=>p.id==='p-1009'))this.data.partners.push(defaults.partners.find(p=>p.id==='p-1009'));const craftRole=this.data.roleProfiles.find(r=>r.role==='crafts_partner');if(craftRole){craftRole.tradeIds=['*'];craftRole.plans=['standard','premium']}migrateEquipmentModel(this.data);this.save();
  }
  save(){const tmp=`${this.file}.tmp`;fs.writeFileSync(tmp,JSON.stringify(this.data,null,2));fs.renameSync(tmp,this.file)}
  audit(user,action,entity,entityId,ip,details={}){this.data.audit.unshift({id:`log-${Date.now()}`,at:new Date().toISOString(),userId:user?.id||'anonymous',action,entity,entityId,ip,details});this.data.audit=this.data.audit.slice(0,1000);this.save()}
  id(prefix){return `${prefix}-${Date.now().toString(36)}`}
}
