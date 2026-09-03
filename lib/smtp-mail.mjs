import tls from 'node:tls';

export const MAIL_CHANNELS = {
  partner: { address: 'partner@eigenheimverwalter.de', user: 'm07c73cd', userKey: 'SMTP_PARTNER_USER', passwordKey: 'SMTP_PARTNER_PASSWORD' },
  registration: { address: 'registrierung@eigenheimverwalter.de', user: 'm0673807', userKey: 'SMTP_REGISTRATION_USER', passwordKey: 'SMTP_REGISTRATION_PASSWORD' },
  info: { address: 'info@eigenheimverwalter.de', user: 'info@eigenheimverwalter.de', userKey: 'SMTP_INFO_USER', passwordKey: 'SMTP_INFO_PASSWORD' }
};

export const channelForKind = kind => {
  const value=String(kind||'');
  if(value.startsWith('referral.')||value.startsWith('partner_basic.')||value.startsWith('auth.')||value.startsWith('customer.registration'))return 'registration';
  if(value.startsWith('customer.'))return 'info';
  return 'partner';
};

export function supabaseMailConfiguration(env = process.env) {
  const url = String(env.SUPABASE_MAIL_GATEWAY_URL || 'https://yfgieygxlpatmhdskmaa.supabase.co/functions/v1/sales-integrations').trim();
  const token = String(env.SUPABASE_MAIL_GATEWAY_TOKEN || env.SALES_OS_SYNC_TOKEN || '').trim();
  return { url, token, configured: env.MAIL_TRANSPORT === 'supabase' && /^https:\/\//.test(url) && token.length >= 32 };
}

export function portalMailConfiguration(channel = 'partner', env = process.env) {
  if (env.MAIL_TRANSPORT === 'supabase') {
    const gateway = supabaseMailConfiguration(env);
    if(gateway.configured)return { channel, from: MAIL_CHANNELS[channel]?.address || MAIL_CHANNELS.partner.address, provider: 'Supabase Mail Gateway · ALL-INKL', configured: true };
    const fallback=smtpConfiguration(channel,{...env,MAIL_TRANSPORT:'smtp'});
    return { channel, from: fallback.from, provider: 'ALL-INKL SMTP · sicherer Gateway-Fallback', configured: fallback.configured };
  }
  const smtp = smtpConfiguration(channel, env);
  return { channel, from: smtp.from, provider: 'ALL-INKL SMTP', configured: smtp.configured };
}

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

export async function sendPortalMail({ to, subject, text, kind, channel, env = process.env, transport = smtpConversation, fetchImpl = fetch }) {
  const selected = channel || channelForKind(kind);
  if (env.MAIL_TRANSPORT === 'supabase') {
    const gateway = supabaseMailConfiguration(env), sender = MAIL_CHANNELS[selected]?.address || MAIL_CHANNELS.partner.address;
    if (!gateway.configured) {
      const fallback=smtpConfiguration(selected,{...env,MAIL_TRANSPORT:'smtp'});
      if(!fallback.configured)return { status:'queued',sender,reason:'allinkl_smtp_not_configured',channel:selected };
      const result=await transport(fallback,{to,subject,text});
      return {...result,sender:fallback.from,channel:selected,provider:'ALL-INKL SMTP · sicherer Gateway-Fallback'};
    }
    const response = await fetchImpl(gateway.url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-pilot-mail-token': gateway.token }, body: JSON.stringify({ action: 'pilot_send_email', channel: selected, recipientEmail: to, subject, message: text }) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `Supabase-Mailgateway fehlgeschlagen (${response.status})`);
    return { status: payload.status === 'sent' ? 'sent' : 'queued', sender: payload.sender || sender, provider: 'Supabase Mail Gateway · ALL-INKL', providerId: payload.messageId || null, sentAt: payload.sentAt || null, channel: selected };
  }
  const config = smtpConfiguration(selected, env);
  if (!config.configured) return { status: 'queued', sender: config.from, reason: 'allinkl_smtp_not_configured', channel: selected };
  const result = await transport(config, { to, subject, text });
  return { ...result, sender: config.from, channel: selected };
}
