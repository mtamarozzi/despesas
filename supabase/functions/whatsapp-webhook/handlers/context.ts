// whatsapp_context helpers — fluxo de clarificação multi-turno.

import { getServiceClient } from "../supabase-client.ts";
import { log } from "../utils.ts";

interface PendingPayload {
  text: string;
}

export async function getPendingContext(phone: string): Promise<string | null> {
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("whatsapp_context")
    .select("pending_payload, expires_at")
    .eq("phone_number", phone)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (error) {
    log("context_read_error", { error: error.message, phone });
    return null;
  }
  if (!data) return null;
  const payload = data.pending_payload as PendingPayload | null;
  return payload?.text ?? null;
}

export async function savePendingContext(
  phone: string,
  combinedText: string,
  question: string,
): Promise<void> {
  const supabase = getServiceClient();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  const { error } = await supabase.from("whatsapp_context").upsert(
    {
      phone_number: phone,
      pending_payload: { text: combinedText } as PendingPayload,
      question,
      expires_at: expiresAt,
    },
    { onConflict: "phone_number" },
  );
  if (error) {
    log("context_save_error", { error: error.message, phone });
    throw error;
  }
}

export async function clearPendingContext(phone: string): Promise<void> {
  const supabase = getServiceClient();
  await supabase.from("whatsapp_context").delete().eq("phone_number", phone);
}
