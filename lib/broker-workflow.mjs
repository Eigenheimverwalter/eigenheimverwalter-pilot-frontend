export const brokerDocumentChecklist = [
  'Grundbuchauszug',
  'Flurkarte / Katasterauszug',
  'Teilungserklärung & Aufteilungsplan',
  'Baugenehmigung',
  'Baupläne & Grundrisse',
  'Baubeschreibung',
  'Statische Berechnung',
  'Wohnflächenberechnung',
  'Energieausweis',
];

export const resolvedDocumentStatuses = new Set([
  'uploaded',
  'external_requested',
  'customer_requested',
  'not_available',
  'not_required',
]);

export function brokerStage(file, mandate, closing) {
  if (closing) return 'mandated';
  if (mandate?.acceptedAt) return 'mandated';
  if (file?.status === 'ready') return 'sales_ready';
  return 'valuation_requested';
}

export function salesFileCompleteness({ file, valuation, addressVerified, checklist }) {
  const resolved = checklist.filter((item) => resolvedDocumentStatuses.has(item.status)).length;
  const checks = [Boolean(file), Boolean(valuation), Boolean(addressVerified), resolved === checklist.length];
  return {
    percent: Math.round((checks.filter(Boolean).length / checks.length) * 100),
    complete: checks.every(Boolean),
    breakdown: {
      salesFile: Boolean(file),
      valuation: Boolean(valuation),
      addressVerified: Boolean(addressVerified),
      documentsResolved: resolved,
      documentsTotal: checklist.length,
    },
  };
}

export const brokerValuationFormulaVersion = 'EHV-PHASE4-SACHWERT-2.0';

const propertyTypeFactors = {
  einfamilienhaus: 1, villa: 1.2, zweifamilienhaus: 1.3,
  doppelhaushälfte: .7, doppelhaushaelfte: .7, reihenhaus: .65,
  mehrfamilienhaus: 1.3, wohnung: .8, eigentumswohnung: .8,
};
const conditionFactors = { good: 1, medium: .65, bad: .3 };
const conditionOptions = [
  { value: 'good', label: 'Gut / zeitgemäß' },
  { value: 'medium', label: 'Durchschnittlich / teilweise modernisiert' },
  { value: 'bad', label: 'Schwach / deutlicher Maßnahmenbedarf' },
];

const normalizeType = (value) => String(value || '').trim().toLowerCase();
const numeric = (value) => value === '' || value == null ? null : Number(value);
const finitePositive = (value) => Number.isFinite(value) && value > 0;
const effective = (input, key, source) => input[key] === '' || input[key] == null ? source : input[key];

export function buildBrokerValuationModel(property, input = {}, context = {}) {
  const values = {
    propertyType: effective(input, 'propertyType', property.type || null),
    livingArea: numeric(effective(input, 'livingArea', property.area)),
    landArea: numeric(effective(input, 'landArea', property.landArea)),
    year: numeric(effective(input, 'year', property.year)),
    basement: effective(input, 'basement', property.basement == null ? null : String(Boolean(property.basement))),
    landValuePerSqm: numeric(input.landValuePerSqm),
    generalCondition: input.generalCondition || null,
    technicalCondition: input.technicalCondition || null,
    energeticCondition: input.energeticCondition || null,
    documentationCondition: input.documentationCondition || null,
    marketAdjustmentFactor: numeric(input.marketAdjustmentFactor) ?? 1,
    valuationDate: input.valuationDate || null,
  };
  values.marketAdjustmentFactor = Math.max(.7, Math.min(1.3, values.marketAdjustmentFactor));
  const fields = [
    ['propertyType','Objektart',property.type||null,'select',true,Object.keys(propertyTypeFactors).map(value=>({value,label:value.charAt(0).toUpperCase()+value.slice(1)}))],
    ['livingArea','Wohnfläche',numeric(property.area),'number',true,null,'m²'],
    ['landArea','Grundstücksfläche',numeric(property.landArea),'number',true,null,'m²'],
    ['year','Baujahr',numeric(property.year),'number',true],
    ['basement','Keller',property.basement==null?null:String(Boolean(property.basement)),'select',true,[{value:'true',label:'Vorhanden'},{value:'false',label:'Nicht vorhanden'}]],
    ['landValuePerSqm','Bodenrichtwert',null,'number',true,null,'€/m²'],
    ['generalCondition','Allgemeiner Objektzustand',null,'select',true,conditionOptions],
    ['technicalCondition','Technischer Zustand',null,'select',true,conditionOptions],
    ['energeticCondition','Energetischer Zustand',null,'select',true,conditionOptions],
    ['documentationCondition','Dokumentations- und Aktenqualität',null,'select',true,conditionOptions],
    ['marketAdjustmentFactor','Marktanpassungsfaktor',null,'number',true,null,'Faktor'],
    ['valuationDate','Wertermittlungsstichtag',null,'date',true],
  ].map(([key,label,sourceValue,type,required,options,unit])=>{
    const value=values[key], missing=required&&(value==null||value==='');
    const changed=sourceValue!=null&&String(sourceValue)!==String(value);
    return {key,label,sourceValue,brokerValue:input[key]??null,effectiveValue:value,type,required,options:options||null,unit:unit||null,missing,changed,source:input[key]!==undefined&&input[key]!==''?'Maklerangabe':sourceValue!=null?'Phase 4 / App':'Fehlende Pflichtangabe'};
  });
  const typeFactor=propertyTypeFactors[normalizeType(values.propertyType)] ?? null;
  if(typeFactor==null)fields.find(x=>x.key==='propertyType').missing=true;
  if(!finitePositive(values.livingArea))fields.find(x=>x.key==='livingArea').missing=true;
  if(!finitePositive(values.landArea))fields.find(x=>x.key==='landArea').missing=true;
  if(!finitePositive(values.landValuePerSqm))fields.find(x=>x.key==='landValuePerSqm').missing=true;
  if(!Number.isFinite(values.year)||values.year<1800||values.year>new Date().getFullYear()+1)fields.find(x=>x.key==='year').missing=true;
  const missingRequired=fields.filter(x=>x.missing).map(x=>x.key);
  const healthEvidence=context.healthEvidence||{available:false,score:null,status:'not_available',note:'Kein belastbarer Phase-4-Health-Score vorhanden.'};
  const healthPlausibility={...healthEvidence,priceImpact:0,decision:'Nur fachlicher Prüfhinweis; kein automatischer Zu- oder Abschlag zum Verkehrswert.'};
  let calculation=null;
  if(!missingRequired.length){
    const yearFactor=values.year<=1950?0:values.year<=1970?.3:values.year<=1990?.6:values.year<=2010?.9:values.year<=2015?.98:1;
    const components={
      objectType:119*typeFactor,
      basement:170*(values.basement==='true'?1:.75),
      constructionYear:255*yearFactor,
      structuralBaseline:306,
      generalCondition:247.5*conditionFactors[values.generalCondition],
      technicalCondition:137.5*conditionFactors[values.technicalCondition],
      energeticCondition:165*conditionFactors[values.energeticCondition],
      documentationCondition:300*conditionFactors[values.documentationCondition],
    };
    const baseRate=Object.values(components).reduce((sum,value)=>sum+value,0);
    const constructionIndex={base:90,current:151,factor:151/90};
    const indexedRate=baseRate*constructionIndex.factor;
    const buildingValue=Math.round(indexedRate*values.livingArea);
    const landValue=Math.round(values.landArea*values.landValuePerSqm);
    const preliminaryMarketValue=Math.round((buildingValue+landValue)*values.marketAdjustmentFactor);
    calculation={components,baseRate,indexedRate,constructionIndex,buildingValue,landValue,preliminaryMarketValue,adjustedMarketValue:preliminaryMarketValue};
  }
  return {formulaVersion:brokerValuationFormulaVersion,method:'Korrigiertes EHV-Sachwertmodell auf Phase-4-Rohdatenbasis',values,fields,missingRequired,complete:missingRequired.length===0,calculation,healthPlausibility,previousPhase4Result:numeric(property.value),note:'Vorläufige Wertindikation. Erst die fachliche Maklerfreigabe erzeugt den in der Kundenakte sichtbaren Verkehrswert.'};
}

export function calculateBrokerValuation(property, input = {}, context = {}) {
  const model=buildBrokerValuationModel(property,input,context);
  return {
    ...model,
    baseMarketValue:model.previousPhase4Result,
    marketAdjustmentFactor:model.values.marketAdjustmentFactor,
    landValuePerSqm:model.values.landValuePerSqm,
    effectiveLandArea:model.values.landArea,
    landAdjustment:model.calculation?.landValue??null,
    adjustedMarketValue:model.calculation?.adjustedMarketValue??null,
  };
}

export function brokerRanking(partners, state) {
  return partners.map((partner) => {
    const files = state.salesFiles.filter((file) => file.partnerId === partner.id);
    const mandates = state.brokerMandates.filter((item) => item.partnerId === partner.id && item.acceptedAt);
    const closings = state.brokerClosings.filter((item) => item.partnerId === partner.id);
    const cases = state.partnerCases.filter((item) => item.partnerId === partner.id && item.kind === 'sales_mandate');
    const responseHours = cases.filter((item) => item.firstViewedAt).map((item) => Math.max(0, (new Date(item.firstViewedAt) - new Date(item.createdAt)) / 3600000));
    const averageResponseHours = responseHours.length ? responseHours.reduce((a, b) => a + b, 0) / responseHours.length : null;
    const responseScore = averageResponseHours == null ? 0 : Math.max(0, Math.min(100, 110 - averageResponseHours * 5));
    const mandateRate = Math.round(100 * mandates.length / Math.max(1, files.length));
    const successRate = Math.round(100 * closings.length / Math.max(1, mandates.length));
    const revenue = closings.reduce((sum, item) => sum + Number(item.salePrice || 0), 0);
    const documentation = files.length ? Math.round(files.reduce((sum, file) => sum + Number(file.completeness || 0), 0) / files.length) : 0;
    const score = Math.round(responseScore * 0.25 + mandateRate * 0.30 + successRate * 0.30 + documentation * 0.15);
    return {
      partnerId: partner.id,
      partner: partner.company,
      score,
      revenue,
      files: files.length,
      mandates: mandates.length,
      successfulSales: closings.length,
      averageResponseHours: averageResponseHours == null ? null : Math.round(averageResponseHours * 10) / 10,
      mandateRate,
      successRate,
      documentation,
    };
  }).sort((a, b) => b.score - a.score || b.revenue - a.revenue).slice(0, 10);
}
