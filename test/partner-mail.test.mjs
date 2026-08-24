import test from'node:test';import assert from'node:assert/strict';import{partnerMailConfiguration,sendPartnerMail}from'../lib/partner-mail.mjs';
test('uses the centrally configured partner sender',()=>assert.equal(partnerMailConfiguration({}).sender,'partner@eigenheimverwalter.de'));
test('does not pretend to send without server-side Sales OS credentials',async()=>{const result=await sendPartnerMail({partner:{email:'x@example.de'},subject:'Test',message:'Hallo',env:{}});assert.equal(result.status,'queued');assert.equal(result.reason,'sales_os_mail_not_configured')});
