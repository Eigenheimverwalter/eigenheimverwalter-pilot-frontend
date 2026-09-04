import { EQUIPMENT_FORM_MATRIX } from './equipment-form-matrix.mjs';

const TYPE_MAP=Object.freeze({'Text':'text','Mehrzeilig':'textarea','Jahr':'number','Ganzzahl':'number','Dezimal':'number','Datum':'date','Auswahl':'select','Mehrfachauswahl':'multiselect','Unterformular':'subform'});
const aliases=Object.freeze({label:'instance_label',year:'year_of_construction',lastMaintenance:'last_maintenance_date',lastModernization:'last_renovation_date',condition:'condition_key'});
const fieldFromMatrix=row=>({id:row.id,label:row.label,section:row.section,type:TYPE_MAP[row.dataType]||'text',required:row.requirement==='pflicht',recommended:row.requirement==='empfohlen',requirement:row.requirement,unit:row.unit||'',options:row.options||[],sourceField:row.sourceField||null,sourceAvailable:Boolean(row.sourceField),scoreRelevant:Boolean(row.scoreRelevant),multiple:row.dataType==='Mehrfachauswahl',schemaOnly:row.dataType==='Unterformular'});

export function equipmentFieldSchema(tradeId){
  const fields=(EQUIPMENT_FORM_MATRIX[tradeId]||[]).map(fieldFromMatrix);
  return {tradeId,version:2,source:'eigenheimverwalter Equipment-Formularmatrix + vorhandenes Phase-4-Datenmodell',fields,requiredCount:fields.filter(x=>x.required).length,recommendedCount:fields.filter(x=>x.recommended).length,sourceBackedCount:fields.filter(x=>x.sourceAvailable).length};
}

const normalizeMulti=value=>Array.isArray(value)?value.map(String):String(value||'').split('|').map(x=>x.trim()).filter(Boolean);
export function normalizeEquipmentFields(tradeId,input,current={}){
  const schema=equipmentFieldSchema(tradeId),values={...(current.specifications||{})},errors=[];
  for(const [legacy,currentId] of Object.entries(aliases))if(values[currentId]===undefined&&current[legacy]!==undefined)values[currentId]=current[legacy];
  for(const field of schema.fields){
    if(!(field.id in input))continue;
    const raw=input[field.id];
    if(field.type==='number'){const parsed=raw===''||raw===null?null:Number(raw);values[field.id]=parsed===null||Number.isFinite(parsed)?parsed:null;if(parsed!==null&&!Number.isFinite(parsed))errors.push({field:field.id,code:'invalid_number'})}
    else if(field.type==='multiselect')values[field.id]=normalizeMulti(raw).filter(x=>!field.options.length||field.options.includes(x));
    else if(field.type==='select')values[field.id]=field.options.includes(String(raw))?String(raw):null;
    else if(field.type==='subform'){try{const parsed=Array.isArray(raw)?raw:JSON.parse(String(raw||'[]'));values[field.id]=Array.isArray(parsed)?parsed.slice(0,50):[]}catch{errors.push({field:field.id,code:'invalid_subform'});values[field.id]=values[field.id]||[]}}
    else values[field.id]=String(raw??'').trim().slice(0,2000)||null;
  }
  const present=value=>value!==null&&value!==undefined&&value!==''&&(!Array.isArray(value)||value.length>0)&&(typeof value!=='number'||Number.isFinite(value)),required=schema.fields.filter(x=>x.required&&!x.schemaOnly),recommended=schema.fields.filter(x=>x.recommended&&!x.schemaOnly),missingRequired=required.filter(field=>!present(values[field.id])).map(field=>field.id),completedRecommended=recommended.filter(field=>present(values[field.id])).length,completedRequired=required.length-missingRequired.length;
  return {schema,values,errors,missingRequired,quality:{requiredComplete:missingRequired.length===0,missingRequired,completedRequired,requiredCount:required.length,completedRecommended,recommendedCount:recommended.length,percent:Math.round((completedRequired+completedRecommended)/Math.max(1,required.length+recommended.length)*100)}};
}
