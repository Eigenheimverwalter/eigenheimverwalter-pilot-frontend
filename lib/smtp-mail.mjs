import tls from 'node:tls';

export const MAIL_CHANNELS = {
  partner: { address: 'partner@eigenheimverwalter.de', user: 'm07c73cd', userKey: 'SMTP_PARTNER_USER', passwordKey: 'SMTP_PARTNER_PASSWORD' },
  registration: { address: 'registrierung@eigenheimverwalter.de', user: 'm0673807', userKey: 'SMTP_REGISTRATION_USER', passwordKey: 'SMTP_REGISTRATION_PASSWORD' }
};

export const channelForKind = kind => String(kind || '').startsWith('referral.') || String(kind || '').startsWith('partner_basic.') || String(kind || '').startsWith('auth.') ? 'registration' : 'partner';

export function smtpConfiguration(channel = 'partner', env = process.env) {
  const definition = MAIL_CHANNELS[channel] || MAIL_CHANNELS.partner;
  const host = String(env.SMTP_HOST || 'w01e0654.kasserver.com').trim();
  const user = String(env[definition.userKey] || definition.user).trim();
  const password = String(env[definition.passwordKey] || '');
  return { channel, host, port: Number(env.SMTP_PORT || 465), secure: true, user, password, from: definition.address, configured: env.MAIL_TRANSPORT === 'smtp' && Boolean(host && user && password) };
}

const encodeHeader = value => `=?UTF-8?B?${Buffer.from(String(value || ''), 'utf8').toString('base64')}?=`;
const normalizeBody = value => String(value || '').replace(/\r?\n/g, '\r\n').replace(/^\./gm, '..');

async function smtpConversation(config, envelope) {
  const socket = tls.connect({ host: config.host, port: config.port, servername: config.host, rejectUnauthorized: true });
  socket.setTimeout(15000);
  let buffer = '', waiter;
  socket.setEncoding('utf8');
  socket.on('data', chunk => { buffer += chunk; waiter?.(); });
  const response = async expected => {
    while (true) {
      const lines = buffer.split('\r\n');
      for (let index = 0; index < lines.length - 1; index++) {
        const match = lines[index].match(/^(\d{3})([ -])/);
        if (match?.[2] === ' ') {
          const block = lines.splice(0, index + 1).join('\r\n');
          buffer = lines.join('\r\n');
          if (!expected.includes(Number(match[1]))) throw new Error(`SMTP-Antwort ${match[1]} statt ${expected.join('/')}`);
          return block;
        }
      }
      await new Promise((resolve, reject) => {
        const cleanup = () => { waiter = null; socket.off('error', fail); socket.off('timeout', fail); };
        const wake = () => { cleanup(); resolve(); };
        const fail = error => { cleanup(); reject(error instanceof Error ? error : new Error('SMTP-Zeitüberschreitung')); };
        waiter = wake; socket.once('error', fail); socket.once('timeout', fail);
      });
    }
  };
  const command = async (line, expected) => { socket.write(`${line}\r\n`); return response(expected); };
  try {
    await response([220]);
    await command(`EHLO ${String(process.env.SMTP_HELO || 'eigenheimverwalter.de').replace(/[^a-z0-9.-]/gi, '')}`, [250]);
    await command('AUTH LOGIN', [334]);
    await command(Buffer.from(config.user).toString('base64'), [334]);
    await command(Buffer.from(config.password).toString('base64'), [235]);
    await command(`MAIL FROM:<${config.from}>`, [250]);
    await command(`RCPT TO:<${envelope.to}>`, [250, 251]);
    await command('DATA', [354]);
    const body = [`From: eigenheimverwalter <${config.from}>`, `To: <${envelope.to}>`, `Subject: ${encodeHeader(envelope.subject)}`, 'MIME-Version: 1.0', 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', Buffer.from(normalizeBody(envelope.text), 'utf8').toString('base64'), '.'].join('\r\n');
    socket.write(`${body}\r\n`);
    await response([250]);
    await command('QUIT', [221]);
    return { status: 'sent', sentAt: new Date().toISOString(), provider: 'ALL-INKL SMTP' };
  } finally { socket.destroy(); }
}

export async function sendPortalMail({ to, subject, text, kind, channel, env = process.env, transport = smtpConversation }) {
  const selected = channel || channelForKind(kind), config = smtpConfiguration(selected, env);
  if (!config.configured) return { status: 'queued', sender: config.from, reason: 'allinkl_smtp_not_configured', channel: selected };
  const result = await transport(config, { to, subject, text });
  return { ...result, sender: config.from, channel: selected };
}
