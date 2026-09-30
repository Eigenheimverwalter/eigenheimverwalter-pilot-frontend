import fs from 'node:fs';
import {mapEhvSnapshot,scopePartnerSnapshot,validateEhvCoreConfiguration,EHV_CORE_API_INVENTORY,EHV_PARTNER_OS_GAPS} from '../lib/ehv-core-integration.mjs';

const configuration=validateEhvCoreConfiguration(process.env);
if(configuration.remote)throw new Error('Remote verification is intentionally disabled until the EHV Core service endpoints and credentials are approved.');
const fixture=JSON.parse(fs.readFileSync(new URL('../test/fixtures/ehv-core/snapshot.json',import.meta.url),'utf8'));
const mapped=mapEhvSnapshot(fixture);
const scoped=scopePartnerSnapshot(mapped,{allowedPropertyIds:['7001'],allowedTradeIds:['heating']});
console.log(JSON.stringify({configuration,counts:mapped.meta.counts,scopedCounts:{customers:scoped.customers.length,properties:scoped.properties.length,equipment:scoped.equipment.length,documents:scoped.documents.length,serviceRecords:scoped.serviceRecords.length,consumptions:scoped.consumptions.length,valuations:scoped.valuations.length,setcards:scoped.setcards.length},inventory:EHV_CORE_API_INVENTORY,gaps:EHV_PARTNER_OS_GAPS},null,2));

