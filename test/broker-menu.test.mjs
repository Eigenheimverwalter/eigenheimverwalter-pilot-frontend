import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('equipment cockpit is only offered to craftsmen, never brokers or admins',()=>{
  const line=readFileSync(new URL('../public/assets/app.js',import.meta.url),'utf8').split('\n').find(x=>x.startsWith('function buildUserMenu'));
  for(const role of ['broker_partner','crafts_partner','super_admin','partner_basic']){
    const node={innerHTML:'',querySelectorAll:()=>[]},state={user:{role,name:'Test',email:'test@example.invalid'}};
    new Function('state','$','esc','labels',line+';buildUserMenu()')(state,()=>node,v=>v,{[role]:role});
    assert.equal(node.innerHTML.includes('data-menu="workbench"'),role==='crafts_partner');
  }
});
