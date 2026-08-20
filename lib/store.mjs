import fs from 'node:fs';
import path from 'node:path';
import { hashPassword } from './security.mjs';

export function seed() {
  const now = new Date().toISOString();
  return {
    meta: { version: 1, createdAt: now },
    users: [
      { id:'u-admin', name:'Sophie Keller', email:'admin@ehv.test', role:'super_admin', passwordHash:hashPassword('PilotAdmin!2026'), active:true },
      { id:'u-support', name:'Mia Hoffmann', email:'support@ehv.test', role:'admin_light', passwordHash:hashPassword('PilotSupport!2026'), active:true },
      { id:'u-craft', name:'Daniel Müller', email:'partner@ehv.test', role:'crafts_partner', passwordHash:hashPassword('PilotPartner!2026'), active:true },
      { id:'u-broker', name:'Lea Wagner', email:'makler@ehv.test', role:'broker_partner', passwordHash:hashPassword('PilotMakler!2026'), active:true }
    ],
    trades:[{id:'roof',name:'Dach'},{id:'heating',name:'Heizung'},{id:'electrical',name:'Elektro'},{id:'broker',name:'Immobilienvermittlung'}],
    partners:[
      {id:'p-1001',userId:'u-craft',company:'Müller Gebäudetechnik',contact:'Daniel Müller',email:'partner@ehv.test',status:'active',tradeIds:['heating','electrical'],postalCodes:['22043','22045'],onboarding:82,lastContact:'2026-08-18'},
      {id:'p-1002',userId:'u-broker',company:'Wagner Immobilien',contact:'Lea Wagner',email:'makler@ehv.test',status:'active',tradeIds:['broker'],postalCodes:['22301','22085'],onboarding:100,lastContact:'2026-08-19'},
      {id:'p-1003',company:'NordDach GmbH',contact:'Jannis Paulsen',email:'kontakt@norddach.test',status:'invited',tradeIds:['roof'],postalCodes:['22111'],onboarding:34,lastContact:'2026-08-12'}
    ],
    customers:[
      {id:'c-2001',name:'Familie Petersen',email:'petersen@example.test',phone:'+49 40 555 0192',propertyIds:['o-3001'],consent:true},
      {id:'c-2002',name:'Anna Schneider',email:'schneider@example.test',phone:'+49 40 555 0138',propertyIds:['o-3002'],consent:true},
      {id:'c-2003',name:'Markus Weber',email:'weber@example.test',phone:'+49 40 555 0175',propertyIds:['o-3003'],consent:true}
    ],
    properties:[
      {id:'o-3001',ehvId:'EHV-2026-001842',customerId:'c-2001',address:'Wandsbeker Zollstraße 12',postalCode:'22043',city:'Hamburg',type:'Einfamilienhaus',year:1998,area:142,value:612000,phase4Ref:'pilot:property:1842'},
      {id:'o-3002',ehvId:'EHV-2026-001917',customerId:'c-2002',address:'Dorotheenstraße 48',postalCode:'22301',city:'Hamburg',type:'Reihenhaus',year:2012,area:118,value:749000,phase4Ref:'pilot:property:1917'},
      {id:'o-3003',ehvId:'EHV-2026-002004',customerId:'c-2003',address:'Möllner Landstraße 91',postalCode:'22111',city:'Hamburg',type:'Doppelhaushälfte',year:1976,area:126,value:524000,phase4Ref:'pilot:property:2004'}
    ],
    assignments:[
      {id:'a-1',partnerId:'p-1001',propertyId:'o-3001',tradeId:'heating',status:'active',overrideRegion:false,accessStart:'2026-08-01',accessEnd:null},
      {id:'a-2',partnerId:'p-1002',propertyId:'o-3002',tradeId:'broker',status:'active',overrideRegion:false,accessStart:'2026-07-14',accessEnd:null},
      {id:'a-3',partnerId:'p-1003',propertyId:'o-3003',tradeId:'roof',status:'active',overrideRegion:true,accessStart:'2026-08-12',accessEnd:'2026-10-31'}
    ],
    serviceCases:[
      {id:'s-4001',propertyId:'o-3001',title:'Heizungswartung 2026',category:'Heizung',status:'in_progress',priority:'high',partnerId:'p-1001',updatedAt:'2026-08-19T09:15:00Z',documents:[]},
      {id:'s-4002',propertyId:'o-3003',title:'Dachprüfung nach Starkregen',category:'Dach',status:'new',priority:'medium',partnerId:'p-1003',updatedAt:'2026-08-18T13:40:00Z',documents:[]}
    ],
    salesFiles:[{id:'v-5001',propertyId:'o-3002',partnerId:'p-1002',status:'review',completeness:78,askingPrice:779000,documents:6,portalStatus:'not_connected'}],
    valuations:[
      {id:'w-1',propertyId:'o-3002',source:'EHV Phase 4',value:749000,effectiveDate:'2026-07-01',createdBy:'system',note:'Referenzwert; nicht lokal berechnet.'},
      {id:'w-2',propertyId:'o-3002',source:'Makler',value:768000,effectiveDate:'2026-08-15',createdBy:'u-broker',note:'Marktanpassung nach Objektbegehung.'}
    ],
    audit:[{id:'log-1',at:now,userId:'system',action:'demo.seeded',entity:'system',entityId:'runtime',ip:'local',details:{}}]
  };
}

export class Store {
  constructor(file){ this.file=path.resolve(file); fs.mkdirSync(path.dirname(this.file),{recursive:true}); this.data=fs.existsSync(this.file)?JSON.parse(fs.readFileSync(this.file,'utf8')):seed(); this.save(); }
  save(){ const tmp=`${this.file}.tmp`; fs.writeFileSync(tmp,JSON.stringify(this.data,null,2)); fs.renameSync(tmp,this.file); }
  audit(user, action, entity, entityId, ip, details={}){ this.data.audit.unshift({id:`log-${Date.now()}`,at:new Date().toISOString(),userId:user?.id||'anonymous',action,entity,entityId,ip,details}); this.data.audit=this.data.audit.slice(0,1000); this.save(); }
  id(prefix){ return `${prefix}-${Date.now().toString(36)}`; }
}
