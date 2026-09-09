import qrcode from './vendor/qrcode-generator-2.0.4.mjs';

// Encode the existing public partner link, never credentials or customer data.
export function makeReferralQr(link) {
  const url = new URL(link);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || !/\/ref\/[^/]+$/.test(url.pathname)) {
    throw new Error('Ungültiger Empfehlungslink');
  }
  const qr = qrcode(0, 'M');
  qr.addData(url.href, 'Byte');
  qr.make();
  const size = qr.getModuleCount();
  return {
    link: url.href,
    size,
    modules: Array.from({length:size}, (_,row) => Array.from({length:size}, (_,col) => qr.isDark(row,col))),
    svg: qr.createSvgTag({cellSize:6,margin:24,scalable:true}),
  };
}
