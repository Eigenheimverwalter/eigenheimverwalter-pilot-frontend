import test from 'node:test';
import assert from 'node:assert/strict';
import { EQUIPMENT_TYPES } from '../lib/equipment-registry.mjs';
import { equipmentFieldSchema, normalizeEquipmentFields } from '../lib/equipment-fields.mjs';

test('jedes Gewerk besitzt ein eigenes Phase-4-Equipmentformular',()=>{
  for(const equipment of EQUIPMENT_TYPES){
    const schema=equipmentFieldSchema(equipment.id);
    assert.equal(schema.tradeId,equipment.id);
    assert.match(schema.source,/Formularmatrix/);
    assert.ok(schema.fields.length>=3,`${equipment.name} benötigt mindestens drei Felder`);
    assert.ok(schema.requiredCount>=1,`${equipment.name} benötigt mindestens ein Pflichtfeld`);
  }
});

test('Dachformular fragt keine heizungstypischen Felder ab',()=>{
  const ids=equipmentFieldSchema('EQUIP_DACH').fields.map(field=>field.id);
  assert.ok(ids.includes('roof_type'));
  assert.ok(ids.includes('area'));
  assert.equal(ids.includes('serial_number'),false);
  assert.equal(ids.includes('energy_source'),false);
});

test('Equipmentwerte werden typgerecht normalisiert',()=>{
  const result=normalizeEquipmentFields('EQUIP_DACH',{instance_label:'Steildach',year_of_construction:'1998',roof_type:'Satteldach',damage_pattern:['Moos','Risse']});
  assert.equal(result.values.year_of_construction,1998);
  assert.deepEqual(result.values.damage_pattern,['Moos','Risse']);
  assert.equal(result.values.instance_label,'Steildach');
  assert.equal(result.quality.requiredComplete,true);
});

test('Matrix überträgt Pflichtgrad, Auswahlwerte, Abschnitte und Phase-4-Quelle',()=>{
  const heating=equipmentFieldSchema('EQUIP_HEIZUNG'),system=heating.fields.find(x=>x.id==='system_type'),year=heating.fields.find(x=>x.id==='year_of_construction');
  assert.equal(system.required,true);assert.equal(system.type,'select');assert.ok(system.options.includes('Wärmepumpe'));assert.equal(system.section,'System');
  assert.equal(year.sourceAvailable,true);assert.match(year.sourceField,/heating_data/);
});

test('Unvollständige Pflichtfelder verhindern fachliche Vollständigkeit',()=>{
  const result=normalizeEquipmentFields('EQUIP_BATTERIE',{instance_label:'Speicher 1'});
  assert.equal(result.quality.requiredComplete,false);assert.ok(result.missingRequired.includes('capacity_usable'));
});
