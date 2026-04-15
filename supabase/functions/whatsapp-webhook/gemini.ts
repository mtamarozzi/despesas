import { GEMINI_RESPONSE_SCHEMA } from "./schemas.ts";
import { EXPENSE_SYSTEM_PROMPT } from "./prompts.ts";
import type { GeminiResult } from "./types.ts";
import { log } from "./utils.ts";

const MODEL = "gemini-2.5-flash";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

interface GeminiRawResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
  }>;
  promptFeedback?: { blockReason?: string };
}

interface GeminiEnvelope {
  intent: "expense" | "unknown";
  expense?: {
    descricao: string;
    valor: number;
    categoria: "Habitação" | "Alimentação" | "Transporte" | "Lazer" | "Vestuário" | "Outros";
    data: string;
    status: "pago" | "pendente";
  } | null;
  erro?: string | null;
}

export async function interpret(message: string, todayISO: string): Promise<GeminiResult> {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) throw new Error("GEMINI_API_KEY secret missing");

  const systemPrompt = EXPENSE_SYSTEM_PROMPT.replaceAll("{{TODAY_ISO}}", todayISO);
  const started = Date.now();

  const res = await fetch(`${ENDPOINT}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: "user", parts: [{ text: message }] }],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: "application/json",
        responseSchema: GEMINI_RESPONSE_SCHEMA,
      },
    }),
  });

  const latency_ms = Date.now() - started;

  if (!res.ok) {
    const body = await res.text();
    log("gemini_http_error", { status: res.status, body: body.slice(0, 400), latency_ms });
    throw new Error(`Gemini HTTP ${res.status}`);
  }

  const raw = (await res.json()) as GeminiRawResponse;
  const text = raw.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  if (!text) {
    log("gemini_empty_response", { finishReason: raw.candidates?.[0]?.finishReason, latency_ms });
    throw new Error("Gemini returned no text");
  }

  let envelope: GeminiEnvelope;
  try {
    envelope = JSON.parse(text) as GeminiEnvelope;
  } catch (err) {
    log("gemini_parse_error", { text: text.slice(0, 200), error: (err as Error).message });
    throw new Error("Gemini returned invalid JSON");
  }

  log("gemini_interpreted", { intent: envelope.intent, has_erro: !!envelope.erro, latency_ms });

  return {
    intent: envelope.intent,
    payload: envelope.expense ?? undefined,
    erro: envelope.erro ?? undefined,
  };
}
