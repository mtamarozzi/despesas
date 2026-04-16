import { GEMINI_RESPONSE_SCHEMA, IMAGE_EXPENSE_SCHEMA } from "./schemas.ts";
import { EXPENSE_SYSTEM_PROMPT, IMAGE_SYSTEM_PROMPT } from "./prompts.ts";
import type { ExpenseExtraction, GeminiResult } from "./types.ts";
import { log } from "./utils.ts";

const MODEL = "gemini-2.5-flash";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

const MAX_ATTEMPTS = 3;
const BACKOFF_MS = [400, 1200];
const RETRIABLE_STATUS = new Set([429, 500, 502, 503, 504]);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface GeminiRawResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
  }>;
  promptFeedback?: { blockReason?: string };
}

interface GeminiEnvelope {
  intent: "expense" | "query" | "unknown" | "undo";
  expense?: {
    descricao: string;
    valor: number;
    categoria: "Habitação" | "Alimentação" | "Transporte" | "Lazer" | "Vestuário" | "Outros";
    data: string;
    status: "pago" | "pendente";
  } | null;
  query?: {
    period: "today" | "week" | "month" | "custom";
    category?: string;
    user_name?: string;
    custom_start?: string;
    custom_end?: string;
  } | null;
  erro?: string | null;
}

export interface ImageGeminiEnvelope {
  intent: "expense" | "unsupported";
  payload?: ExpenseExtraction | null;
  motivo?: string | null;
}

export interface ImageGeminiResult {
  intent: "expense" | "unsupported";
  payload?: ExpenseExtraction;
  motivo?: string;
}

interface CallGeminiResult<T> {
  parsed: T;
  latency_ms: number;
}

async function callGemini<T>(body: string, logPrefix: string): Promise<CallGeminiResult<T>> {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) throw new Error("GEMINI_API_KEY secret missing");

  const started = Date.now();
  let res: Response | undefined;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const attemptStart = Date.now();
    res = await fetch(`${ENDPOINT}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });

    if (res.ok) break;

    const errBody = await res.text();
    log(`${logPrefix}_http_error`, {
      status: res.status,
      body: errBody.slice(0, 400),
      attempt,
      attempt_latency_ms: Date.now() - attemptStart,
    });

    if (!RETRIABLE_STATUS.has(res.status) || attempt === MAX_ATTEMPTS) {
      throw new Error(`${logPrefix} HTTP ${res.status}`);
    }

    await sleep(BACKOFF_MS[attempt - 1]);
  }

  const latency_ms = Date.now() - started;

  if (!res || !res.ok) {
    throw new Error(`${logPrefix} HTTP failure after retries`);
  }

  const raw = (await res.json()) as GeminiRawResponse;
  const text = raw.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  if (!text) {
    log(`${logPrefix}_empty_response`, { finishReason: raw.candidates?.[0]?.finishReason, latency_ms });
    throw new Error(`${logPrefix} returned no text`);
  }

  let parsed: T;
  try {
    parsed = JSON.parse(text) as T;
  } catch (err) {
    log(`${logPrefix}_parse_error`, { text: text.slice(0, 200), error: (err as Error).message });
    throw new Error(`${logPrefix} returned invalid JSON`);
  }

  return { parsed, latency_ms };
}

export async function interpret(message: string, todayISO: string): Promise<GeminiResult> {
  const systemPrompt = EXPENSE_SYSTEM_PROMPT.replaceAll("{{TODAY_ISO}}", todayISO);
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: [{ role: "user", parts: [{ text: message }] }],
    generationConfig: {
      temperature: 0.2,
      responseMimeType: "application/json",
      responseSchema: GEMINI_RESPONSE_SCHEMA,
    },
  });

  const { parsed: envelope, latency_ms } = await callGemini<GeminiEnvelope>(body, "gemini");

  log("gemini_interpreted", { intent: envelope.intent, has_erro: !!envelope.erro, latency_ms });

  return {
    intent: envelope.intent,
    payload: envelope.expense ?? undefined,
    queryPayload: envelope.query ?? undefined,
    erro: envelope.erro ?? undefined,
  };
}

export async function interpretImage(
  base64: string,
  mimetype: string,
  caption: string,
  todayISO: string,
): Promise<ImageGeminiResult> {
  const systemPrompt = IMAGE_SYSTEM_PROMPT.replaceAll("{{TODAY_ISO}}", todayISO);
  const captionPart = caption.trim()
    ? `Legenda do usuário (delimitada): <<<${caption.trim()}>>>`
    : "Sem legenda do usuário.";

  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: [{
      role: "user",
      parts: [
        { inlineData: { mimeType: mimetype, data: base64 } },
        { text: captionPart },
      ],
    }],
    generationConfig: {
      temperature: 0.2,
      responseMimeType: "application/json",
      responseSchema: IMAGE_EXPENSE_SCHEMA,
    },
  });

  const { parsed: envelope, latency_ms } = await callGemini<ImageGeminiEnvelope>(body, "gemini_image");

  log("gemini_image_interpreted", { intent: envelope.intent, has_motivo: !!envelope.motivo, latency_ms });

  return {
    intent: envelope.intent,
    payload: envelope.payload ?? undefined,
    motivo: envelope.motivo ?? undefined,
  };
}
