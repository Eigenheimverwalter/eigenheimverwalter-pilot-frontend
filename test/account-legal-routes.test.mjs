import {test} from 'node:test';
import assert from 'node:assert/strict';
import {handlesRoute,supportsPath} from '../public/assets/supabase-routes.mjs';
test('contract list and accepted-file URLs use the authenticated API bridge',()=>{
  for(const path of ['/api/account/legal','/api/account/legal/00000000-0000-0000-0000-000000000001/file']){assert.equal(handlesRoute(path),true);assert.equal(supportsPath(path),true);}
  assert.equal(supportsPath('/api/account/legal/unknown/delete'),false);
});
