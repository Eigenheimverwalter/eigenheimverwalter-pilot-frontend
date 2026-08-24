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

export function calculateBrokerValuation(property, input = {}) {
  const baseMarketValue = Number(property.value || 0);
  const factor = Math.max(0.7, Math.min(1.3, Number(input.marketAdjustmentFactor || 1)));
  const effectiveLandArea = input.landArea === '' || input.landArea == null
    ? (Number(property.landArea || 0) || null)
    : Number(input.landArea);
  const landValuePerSqm = input.landValuePerSqm === '' || input.landValuePerSqm == null
    ? null
    : Number(input.landValuePerSqm);
  const landAdjustment = effectiveLandArea && Number.isFinite(landValuePerSqm)
    ? effectiveLandArea * landValuePerSqm
    : 0;
  return {
    baseMarketValue,
    marketAdjustmentFactor: factor,
    landValuePerSqm: Number.isFinite(landValuePerSqm) ? landValuePerSqm : null,
    effectiveLandArea: Number.isFinite(effectiveLandArea) ? effectiveLandArea : null,
    landAdjustment,
    adjustedMarketValue: Math.round(baseMarketValue * factor + landAdjustment),
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
