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
