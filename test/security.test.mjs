import test from 'node:test';
import assert from 'node:assert/strict';
import { seed } from '../lib/store.mjs';
import { canAccessProperty, hasPermission, verifyPassword } from '../lib/security.mjs';

const data=seed();
const user=id=>data.users.find(u=>u.id===id), prop=id=>data.properties.find(p=>p.id===id);
test('Super Admin besitzt alle Berechtigungen',()=>assert.equal(hasPermission(user('u-admin'),'anything.write'),true));
test('Admin Light darf Partner nicht verändern',()=>assert.equal(hasPermission(user('u-support'),'partners.write'),false));
test('Handwerkspartner sieht nur explizit zugewiesenes Objekt',()=>{assert.equal(canAccessProperty(user('u-craft'),prop('o-3001'),data),true);assert.equal(canAccessProperty(user('u-craft'),prop('o-3002'),data),false)});
test('Makler sieht keine fremde Verkaufsimmobilie',()=>{assert.equal(canAccessProperty(user('u-broker'),prop('o-3002'),data),true);assert.equal(canAccessProperty(user('u-broker'),prop('o-3001'),data),false)});
test('Passwörter werden gehasht und geprüft',()=>{assert.equal(verifyPassword('PilotAdmin!2026',user('u-admin').passwordHash),true);assert.equal(verifyPassword('falsch',user('u-admin').passwordHash),false)});
