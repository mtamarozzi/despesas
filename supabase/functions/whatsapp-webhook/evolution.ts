import { log } from "./utils.ts";

const BASE_URL = "https://evolution-evolution-api.u9givm.easypanel.host";
const INSTANCE = "casaflow";

function getApiKey(): string {
  const key = Deno.env.get("EVOLUTION_API_KEY");
  if (!key) throw new Error("EVOLUTION_API_KEY secret missing");
  return key;
}

export async function sendText(phoneNumber: string, text: string): Promise<void> {
  const url = `${BASE_URL}/message/sendText/${INSTANCE}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: getApiKey(),
    },
    body: JSON.stringify({ number: phoneNumber, text }),
  });
  if (!res.ok) {
    const body = await res.text();
    log("evolution_send_failed", { status: res.status, body, phone: phoneNumber });
    throw new Error(`Evolution sendText failed: ${res.status}`);
  }
  log("evolution_sent", { phone: phoneNumber, chars: text.length });
}

export interface MediaDownloadResult {
  base64: string;
  mimetype: string;
}

export async function getMediaBase64(messageId: string): Promise<MediaDownloadResult> {
  const url = `${BASE_URL}/chat/getBase64FromMediaMessage/${INSTANCE}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: getApiKey(),
    },
    body: JSON.stringify({ message: { key: { id: messageId } } }),
  });
  if (!res.ok) {
    const body = await res.text();
    log("evolution_media_failed", { status: res.status, body: body.slice(0, 300), message_id: messageId });
    throw new Error(`Evolution getMediaBase64 failed: ${res.status}`);
  }
  const json = (await res.json()) as { base64?: string; mimetype?: string };
  if (!json.base64 || !json.mimetype) {
    log("evolution_media_invalid", { has_base64: !!json.base64, has_mimetype: !!json.mimetype, message_id: messageId });
    throw new Error("Evolution getMediaBase64 returned invalid payload");
  }
  log("evolution_media_downloaded", { message_id: messageId, mimetype: json.mimetype, size_bytes: json.base64.length });
  return { base64: json.base64, mimetype: json.mimetype };
}
