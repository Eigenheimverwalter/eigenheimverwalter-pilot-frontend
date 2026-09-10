import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
test('own equipment opens; foreign property or trade remains forbidden',()=>{
 const source=stripTypeScriptTypes(readFileSync(new URL('../supabase/functions/_shared/read-routes.ts',import.meta.url),'utf8').replace(/^import .*\r?\n/gm,''),{mode:'strip'}).replace('export function readRoute','function readRoute');
 const partner={id:'p',primaryTradeId:'HEATING'};const properties=[{id:'own',customerId:'c'}];
 const deps={array:x=>Array.isArray(x)?x:[],isAdmin:()=>false,sourcePartner:()=>partner,scopedProperties:()=>properties};
 const read=new Function(...Object.keys(deps),source+';return readRoute')(...Object.values(deps));
 const state={properties,customers:[{id:'c'}],equipmentRecords:[{id:'e',propertyId:'own',tradeId:'HEATING'}]};
 assert.equal(read('/equipment/e',state,{role:'partner_basic'},'u','').status,200);
 state.equipmentRecords[0].tradeId='ROOF';assert.equal(read('/equipment/e',state,{role:'partner_basic'},'u','').status,403);
 state.equipmentRecords[0].tradeId='HEATING';state.equipmentRecords[0].propertyId='foreign';assert.equal(read('/equipment/e',state,{role:'partner_basic'},'u','').status,403);
});
