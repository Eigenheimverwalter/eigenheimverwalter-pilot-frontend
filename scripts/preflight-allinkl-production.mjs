const checks = [];

async function read(url) {
  const response = await fetch(url, {
    headers: { Accept: 'application/json, text/javascript;q=0.9, text/plain;q=0.8' },
    redirect: 'error',
  });
  const body = await response.text();
  return { response, body };
}

function check(name, passed, detail) {
  checks.push({ name, passed, detail });
}

const runtimeUrl = 'https://eigenheimverwalter-pilot.de/runtime-config.js';
const coreHealthUrl = 'https://api.eigenheimverwalter.de/api/health';
const portalHealthUrl = 'https://api.eigenheimverwalter.de/api/v1/portal/health';
const proxyHealthUrl = 'https://eigenheimverwalter-pilot.de/portal-api.php?path=%2Fapi%2Fv1%2Fportal%2Fhealth';

try {
  const { response, body } = await read(runtimeUrl);
  check('runtime-config erreichbar', response.status === 200, `HTTP ${response.status}`);
  check('ALL-INKL ist alleiniger Runtime-Modus', /authMode\s*:\s*['"]allinkl['"]/.test(body) && /apiMode\s*:\s*['"]allinkl['"]/.test(body), 'authMode/apiMode');
  check('keine Supabase-Runtime-Konfiguration', !/supabase(?:\.co|Url|Key|Mode|Publishable)/i.test(body), 'Supabase-Markierungen');
} catch (error) {
  check('runtime-config erreichbar', false, error.message);
}

try {
  const { response, body } = await read(coreHealthUrl);
  check('EHV Core erreichbar', response.status === 200 && /API is running|"status"\s*:\s*true/i.test(body), `HTTP ${response.status}`);
} catch (error) {
  check('EHV Core erreichbar', false, error.message);
}

try {
  const { response, body } = await read(portalHealthUrl);
  check('Portal-API-Route aktiv', response.status === 200 && /"backend"\s*:\s*"allinkl"/i.test(body), `HTTP ${response.status}`);
} catch (error) {
  check('Portal-API-Route aktiv', false, error.message);
}

try {
  const { response, body } = await read(proxyHealthUrl);
  const contentType = response.headers.get('content-type') || '';
  check('Same-Origin-Proxy aktiv', response.status === 200 && /application\/json/i.test(contentType) && /"backend"\s*:\s*"allinkl"/i.test(body), `HTTP ${response.status}; ${contentType}`);
} catch (error) {
  check('Same-Origin-Proxy aktiv', false, error.message);
}

for (const item of checks) console.log(`${item.passed ? 'PASS' : 'FAIL'} ${item.name}: ${item.detail}`);
if (checks.some((item) => !item.passed)) {
  console.error('PRODUKTIONSFREIGABE GESPERRT');
  process.exitCode = 1;
} else {
  console.log('ÖFFENTLICHER ALL-INKL-PREFLIGHT BESTANDEN');
}
