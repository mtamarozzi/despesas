// Log estruturado na tabela whatsapp_audit_log.
// Nunca deve quebrar o fluxo principal do webhook — falhas aqui são só logadas no console.

import { getServiceClient } from "./supabase-client.ts";

export interface AuditEntry {
  message_id?: string;
  phone_number: string;
  direction: "inbound" | "outbound";
  intent?: string;
  action?: string;
  success: boolean;
  latency_ms?: number;
  error_code?: string;
  raw_text?: string;
}

export async function logAudit(entry: AuditEntry): Promise<void> {
  try {
    const supabase = getServiceClient();
    const { error } = await supabase.from("whatsapp_audit_log").insert(entry);
    if (error) {
      console.error(JSON.stringify({ event: "audit_insert_error", error: error.message }));
    }
  } catch (err) {
    console.error(JSON.stringify({ event: "audit_insert_exception", error: (err as Error).message }));
  }
}
