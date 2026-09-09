export const html = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
export const customerTableHead = action => `<tr><th>Kunde</th><th>Immobilienart</th><th>Adresse und Region</th><th>Prozessstufe</th><th>${html(action)}</th></tr>`;
export const propertyKind = property => html(property.type || property.propertyType || 'Noch nicht erfasst');
export const propertyRegion = property => `${html(property.address || 'Adresse nicht erfasst')}<br><small>${html([property.postalCode || property.postal_code, property.city].filter(Boolean).join(' '))}${property.state || property.region ? ' · '+html(property.state || property.region) : ''}</small>`;
export function equipmentStage(equipment) {
  if (!equipment) return 'Equipment noch nicht eingerichtet';
  if (equipment.verification?.status === 'verified') return 'Fachdaten geprüft';
  return 'Fachdaten in Bearbeitung';
}
