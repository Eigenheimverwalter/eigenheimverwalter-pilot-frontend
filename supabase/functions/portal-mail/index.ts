const PROJECT_REF = "rpniwtshbwjuesoeztyt";
const SMTP_HOST = "w01e0654.kasserver.com";
const SMTP_PORT = 465;

const channels = {
  partner: { address: "partner@eigenheimverwalter.de", defaultUser: "m07c73cd", userKey: "SMTP_PARTNER_USER", passwordKey: "SMTP_PARTNER_PASSWORD" },
  registration: { address: "registrierung@eigenheimverwalter.de", defaultUser: "m0673807", userKey: "SMTP_REGISTRATION_USER", passwordKey: "SMTP_REGISTRATION_PASSWORD" },
  info: { address: "info@eigenheimverwalter.de", defaultUser: "info@eigenheimverwalter.de", userKey: "SMTP_INFO_USER", passwordKey: "SMTP_INFO_PASSWORD" },
} as const;

type Channel = keyof typeof channels;
type MailRequest = { action?: string; channel?: string; recipientEmail?: string; subject?: string; message?: string };

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
});
const cleanHeader = (value: unknown, max: number) => String(value ?? "").replace(/[\r\n]/g, " ").trim().slice(0, max);
const validEmail = (value: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value) && value.length <= 254;
const base64 = (value: string) => {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
};
const safeEqual = (left: string, right: string) => {
  if (!left || left.length !== right.length) return false;
  let result = 0;
  for (let index = 0; index < left.length; index++) result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return result === 0;
};

async function smtpSend(channel: Channel, recipient: string, subject: string, message: string) {
  const definition = channels[channel];
  const user = Deno.env.get(definition.userKey) || definition.defaultUser;
  const password = Deno.env.get(definition.passwordKey) || "";
  if (!password) throw new Error(`Versandkanal ${channel} ist nicht konfiguriert`);

  const connection = await Deno.connectTls({ hostname: SMTP_HOST, port: SMTP_PORT });
  const encoder = new TextEncoder(), decoder = new TextDecoder();
  let buffered = "";
  const readResponse = async (expected: number[]) => {
    while (true) {
      const lines = buffered.split("\r\n");
      for (let index = 0; index < lines.length - 1; index++) {
        const match = lines[index].match(/^(\d{3})([ -])/);
        if (match?.[2] === " ") {
          buffered = lines.slice(index + 1).join("\r\n");
          const code = Number(match[1]);
          if (!expected.includes(code)) throw new Error(`SMTP-Antwort ${code}`);
          return;
        }
      }
      const chunk = new Uint8Array(4096);
      const count = await connection.read(chunk);
      if (count === null) throw new Error("SMTP-Verbindung unerwartet beendet");
      buffered += decoder.decode(chunk.subarray(0, count), { stream: true });
    }
  };
  const command = async (line: string, expected: number[]) => {
    await connection.write(encoder.encode(`${line}\r\n`));
    await readResponse(expected);
  };

  try {
    await readResponse([220]);
    await command("EHLO eigenheimverwalter.de", [250]);
    await command("AUTH LOGIN", [334]);
    await command(base64(user), [334]);
    await command(base64(password), [235]);
    await command(`MAIL FROM:<${definition.address}>`, [250]);
    await command(`RCPT TO:<${recipient}>`, [250, 251]);
    await command("DATA", [354]);
    const normalized = message.replace(/\r?\n/g, "\r\n").replace(/^\./gm, "..");
    const data = [
      `From: eigenheimverwalter <${definition.address}>`,
      `To: <${recipient}>`,
      `Subject: =?UTF-8?B?${base64(subject)}?=`,
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: base64",
      "",
      base64(normalized),
      ".",
    ].join("\r\n");
    await connection.write(encoder.encode(`${data}\r\n`));
    await readResponse([250]);
    await command("QUIT", [221]);
  } finally {
    connection.close();
  }
  return { status: "sent", sender: definition.address, sentAt: new Date().toISOString(), messageId: crypto.randomUUID() };
}

async function httpsSend(channel: Channel, recipient: string, subject: string, message: string) {
  const apiKey = Deno.env.get("RESEND_API_KEY") || "";
  if (!apiKey) return null;
  const definition = channels[channel];
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: `eigenheimverwalter <${definition.address}>`,
      reply_to: definition.address,
      to: [recipient],
      subject,
      text: message,
    }),
  });
  const payload = await response.json().catch(() => ({})) as { id?: string; message?: string; name?: string };
  if (!response.ok) throw new Error(`HTTPS-Mailprovider: ${payload.message || payload.name || response.status}`);
  return { status: "sent", sender: definition.address, sentAt: new Date().toISOString(), messageId: payload.id || crypto.randomUUID() };
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (req.method === "GET" && url.pathname.endsWith("/health")) {
    return json({ service: "ehv-pilot-portal-mail", projectRef: PROJECT_REF, status: "ok" });
  }
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supplied = req.headers.get("x-pilot-mail-token") || "";
  const expected = Deno.env.get("PILOT_MAIL_GATEWAY_TOKEN") || "";
  if (expected.length < 48 || !safeEqual(supplied, expected)) return json({ error: "Nicht autorisiert" }, 401);

  let body: MailRequest;
  try { body = await req.json(); } catch { return json({ error: "Ungültiges JSON" }, 400); }
  const channel = cleanHeader(body.channel, 32) as Channel;
  const recipient = cleanHeader(body.recipientEmail, 254).toLowerCase();
  const subject = cleanHeader(body.subject, 180);
  const message = String(body.message ?? "").trim().slice(0, 50_000);
  if (body.action !== "pilot_send_email" || !(channel in channels) || !validEmail(recipient) || !subject || !message) {
    return json({ error: "Ungültige oder unvollständige Versanddaten" }, 422);
  }
  try { return json(await httpsSend(channel, recipient, subject, message) || await smtpSend(channel, recipient, subject, message)); }
  catch (error) {
    const detail = error instanceof Error ? error.message.slice(0, 200) : "Unbekannter SMTP-Fehler";
    console.error(JSON.stringify({ event: "portal_mail_failed", channel, detail }));
    return json({ error: "Mailversand fehlgeschlagen", detail }, 502);
  }
});
