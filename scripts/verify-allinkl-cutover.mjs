import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.argv[2] || path.join(import.meta.dirname, '..'));
const walk=directory=>fs.readdirSync(directory,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?walk(path.join(directory,entry.name)):[path.join(directory,entry.name)]);
const files = walk(root).filter(file=>/\.(?:html?|js|mjs|php|json|css|htaccess)$/i.test(file));

const forbidden = [
  /supabase\.co/i,
  /supabasePublishableKey/i,
  /authMode\s*:\s*["']supabase["']/i,
  /apiMode\s*:\s*["']supabase["']/i,
  /functions\/v1\/portal-api/i,
  /functions\/v1\/portal-public/i,
];

const failures = [];
for (const absolute of files) {
  const relative=path.relative(root,absolute).replaceAll('\\','/');
  const source = fs.readFileSync(absolute, 'utf8');
  for (const pattern of forbidden) {
    if (pattern.test(source)) failures.push(`${relative}: verbotener Verweis ${pattern}`);
  }
}

if (failures.length) {
  console.error('ALL-INKL-Cutover NICHT freigabefähig:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('ALL-INKL-Cutover: statische Supabase-Sperrprüfung bestanden.');
