const institutionPattern=/\b(?:ag|gmbh|mbh|kg|kgaa|eg|se|ohg|aktiengesellschaft|\w*bank\w*|\w*kasse\w*|\w*versicher\w*|finanzamt|bezirksamt|ortsamt|statistisches\s+amt|amtsgericht|agentur\s+f(?:ü|u|\.)r?\s+arbeit|jobcenter|minister\w*|staatskanzlei|bundesamt|landesamt|verwaltung|universit(?:ät|äts\w*)|hochschule|bibliothek|klinikum|krankenhaus|verlag\w*|zeitung\w*|presse\w*|rundfunk|telekom|deutsche\s+(?:post|rentenversicherung)|postfach|versand|service\s+germany|versorgungswerk|industrie-?\s*und\s+handelskammer|handwerkskammer|bundeswehr|justizvollzugsanstalt|polizeipräsidium|stadtwerke|energieversorgung|holding|airport\s+business\s+center)\b/i;

const organisationSignals=/[&]|\b(?:filialdirektion|zweigniederlassung|unternehmensbereich|dienstleistungszentrum|rechenzentrum|gesellschaft|betriebe|werke|konzern|direktion|niederlassung|service|marketing|group|ltd|zentrale|zulagenstelle|kammer|bundes\w*|landes\w*|gericht|industrie|lotterie|kravag|huk|gez|bfa|dihk|ovag)\b/i;

export const isInstitutionName=value=>{const name=String(value||'').trim();return institutionPattern.test(name)||organisationSignals.test(name)||(/^[A-ZÄÖÜ0-9 .&+\-/]{2,}$/.test(name)&&/[A-ZÄÖÜ]{2}/.test(name));};

export function localityNames(placeNames=[]){
  return [...new Set(placeNames.map(value=>String(value||'').trim()).filter(value=>value&&!isInstitutionName(value)))];
}

export function toBookablePostalEntry(entry){
  const names=localityNames(entry.placeNames?.length?entry.placeNames:[entry.city]);
  if(!names.length)return null;
  const city=names.includes(entry.city)?entry.city:names[0];
  return {...entry,city,placeNames:names};
}
