import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
test('late dashboard response does not overwrite a newer menu choice',async()=>{
  const source=readFileSync(new URL('../public/assets/partner-basic.js',import.meta.url),'utf8');
  const lines=source.split(/\r?\n/),start=lines.findIndex(x=>x==='let currentNavigation=0;');
  assert.ok(start>=0);let click,resolve;
  const context=vm.createContext({document:{querySelectorAll(){return [];},addEventListener(event,handler){click=handler;}},request:()=>new Promise(r=>resolve=r)});
  vm.runInContext(lines.slice(start,start+3).join('\n').replace('export async function','async function'),context);
  const pending=vm.runInContext('renderBasicDashboard()',context);
  click({target:{closest:()=>true}});resolve({user:{role:'partner_basic'}});
  assert.equal(await pending,false);
});
