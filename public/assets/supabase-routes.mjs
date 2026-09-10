export const supported=new Set([
  '/api/account/legal',
  '/api/partner-onboarding',
  '/api/legal-documents',
  '/api/marketing-kit',
  '/api/me','/api/dashboard','/api/account','/api/customers','/api/production/customers',
  '/api/partners','/api/assignments','/api/cases','/api/sales','/api/valuations','/api/campaigns',
  '/api/role-profiles','/api/partner-role-templates','/api/admin/users','/api/opportunity-engine',
  '/api/partner/workbench','/api/audit','/api/postal-codes','/api/portfolio/risks',
  '/api/admin-light-dashboard','/api/broker-dashboard','/api/broker/customers','/api/partner-coverage',
  '/api/partner-geography','/api/customer-coverage','/api/analytics/overview','/api/system-overview',
  '/api/partner-performance','/api/broker-ranking','/api/property-ranking','/api/referral',
  '/api/support-view/users','/api/support-view/start','/api/support-view/stop','/api/customer-invitations',
  '/api/access-management','/api/access-management/invitations',
  '/api/partner-basic/profile','/api/partner-basic/dashboard','/api/partner-basic/broker-properties',
  '/api/referral/invitations','/api/system/mail-test','/api/trigger-definitions','/api/trigger-events','/api/weather/dwd/preview',
  '/api/weather/dwd/sync','/api/production/customers/restore-all','/api/broker/sales-files'
]);
export const normalizedPath=path=>String(path||'').split('?')[0];
export const dynamicSupported=[
  /^\/api\/account\/legal\/[0-9a-f-]{36}\/file$/i,
  /^\/api\/partner-onboarding\/[0-9a-f-]{36}(?:\/(?:start|data|cancel))?$/i,
  /^\/api\/partner-onboarding\/[0-9a-f-]{36}\/legal(?:\/[0-9a-f-]{36}\/file)?$/i,
  /^\/api\/legal-documents\/[0-9a-f-]{36}(?:\/file)?$/i,
  /^\/api\/marketing-kit\/[0-9a-f-]{36}(?:\/file)?$/i,
  /^\/api\/equipment-schema\/[^/]+$/, /^\/api\/equipment\/[^/]+\/schema$/,
  /^\/api\/(?:cases|partners|equipment|service-records)\/[^/]+$/, /^\/api\/equipment\/[^/]+\/service-records$/,
  /^\/api\/partners\/[^/]+\/license$/, /^\/api\/partners\/[^/]+\/email$/, /^\/api\/trigger-definitions\/[^/]+$/,
  /^\/api\/role-profiles\/[^/]+$/, /^\/api\/partner-role-templates\/[^/]+$/,
  /^\/api\/campaigns\/[^/]+(?:\/(?:preview|source-verify|approve|activate))?$/,
  /^\/api\/broker\/sales-files\/[^/]+(?:\/(?:document-status|address-verification|mandate|closing|release))?$/,
  /^\/api\/customer-actions\/[^/]+\/respond$/, /^\/api\/partner-opportunities\/[^/]+\/complete$/,
  /^\/api\/production\/customers\/[^/]+$/, /^\/api\/production\/properties\/[^/]+\/address-verification$/,
  /^\/api\/properties\/[^/]+\/equipment$/
];
export const documentUploads=[/^\/api\/cases\/[^/]+\/documents$/, /^\/api\/broker\/sales-files\/[^/]+\/documents$/, /^\/api\/equipment\/[^/]+\/offers$/, /^\/api\/production\/properties\/[^/]+\/land-register$/];
export const publicPaths=[/^\/api\/partner-basic\/trades$/, /^\/api\/partner-basic\/register$/, /^\/api\/password\/forgot$/, /^\/api\/postal-codes$/, /^\/api\/referrals\/[^/]+(?:\/leads)?$/, /^\/api\/referral-invitations\/[^/]+$/, /^\/api\/customer-registration\/[^/]+$/, /^\/api\/partner-invitations\/[^/]+$/];
export const supportsPath=path=>supported.has(normalizedPath(path))||dynamicSupported.some(pattern=>pattern.test(normalizedPath(path)));
export const isDocumentUpload=path=>documentUploads.some(pattern=>pattern.test(normalizedPath(path)));
export const isPublicPath=path=>/^\/api\/onboarding-self-service\/(email|session)$/.test(normalizedPath(path))||/^\/api\/onboarding-invitations\/[0-9a-f-]{36}\/(inspect|register|claim)$/i.test(normalizedPath(path))||publicPaths.some(pattern=>pattern.test(normalizedPath(path)));
export const handlesRoute=path=>path==='/api/login'||path==='/api/logout'||isPublicPath(path)||supportsPath(path)||isDocumentUpload(path);
