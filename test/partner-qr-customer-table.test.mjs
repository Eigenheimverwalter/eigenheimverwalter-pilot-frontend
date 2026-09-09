import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import jsQR from './vendor/jsQR-1.4.0.cjs';
import {makeReferralQr} from '../public/assets/referral-qr.mjs';
import {customerTableHead,propertyKind,propertyRegion,equipmentStage,html} from '../public/assets/customer-overview.mjs';
const read = file => fs.readFileSync(new URL(file,import.meta.url),'utf8');

function decode(qr) {
  const scale=6, margin=4, width=(qr.size+margin*2)*scale, pixels=new Uint8ClampedArray(width*width*4).fill(255);
  for(let row=0;row<qr.size;row++)for(let col=0;col<qr.size;col++)if(qr.modules[row][col]){
    for(let y=0;y<scale;y++)for(let x=0;x<scale;x++){const offset=(((row+margin)*scale+y)*width+(col+margin)*scale+x)*4;pixels[offset]=pixels[offset+1]=pixels[offset+2]=0;}
  }
  return jsQR(pixels,width,width,{inversionAttempts:'dontInvert'})?.data;
}
test('independent scanner decodes stable, distinct partner QR codes exactly',()=>{
  const links=['https://eigenheimverwalter.github.io/eigenheimverwalter-pilot-frontend/ref/p-basic-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee','https://eigenheimverwalter.github.io/eigenheimverwalter-pilot-frontend/ref/p-broker-bbbbbbbb-cccc-dddd-eeee-ffffffffffff','https://eigenheimverwalter-pilot.de/ref/partner-123'];
  for(const link of links){const qr=makeReferralQr(link);assert.equal(decode(qr),link);assert.equal(qr.svg,makeReferralQr(link).svg);assert.match(qr.svg,/<svg/);assert.doesNotMatch(qr.svg,/<script|<image|https:/);}
  assert.notEqual(makeReferralQr(links[0]).svg,makeReferralQr(links[1]).svg);
  for(const link of ['javascript:alert(1)','https://example.com/login','https://x:y@example.com/ref/p','https://example.com/ref/p?token=secret'])assert.throws(()=>makeReferralQr(link));
});
test('uniform headers, escaped region fields and evidence-based equipment stages',()=>{
  assert.equal(customerTableHead('Equipment'),'<tr><th>Kunde</th><th>Immobilienart</th><th>Adresse und Region</th><th>Prozessstufe</th><th>Equipment</th></tr>');
  assert.match(propertyKind({type:'Einfamilienhaus'}),/Einfamilienhaus/);assert.equal(propertyKind({}),'Noch nicht erfasst');
  assert.match(propertyRegion({address:'<img>',postalCode:'22043',city:'Hamburg',state:'Hamburg'}),/&lt;img&gt;.*22043 Hamburg/);
  assert.equal(equipmentStage(null),'Equipment noch nicht eingerichtet');assert.equal(equipmentStage({verification:{status:'verified'}}),'Fachdaten geprüft');assert.equal(equipmentStage({}),'Fachdaten in Bearbeitung');
});
test('craft customer table exposes each assigned equipment directly in its own property row',async()=>{
  const app=read('../public/assets/app.js'),start=app.indexOf('const workbenchPage=async()=>'),end=app.indexOf('async function openPartnerProperty',start),nodes={'#content':{},'#partner-customer-search':{}},state={};
  const d={summary:{customers:1,properties:1,critical:0,verified:0},partner:{tradeName:'Heizung'},customers:[{name:'Kunde A',email:'a@example.invalid',properties:[{id:'p-a',type:'Reihenhaus',address:'Testweg 1',postalCode:'22043',city:'Hamburg',equipment:[{id:'e-a',label:'Kessel'},{id:'e-b',label:'Heizkreis'}]}]}]};
  const deps={api:async()=>d,state,$:s=>nodes[s],esc:html,customerTableHead,propertyKind,propertyRegion,equipmentStage,document:{querySelectorAll:()=>[]}};
  const page=new Function(...Object.keys(deps),app.slice(start,end)+';return workbenchPage')(...Object.values(deps));await page();
  assert.match(nodes['#content'].innerHTML,/data-property="p-a" data-equipment="e-a"/);assert.match(nodes['#content'].innerHTML,/data-property="p-a" data-equipment="e-b"/);assert.match(nodes['#content'].innerHTML,/Reihenhaus/);assert.match(nodes['#content'].innerHTML,/22043/);
});
test('sales navigation is removed and older shortcuts lead to customer selection',()=>{
  const app=read('../public/assets/app.js'),setup=app.split('\n').find(line=>line.startsWith('function setup'));
  assert.match(setup,/broker_partner:\['dashboard','brokerCustomers','opportunities'\]/);assert.doesNotMatch(app,/\['sales','♢','Verkaufsakten'\]|render\('sales'\)/);assert.match(app,/if\(page==='sales'\)page='brokerCustomers'/);
  assert.match(app,/state.supportView&&!x.salesFile/);assert.match(app,/openCustomerSalesFile\(b\)/);
});
test('sales file opens or is created for the selected property only, without duplicate click writes',async()=>{
  const app=read('../public/assets/app.js'),source=app.slice(app.indexOf('async function openCustomerSalesFile(')),writes=[],opens=[],state={};
  const fn=new Function('state','api','openBrokerSalesWorkflow','toast',source+';return openCustomerSalesFile')(state,async(path,options)=>{writes.push(JSON.parse(options.body));await new Promise(r=>setImmediate(r));return{id:'f-new'}},async id=>opens.push(id),()=>{});
  const button={disabled:false,dataset:{property:'p-selected',file:''}};
  await Promise.all([fn(button),fn(button)]);assert.deepEqual(writes,[{propertyId:'p-selected'}]);assert.deepEqual(opens,['f-new']);
  state.supportView={readOnly:true};await fn({disabled:false,dataset:{property:'p-other',file:''}});assert.equal(writes.length,1);
  await fn({disabled:false,dataset:{property:'p-existing',file:'f-existing'}});assert.deepEqual(opens,['f-new','f-existing']);
});
test('QR action is adjacent to recommend and uses the current partner referral endpoint',()=>{
  const source=read('../public/assets/partner-referrals.js');assert.match(source,/new-customer-recommendation'\)\.insertAdjacentHTML\('afterend'/);assert.match(source,/show-partner-qr'\)\.onclick = showPartnerQr/);assert.match(source,/makeReferralQr\(referralLink\(d.link\)\)/);assert.match(source,/QR-Code herunterladen \(SVG\)/);assert.doesNotMatch(source,/api\.qrserver|quickchart|chart\.googleapis/);
});
test('tipster table does not fetch or reveal protected property types or files',()=>{
  const source=read('../public/assets/partner-referrals.js');assert.match(source,/Nicht freigegeben/);assert.match(source,/Kein Aktenzugriff als Tippgeber/);assert.doesNotMatch(source,/portalRequest\('\/api\/broker\/sales-files/);
  assert.match(read('../public/assets/partner-basic-equipment.js'),/button.dataset.tradeName/);
});
