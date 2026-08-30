import test from 'node:test';
import assert from 'node:assert/strict';
import { seed } from '../lib/store.mjs';
import { canAccessProperty, hasPermission, verifyPassword } from '../lib/security.mjs';

const data=seed();
const user=id=>data.users.find(u=>u.id===id), prop=id=>data.properties.find(p=>p.id===id);
test('Super Admin besitzt alle Berechtigungen',()=>assert.equal(hasPermission(user('u-admin'),'anything.write'),true));
test('Admin Light darf Kunden und Partner operativ verwalten',()=>{assert.equal(hasPermission(user('u-support'),'partners.write'),true);assert.equal(hasPermission(user('u-support'),'customers.write'),true)});
test('Handwerkspartner sieht nur explizit zugewiesenes Objekt',()=>{assert.equal(canAccessProperty(user('u-craft'),prop('o-3001'),data),true);assert.equal(canAccessProperty(user('u-craft'),prop('o-3002'),data),false)});
test('Regionale Ausnahme umgeht die Gewerkprüfung nicht',()=>assert.equal(canAccessProperty(user('u-craft'),prop('o-3009'),data),false));
test('Jedes Partnerkonto besitzt genau ein Gewerk',()=>assert.equal(data.partners.every(p=>p.tradeIds.length===1&&p.primaryTradeId===p.tradeIds[0]),true));
test('Makler sieht keine fremde Verkaufsimmobilie',()=>{assert.equal(canAccessProperty(user('u-broker'),prop('o-3002'),data),true);assert.equal(canAccessProperty(user('u-broker'),prop('o-3001'),data),false)});
test('Passwörter werden gehasht und geprüft',()=>{assert.equal(verifyPassword('ChangeMe123!',user('u-admin').passwordHash),true);assert.equal(verifyPassword('falsch',user('u-admin').passwordHash),false)});
test('Partner darf aggregierte Opportunities lesen',()=>assert.equal(hasPermission(user('u-craft'),'opportunities.read',data),true));
test('Admin Light darf Trigger nicht verändern',()=>assert.equal(hasPermission(user('u-support'),'opportunities.write',data),false));
test('Partner Basic darf Empfehlungen und ausschließlich explizit zugewiesene Kundenakten bearbeiten',()=>{const basic={id:'u-basic-test',role:'partner_basic'};assert.equal(hasPermission(basic,'referrals.write',data),true);assert.equal(hasPermission(basic,'customers.read',data),true);assert.equal(hasPermission(basic,'equipment.write',data),true);assert.equal(canAccessProperty(basic,prop('o-3001'),data),false)});
test('Partner Basic Makler bleibt auf explizit zugewiesene Immobilien beschränkt',()=>{data.users.push({id:'u-basic-broker-unit',role:'partner_basic'});data.partners.push({id:'p-basic-broker-unit',userId:'u-basic-broker-unit',status:'active',tradeIds:['BROKER'],primaryTradeId:'BROKER',postalCodes:[]});data.assignments.push({id:'a-basic-broker-unit',partnerId:'p-basic-broker-unit',propertyId:'o-3002',tradeId:'BROKER',status:'active',overrideRegion:true});assert.equal(canAccessProperty(data.users.at(-1),prop('o-3002'),data),true);assert.equal(canAccessProperty(data.users.at(-1),prop('o-3001'),data),false)});
