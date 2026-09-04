const configuredOrigin = Deno.env.get("APP_ORIGIN") ?? "https://eigenheimverwalter.de";

const allowed = (value: string) => {
  try {
    const url = new URL(value), host = url.hostname.toLowerCase();
    if (url.protocol === "http:" && (host === "localhost" || host === "127.0.0.1")) return true;
    if (url.protocol !== "https:") return false;
    return host === "eigenheimverwalter.de" || host.endsWith(".eigenheimverwalter.de")
      || host === "eigenheimverwalter-pilot.de" || host.endsWith(".eigenheimverwalter-pilot.de")
      || host === "eigenheimverkauf.com" || host.endsWith(".eigenheimverkauf.com")
      || host === "eigenheimverwalter.github.io"
      || host === "eigenheimverwalter-pilot-admin-test.onrender.com";
  } catch { return false; }
};

export const corsHeaders = (req?: Request) => {
  const requested = req?.headers.get("Origin")?.trim() || "";
  const origin = requested ? (allowed(requested) ? requested : "") : configuredOrigin;
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-ehv-support-user",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Vary": "Origin",
  };
  if (origin) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
};
