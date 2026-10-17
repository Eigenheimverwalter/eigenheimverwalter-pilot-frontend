import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const root = new URL('../assets/', import.meta.url);
const files = (await readdir(root)).filter((name) => name.endsWith('.js'));
const routes = new Map();

for (const file of files) {
  const source = await readFile(new URL(file, root), 'utf8');
  const expression = /\bapi\(\s*([`'"])(\/api\/[^`'"]+)\1/g;
  for (const match of source.matchAll(expression)) {
    const route = match[2].replace(/\$\{[^}]+\}/g, ':id');
    if (!routes.has(route)) routes.set(route, new Set());
    routes.get(route).add(file);
  }
}

for (const [route, sources] of [...routes].sort(([a], [b]) => a.localeCompare(b))) {
  console.log(`${route}\t${[...sources].sort().join(', ')}`);
}
