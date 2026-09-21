import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('database maps Basic Tippgeber to their dedicated legal audience',async()=>{
  const sql=await readFile(new URL('../supabase/migrations/202609210001_fix_basic_referral_legal_audience.sql',import.meta.url),'utf8');
  assert.match(sql,/when upper\(coalesce\(plan,''\)\)='BASIC' and upper\(coalesce\(kind,''\)\)='REFERRAL' then 'BASIC_REFERRAL'/);
  assert.match(sql,/legal_document_matches\('PRICE_SHEET','BASIC_REFERRAL','BASIC','REFERRAL'\)/);
});
