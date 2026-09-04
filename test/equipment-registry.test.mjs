import test from 'node:test';
import assert from 'node:assert/strict';
import { seed } from '../lib/store.mjs';
import { EQUIPMENT_TYPES, PARTNER_CATEGORIES, canonicalPartnerType, migrateEquipmentModel } from '../lib/equipment-registry.mjs';
import { canAccessResource, hasPermission } from '../lib/security.mjs';

const migrated=()=>migrateEquipmentModel(seed());

test('V2 enthält exakt 16 eindeutige Equipmenttypen und zwei Partnerkategorien',()=>{
  assert.equal(EQUIPMENT_TYPES.length,16);
  assert.equal(new Set(EQUIPMENT_TYPES.map(x=>x.id)).size,16);
  assert.deepEqual(PARTNER_CATEGORIES.map(x=>x.id),['BROKER','WHITE_LABEL']);
});

test('Alte Gewerke werden verlustfrei auf die V2-Typen abgebildet',()=>{
  assert.equal(canonicalPartnerType('heat_pump'),'EQUIP_HEIZUNG');
  assert.equal(canonicalPartnerType('air_conditioning'),'EQUIP_LUEFTUNG');
  assert.equal(canonicalPartnerType('softening'),'EQUIP_SANITAER');
  assert.equal(canonicalPartnerType('broker'),'BROKER');
});

test('Für jeden zulässigen Partnertyp existiert genau eine aktive Standardrolle',()=>{
  const data=migrated(), expected=[...EQUIPMENT_TYPES,...PARTNER_CATEGORIES].map(x=>x.id);
  assert.equal(data.partnerRoleTemplates.length,18);
  for(const id of expected)assert.equal(data.partnerRoleTemplates.filter(x=>x.tradeId===id&&x.status==='active').length,1,id);
});

test('Jeder aktive Partnerzugang ist genau einem V2-Typ zugeordnet',()=>{
  const data=migrated(), valid=new Set(data.trades.map(x=>x.id));
  assert.equal(data.partners.filter(x=>x.status!=='archived').every(p=>p.tradeIds.length===1&&p.primaryTradeId===p.tradeIds[0]&&valid.has(p.primaryTradeId)),true);
});

test('Equipmentgebundene Ressource bleibt für fremdes Gewerk gesperrt',()=>{
  const data=migrated(), user=data.users.find(x=>x.id==='u-craft'), partner=data.partners.find(x=>x.userId===user.id);
  partner.lifecycle='active';
  assert.equal(canAccessResource(user,{propertyId:'o-3001',equipmentTypeId:'EQUIP_HEIZUNG'},data,true),true);
  assert.equal(canAccessResource(user,{propertyId:'o-3001',equipmentTypeId:'EQUIP_DACH'},data,true),false);
});

test('Objektweite Ressource benötigt zusätzlich einen expliziten Resource Grant',()=>{
  const data=migrated(), user=data.users.find(x=>x.id==='u-craft'), partner=data.partners.find(x=>x.userId===user.id);
  partner.lifecycle='active';data.resourceGrants=[];
  assert.equal(canAccessResource(user,{propertyId:'o-3001'},data),false);
  data.resourceGrants.push({partnerId:partner.id,propertyId:'o-3001',status:'active',write:false});
  assert.equal(canAccessResource(user,{propertyId:'o-3001'},data),true);
  assert.equal(canAccessResource(user,{propertyId:'o-3001'},data,true),false);
});

test('Equipment-Standardrolle erlaubt Fachpartnern Ersteinrichtung und Service-Dokumente',()=>{
  const data=migrated(), user=data.users.find(x=>x.id==='u-craft');
  assert.equal(hasPermission(user,'equipment.write',data),true);
  assert.equal(hasPermission(user,'service.write',data),true);
  assert.equal(hasPermission(user,'documents.write',data),true);
  assert.equal(hasPermission(user,'partners.write',data),false);
});

test('Equipment-Standardrolle darf Angebote hochladen, aber keine fremden Gewerke lesen',()=>{
  const data=migrated(), user=data.users.find(x=>x.id==='u-craft'), partner=data.partners.find(x=>x.userId===user.id);
  partner.lifecycle='active';
  assert.equal(hasPermission(user,'documents.write',data),true);
  assert.equal(canAccessResource(user,{propertyId:'o-3001',equipmentTypeId:partner.primaryTradeId},data),true);
  assert.equal(canAccessResource(user,{propertyId:'o-3001',equipmentTypeId:'EQUIP_DACH'},data),false);
});
