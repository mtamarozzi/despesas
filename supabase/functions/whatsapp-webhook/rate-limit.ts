// Rate limit por número: janela deslizante de 1 hora no whatsapp_audit_log.
// Se o número já tem >= RATE_LIMIT_PER_HOUR linhas inbound nos últimos 60min,
// bloqueia antes de chamar o Gemini.

import { getServiceClient } from "./supabase-client.ts";
import { log } from "./utils.ts";

export const RATE_LIMIT_PER_HOUR = 30;
const WINDOW_MS = 60 * 60 * 1000;

export async function isRateLimited(phone: string): Promise<boolean> {
  const supabase = getServiceClient();
  const cutoff = new Date(Date.now() - WINDOW_MS).toISOString();

  const { count, error } = await supabase
    .from("whatsapp_audit_log")
    .select("id", { count: "exact", head: true })
    .eq("phone_number", phone)
    .eq("direction", "inbound")
    .gt("ts", cutoff);

  if (error) {
    log("rate_limit_query_failed", { error: error.message, phone });
    return false;
  }

  const current = count ?? 0;
  if (current >= RATE_LIMIT_PER_HOUR) {
    log("rate_limit_hit", { phone, count: current, limit: RATE_LIMIT_PER_HOUR });
    return true;
  }
  return false;
}
