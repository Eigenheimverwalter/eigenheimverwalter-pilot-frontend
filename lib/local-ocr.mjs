import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

const run=promisify(execFile);
const tesseract=process.env.TESSERACT_BIN||'C:\\Program Files\\Tesseract-OCR\\tesseract.exe';
const pdftoppm=process.env.PDFTOPPM_BIN||'C:\\Users\\anton\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\poppler\\Library\\bin\\pdftoppm.exe';
const tessdata=path.resolve(process.env.TESSDATA_DIR||'resources/tessdata');
const fold=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/straße|strasse/g,'str').replace(/[^a-z0-9]/g,'');
const similarity=(left,right)=>{const a=fold(left),b=fold(right);if(!a||!b)return 0;if(a===b)return 100;const longer=a.length>=b.length?a:b,shorter=a.length>=b.length?b:a;let distance=Array.from({length:shorter.length+1},(_,i)=>i);for(let i=1;i<=longer.length;i++){const next=[i];for(let j=1;j<=shorter.length;j++)next[j]=Math.min(next[j-1]+1,distance[j]+1,distance[j-1]+(longer[i-1]===shorter[j-1]?0:1));distance=next}return Math.max(0,Math.round((1-distance.at(-1)/longer.length)*100))};
const firstMatch=(text,patterns)=>{for(const pattern of patterns){const match=text.match(pattern);if(match?.[1])return match[1].trim()}return null};

export function extractLandRegister(text){
  const section=(text.match(/(?:Erste\s+Abteilung|Abteilung\s*(?:I|1|\|))\s*\d*[\s\S]*?(?=(?:Zweite\s+Abteilung|Abteilung\s*(?:II|2))|$)/i)||[])[0]||text;
  const tabularOwners=[...section.matchAll(/^\s*(\d+)(?:\s+(\d+))?\s+([A-ZÄÖÜ][^,\r\n]{2,120}),/gmi)].map(match=>({entry:Number(match[1]),subentry:match[2]?Number(match[2]):null,name:match[3].trim()}));
  const latestEntry=tabularOwners.length?Math.max(...tabularOwners.map(x=>x.entry)):null;
  const currentOwners=tabularOwners.filter(x=>x.entry===latestEntry).map(x=>x.name);
  const labelledOwners=[...section.matchAll(/(?:Eigentümer(?:in)?|Berechtigte?r?)\s*[:\-]\s*([^\n]{3,160})/gi)].map(x=>x[1].trim());
  const owners=[...new Set((currentOwners.length?currentOwners:labelledOwners).filter(Boolean))];
  const inventoryRow=text.match(/^\s*\d+\s+([A-ZÄÖÜ][A-Za-zÄÖÜäöüß-]+)\s+(\d{1,3})\s+(\d+[\/&]\d+)\s+/mi);
  const parcel=firstMatch(text,[/(?:Flurstück(?:snummer)?)\s*[:\-]?\s*([A-Za-z0-9&\/.-]+)/i])||inventoryRow?.[3]||null;
  const district=firstMatch(text,[/(?:Grundbuchbezirk|Gemarkung)\s*[:\-]\s*([^\n,;]{2,80})/i])||inventoryRow?.[1]||null;
  const address=firstMatch(text,[/(?:Gebäude-\s*und\s*Freifläche|Grundstücksanschrift|Objektanschrift)\s*,?\s*([^\n;]{5,160})/i,/(?:Anschrift|Adresse|Lage)\s*[:\-]\s*([^\n;]{5,160})/i]);
  return {owner:owners[0]||null,owners,historicalOwners:tabularOwners.filter(x=>x.entry!==latestEntry).map(x=>x.name),landRegisterSheet:firstMatch(text,[/(?:Grundbuchblatt|Blatt)\s*_?\s*(?:Nr\.?\s*)?([A-Za-z0-9\/-]+)/i]),district,parcel,address,sectionOneDetected:/(?:Erste\s+Abteilung|Abteilung\s*(?:I|1|\|))/i.test(text)};
}

export async function recognizeLandRegister(file,mime){
  if(!fs.existsSync(tesseract))throw Error('Lokale Tesseract-Installation wurde nicht gefunden');
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ehv-ocr-'));
  try{
    let images=[file];
    if(mime==='application/pdf'){const prefix=path.join(dir,'page');await run(pdftoppm,['-f','1','-l','8','-r','220','-png',file,prefix],{timeout:120000,maxBuffer:1024*1024});images=fs.readdirSync(dir).filter(x=>x.endsWith('.png')).sort().map(x=>path.join(dir,x))}
    const chunks=[];for(const image of images){const {stdout}=await run(tesseract,[image,'stdout','-l','deu','--tessdata-dir',tessdata,'--psm','6'],{timeout:120000,maxBuffer:8*1024*1024});chunks.push(stdout)}
    const text=chunks.join('\n\n');return {text,fields:extractLandRegister(text),engine:'Tesseract 5 / deu',pages:images.length};
  }finally{fs.rmSync(dir,{recursive:true,force:true})}
}

export function compareOwner(ocrOwner,appName){const baseScore=similarity(ocrOwner,appName),ocrFold=fold(ocrOwner),appTokens=String(appName||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().match(/[a-z0-9]+/g)||[],tokenMatch=appTokens.length>=2&&appTokens.every(token=>ocrFold.includes(token)),score=tokenMatch?Math.max(95,baseScore):baseScore;return {ocr:ocrOwner||null,app:appName||null,score,status:!ocrOwner||!appName?'not_detected':score>=95?'match':score>=70?'review':'mismatch'}};
export function compareOwners(ocrOwners,appName){const candidates=(Array.isArray(ocrOwners)?ocrOwners:[ocrOwners]).filter(Boolean).map(owner=>compareOwner(owner,appName)).sort((a,b)=>b.score-a.score),best=candidates[0]||compareOwner(null,appName);return {...best,candidates,atLeastOneMatch:candidates.some(x=>x.status==='match')}};
export function compareLandRegisterValue(ocrValue,appValue){const left=fold(ocrValue),right=fold(appValue),contained=left.length>=5&&right.length>=5&&(left.includes(right)||right.includes(left)),score=contained?Math.max(95,similarity(ocrValue,appValue)):similarity(ocrValue,appValue),missing=!ocrValue||!appValue;return {ocr:ocrValue||null,app:appValue||null,score,status:missing?'not_detected':score>=90?'match':score>=65?'review':'mismatch'}};
