import test from 'node:test';
import assert from 'node:assert/strict';
import {extractLandRegister,compareOwner,compareOwners,compareLandRegisterValue} from '../lib/local-ocr.mjs';

test('Abteilung I wird strukturiert ausgelesen',()=>{
  const fields=extractLandRegister('Grundbuch von Teststadt\nAbteilung I\nEigentümer: Antonio da Silva\nGrundbuchblatt 1234\nGemarkung: Teststadt\nFlurstück: 03/7\nAbteilung II');
  assert.equal(fields.owner,'Antonio da Silva');
  assert.equal(fields.landRegisterSheet,'1234');
  assert.equal(fields.district,'Teststadt');
  assert.equal(fields.parcel,'03/7');
  assert.equal(fields.sectionOneDetected,true);
});

test('OCR-Varianten von Abteilung I werden erkannt',()=>{
  assert.equal(extractLandRegister('Abteilung |\nEigentümer: Max Mustermann').sectionOneDetected,true);
});

test('Namensabgleich liefert nur einen Prüfstatus, keine automatische Freigabe',()=>{
  const comparison=compareOwner('Antonio Silva','Antonio Silva');
  assert.equal(comparison.score,100);
  assert.equal(comparison.status,'match');
  assert.equal('verified' in comparison,false);
});

test('Mindestens einer von mehreren Eigentümern kann mit dem App-Kunden übereinstimmen',()=>{
  const fields=extractLandRegister('Bestandsverzeichnis\nLage: Quickborner Str. 19, 25494 Borstel-Hohenraden\nFlurstück: 038/7\nAbteilung I\nEigentümer: Erika Musterfrau\nEigentümer: Antonio Silva\nAbteilung II');
  const comparison=compareOwners(fields.owners,'Antonio Silva');
  assert.equal(fields.owners.length,2);
  assert.equal(comparison.atLeastOneMatch,true);
  assert.equal(comparison.ocr,'Antonio Silva');
});

test('Adresse und Flurstück werden getrennt gegen App-Daten bewertet',()=>{
  assert.equal(compareLandRegisterValue('Quickborner Straße 19, 25494 Borstel-Hohenraden','Quickborner Str. 19, 25494 Borstel-Hohenraden').status,'match');
  assert.equal(compareLandRegisterValue('038/7','038/7').status,'match');
  assert.equal(compareLandRegisterValue(null,'038/7').status,'not_detected');
});

test('Querformatiges Grundbuch mit Bestandsverzeichnis und Erster Abteilung wird tabellarisch gelesen',()=>{
  const fields=extractLandRegister(`Grundbuch von Borstel Blatt 410 Bestandsverzeichnis 1
1 Borstel-Hohenraden 013 70/6 Erholungsfläche 25 16
Gebäude- und Freifläche, Quickborner Straße 19
Grundbuch von Borstel Blatt 410 Erste Abteilung 1
Eigentümer / Eigentümerin Grundlage der Eintragung
1 Helga Grebenstein, geb. Lentfer, 1 alte Eintragung
2 1 Diana Machado Teixeira, 1 Auflassung
2 Antönio Lücio Fangueiro Da Silva, Babiel-Kurzer
Grundbuch von Borstel Blatt 410 Zweite Abteilung 1`);
  assert.deepEqual(fields.owners,['Diana Machado Teixeira','Antönio Lücio Fangueiro Da Silva']);
  assert.deepEqual(fields.historicalOwners,['Helga Grebenstein']);
  assert.equal(fields.address,'Quickborner Straße 19');
  assert.equal(fields.parcel,'70/6');
  assert.equal(compareOwners(fields.owners,'Antonio Silva').atLeastOneMatch,true);
});
