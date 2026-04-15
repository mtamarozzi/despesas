import type { EvolutionWebhookEvent, WhatsappUser } from "./types.ts";
import { getServiceClient } from "./supabase-client.ts";
import { sendText } from "./evolution.ts";
import { interpret } from "./gemini.ts";
import { registerExpense } from "./handlers/expense.ts";
import { extractText, log, stripWhatsappJid, todayISO } from "./utils.ts";

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  const expectedToken = Deno.env.get("EVOLUTION_WEBHOOK_TOKEN");
  const authHeader = req.headers.get("authorization") ?? "";
  if (!expectedToken || authHeader !== `Bearer ${expectedToken}`) {
    log("auth_rejected", { reason: "bad_or_missing_token" });
    return new Response("Unauthorized", { status: 401 });
  }

  let event: EvolutionWebhookEvent;
  try {
    event = (await req.json()) as EvolutionWebhookEvent;
  } catch (err) {
    log("bad_payload", { error: (err as Error).message });
    return new Response("Bad Request", { status: 400 });
  }

  const { data } = event ?? {};
  if (!data?.key) return new Response("ok", { status: 200 });

  if (data.key.fromMe === true) {
    log("ignored_self_message", { id: data.key.id });
    return new Response("ok", { status: 200 });
  }

  const supabase = getServiceClient();
  const phone = stripWhatsappJid(data.key.remoteJid);
  const messageId = data.key.id;

  const { data: seen } = await supabase
    .from("whatsapp_messages_seen")
    .select("message_id")
    .eq("message_id", messageId)
    .maybeSingle();
  if (seen) {
    log("duplicate_event", { message_id: messageId });
    return new Response("ok", { status: 200 });
  }
  await supabase
    .from("whatsapp_messages_seen")
    .insert({ message_id: messageId, phone_number: phone });

  const { data: userRow } = await supabase
    .from("whatsapp_users")
    .select("phone_number,user_id,household_id,display_name,active")
    .eq("phone_number", phone)
    .eq("active", true)
    .maybeSingle();
  const user = userRow as WhatsappUser | null;

  if (!user) {
    log("unauthorized_number", { phone });
    await sendText(phone, "Número não autorizado no CasaFlow.");
    return new Response("ok", { status: 200 });
  }

  const text = extractText(data.message).trim();
  if (!text) {
    await sendText(phone, "Só entendo mensagens de texto por enquanto. Em breve: áudio e foto.");
    return new Response("ok", { status: 200 });
  }

  try {
    const result = await interpret(text, todayISO());
    if (result.intent === "expense" && result.payload) {
      const confirmation = await registerExpense(user, result.payload);
      await sendText(phone, confirmation);
    } else {
      await sendText(phone, "Ainda não entendi essa mensagem. Tenta algo como: \"paguei 120 de luz hoje\".");
    }
  } catch (err) {
    log("handler_error", { error: (err as Error).message, phone });
    await sendText(phone, "⚠️ Tive um problema agora. Pode tentar de novo em alguns segundos?");
  }

  return new Response("ok", { status: 200 });
});
