import type { EvolutionWebhookEvent, WhatsappUser } from "./types.ts";
import { getServiceClient } from "./supabase-client.ts";
import { sendText } from "./evolution.ts";
import { interpret } from "./gemini.ts";
import { registerExpense } from "./handlers/expense.ts";
import { undoLastExpense } from "./handlers/undo.ts";
import {
  clearPendingContext,
  getPendingContext,
  savePendingContext,
} from "./handlers/context.ts";
import { extractText, log, stripWhatsappJid, todayISO } from "./utils.ts";
import {
  msgNonText,
  msgRateLimited,
  msgSystemError,
  msgUnauthorized,
  msgUnknown,
} from "./messages.ts";
import { logAudit } from "./audit.ts";
import { isRateLimited } from "./rate-limit.ts";

Deno.serve(async (req: Request) => {
  const started = Date.now();
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
  const rawText = extractText(data.message).trim();

  const { data: seen } = await supabase
    .from("whatsapp_messages_seen")
    .select("message_id")
    .eq("message_id", messageId)
    .maybeSingle();
  if (seen) {
    log("duplicate_event", { message_id: messageId });
    await logAudit({
      message_id: messageId,
      phone_number: phone,
      direction: "inbound",
      action: "duplicate_ignored",
      success: true,
      raw_text: rawText,
    });
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
    await sendText(phone, msgUnauthorized());
    await logAudit({
      message_id: messageId,
      phone_number: phone,
      direction: "inbound",
      action: "unauthorized",
      success: true,
      latency_ms: Date.now() - started,
      raw_text: rawText,
    });
    return new Response("ok", { status: 200 });
  }

  if (await isRateLimited(phone)) {
    await sendText(phone, msgRateLimited());
    await logAudit({
      message_id: messageId,
      phone_number: phone,
      direction: "inbound",
      action: "rate_limited",
      success: true,
      latency_ms: Date.now() - started,
      raw_text: rawText,
    });
    return new Response("ok", { status: 200 });
  }

  if (!rawText) {
    await sendText(phone, msgNonText());
    await logAudit({
      message_id: messageId,
      phone_number: phone,
      direction: "inbound",
      action: "non_text",
      success: true,
      latency_ms: Date.now() - started,
    });
    return new Response("ok", { status: 200 });
  }

  try {
    const pending = await getPendingContext(phone);
    const combinedText = pending ? `${pending}\n${rawText}` : rawText;
    log("interpreting", { phone, has_pending: !!pending, length: combinedText.length });

    const result = await interpret(combinedText, todayISO());

    if (result.intent === "undo") {
      const { message, action } = await undoLastExpense(user);
      await clearPendingContext(phone);
      await sendText(phone, message);
      await logAudit({
        message_id: messageId,
        phone_number: phone,
        direction: "inbound",
        intent: "undo",
        action,
        success: true,
        latency_ms: Date.now() - started,
        raw_text: rawText,
      });
      return new Response("ok", { status: 200 });
    }

    if (result.intent === "expense" && result.payload) {
      const confirmation = await registerExpense(user, result.payload);
      await clearPendingContext(phone);
      await sendText(phone, confirmation);
      await logAudit({
        message_id: messageId,
        phone_number: phone,
        direction: "inbound",
        intent: "expense",
        action: "expense_inserted",
        success: true,
        latency_ms: Date.now() - started,
        raw_text: rawText,
      });
      return new Response("ok", { status: 200 });
    }

    if (result.intent === "expense" && result.erro) {
      await savePendingContext(phone, combinedText, result.erro);
      await sendText(phone, result.erro);
      await logAudit({
        message_id: messageId,
        phone_number: phone,
        direction: "inbound",
        intent: "expense",
        action: "context_saved",
        success: true,
        latency_ms: Date.now() - started,
        raw_text: rawText,
      });
      return new Response("ok", { status: 200 });
    }

    await clearPendingContext(phone);
    await sendText(phone, msgUnknown());
    await logAudit({
      message_id: messageId,
      phone_number: phone,
      direction: "inbound",
      intent: "unknown",
      action: "unknown_intent",
      success: true,
      latency_ms: Date.now() - started,
      raw_text: rawText,
    });
    return new Response("ok", { status: 200 });
  } catch (err) {
    const errorMsg = (err as Error).message;
    log("handler_error", { error: errorMsg, phone });
    await sendText(phone, msgSystemError());
    await logAudit({
      message_id: messageId,
      phone_number: phone,
      direction: "inbound",
      action: "handler_error",
      success: false,
      latency_ms: Date.now() - started,
      error_code: errorMsg.slice(0, 100),
      raw_text: rawText,
    });
    return new Response("ok", { status: 200 });
  }
});
