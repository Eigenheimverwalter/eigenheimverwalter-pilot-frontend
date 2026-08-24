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
