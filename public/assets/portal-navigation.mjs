// Keep authentication return links inside the configured portal deployment.
export function portalRootPath(basePath = '') {
  const base = String(basePath || '').replace(/^\/+|\/+$/g, '');
  if (!base) return '/';
  if (!/^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/.test(base)) {
    throw new Error('Ungültiger Portal-Basispfad');
  }
  return `/${base}/`;
}
