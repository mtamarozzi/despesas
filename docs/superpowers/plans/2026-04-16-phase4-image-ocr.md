# Fase 4 — OCR de imagens (cupom + Pix) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aceitar fotos de cupom fiscal e prints de comprovante Pix/transferência no webhook do WhatsApp, extrair via Gemini multimodal e registrar como despesa em um único turno.

**Architecture:** Adicionar branch `imageMessage` ao switch de `messageType` no `index.ts`. Novo `handlers/image.ts` orquestra `getMediaBase64` (Evolution) → `interpretImage` (Gemini multimodal) → `registerExpense` (reuso). Caption do usuário entra como contexto extra na mesma chamada Gemini. Sem migration, sem storage de imagem, sem confirmação interativa (UX cobre erros via `/desfazer`).

**Tech Stack:** Deno + Supabase Edge Functions, Gemini 2.5 Flash multimodal (`inlineData`), Evolution API (`/chat/getBase64FromMediaMessage/casaflow`), TypeScript.

**Spec de origem:** `docs/superpowers/specs/2026-04-16-phase4-image-ocr-design.md`

---

## File Structure

**Criar:**
- `supabase/functions/whatsapp-webhook/handlers/image.ts` — orquestrador do fluxo de imagem
- `tests/whatsapp-webhook/fixtures/image_cupom_fiscal.json` — payload Evolution real (gravar 1ª vez)
- `tests/whatsapp-webhook/fixtures/image_cupom_com_caption.json`
- `tests/whatsapp-webhook/fixtures/image_pix.json`
- `tests/whatsapp-webhook/fixtures/image_unsupported.json`
- `tests/whatsapp-webhook/fixtures/image_malformed.json`
- `tests/whatsapp-webhook/test-image.http` — script REST Client

**Modificar:**
- `supabase/functions/whatsapp-webhook/schemas.ts` — adicionar `IMAGE_EXPENSE_SCHEMA` e `IMAGE_INTENT_ENUM`
- `supabase/functions/whatsapp-webhook/prompts.ts` — adicionar `IMAGE_SYSTEM_PROMPT`
- `supabase/functions/whatsapp-webhook/evolution.ts` — adicionar `getMediaBase64()`
- `supabase/functions/whatsapp-webhook/gemini.ts` — adicionar `interpretImage()`
- `supabase/functions/whatsapp-webhook/messages.ts` — adicionar `msgImageUnsupported()` e `msgImageDownloadError()`
- `supabase/functions/whatsapp-webhook/index.ts` — substituir branch `if (!rawText)` por `switch(messageType)`
- `docs/RELATORIO_CASAFLOW_WHATSAPP.md` — registrar Fase 4 concluída
- `docs/PLANO_CONTINUIDADE.md` — atualizar bloco "Status atual"

**Não muda:**
- `types.ts` (`EvolutionMessageContent.imageMessage` já existe)
- `handlers/expense.ts`, `handlers/query.ts`, `handlers/undo.ts`, `handlers/context.ts`
- `audit.ts`, `rate-limit.ts`, `supabase-client.ts`, `utils.ts`
- Banco de dados (sem migration)

---

## Task 1: Schema do Gemini multimodal

**Files:**
- Modify: `supabase/functions/whatsapp-webhook/schemas.ts`

- [ ] **Step 1: Adicionar enum e schema novos**

Abra `schemas.ts` e adicione ao final do arquivo:

```ts
export const IMAGE_INTENT_ENUM = ["expense", "unsupported"] as const;

export const IMAGE_EXPENSE_SCHEMA = {
  type: "object",
  properties: {
    intent: { type: "string", enum: [...IMAGE_INTENT_ENUM] },
    payload: {
      type: "object",
      nullable: true,
      properties: {
        descricao: { type: "string" },
        valor: { type: "number" },
        categoria: { type: "string", enum: [...CATEGORIAS] },
        data: { type: "string" },
        status: { type: "string", enum: [...STATUS_ENUM] },
      },
      required: ["descricao", "valor", "categoria", "data", "status"],
    },
    motivo: { type: "string", nullable: true },
  },
  required: ["intent"],
} as const;
```

- [ ] **Step 2: Type-check**

Run (do diretório `ethereal-ledger/`):
```
deno check supabase/functions/whatsapp-webhook/schemas.ts
```
Expected: nenhum erro.

---

## Task 2: Prompt do Gemini multimodal

**Files:**
- Modify: `supabase/functions/whatsapp-webhook/prompts.ts`

- [ ] **Step 1: Adicionar `IMAGE_SYSTEM_PROMPT`**

Abra `prompts.ts` e adicione ao final do arquivo:

```ts
export const IMAGE_SYSTEM_PROMPT = `Você é o interpretador visual do CasaFlow. Recebe UMA imagem (cupom fiscal OU comprovante de Pix/TED/transferência bancária) e opcionalmente uma legenda do usuário.

Data de referência ("hoje"): {{TODAY_ISO}}.

Regras de classificação:
- Se a imagem é cupom fiscal/nota: intent="expense". valor = TOTAL da nota; descricao = nome curto do estabelecimento (max 4 palavras, minúsculo, sem verbo); data = data impressa no cupom (se ilegível, use {{TODAY_ISO}}); status="pago".
- Se a imagem é comprovante Pix/TED/transferência: intent="expense". valor = valor transferido; descricao = "pix <destinatário>" ou "transferência <destinatário>" (max 4 palavras, minúsculo); data = data da operação; status="pago".
- Se a imagem NÃO é cupom nem comprovante de transferência (foto de fatura/boleto, screenshot de extrato bancário, foto aleatória, meme, selfie, paisagem, etc): intent="unsupported" e payload=null. Preencha "motivo" com uma frase curta pt-BR explicando ("parece foto de fatura", "imagem fora do escopo", etc).

Prioridade caption × imagem (quando há caption):
- Caption tem prioridade para: data ("ontem", "anteontem", "dia 5"), status ("vence", "tem que pagar" → "pendente").
- Imagem tem prioridade para: valor, descricao (estabelecimento/destinatário).
- Caption pode REFINAR a categoria (ex: imagem ambígua + caption "almoço" → Alimentação).

Categorias (escolha SEMPRE uma):
- Habitação: água, luz, aluguel, internet, condomínio, IPTU, gás
- Alimentação: mercado, restaurante, iFood, padaria, almoço, jantar, café
- Transporte: combustível, Uber, 99, ônibus, estacionamento, pedágio
- Lazer: cinema, viagem, streaming, jogos, bar
- Vestuário: roupa, calçado, acessório, tênis
- Outros: farmácia, saúde, presente, qualquer coisa sem categoria óbvia

Valor: number (não string). Normalize "R$ 55,70" → 55.7.
Data: ISO YYYY-MM-DD.
Descrição: minúscula, max 4 palavras, sem verbo, sem valor.

Resposta SEMPRE JSON válido conforme o schema. Sem texto fora do JSON.`;
```

- [ ] **Step 2: Type-check**

Run:
```
deno check supabase/functions/whatsapp-webhook/prompts.ts
```
Expected: nenhum erro.

---

## Task 3: `getMediaBase64` em `evolution.ts`

**Files:**
- Modify: `supabase/functions/whatsapp-webhook/evolution.ts`

- [ ] **Step 1: Adicionar função de download**

Abra `evolution.ts` e adicione ao final do arquivo:

```ts
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
```

- [ ] **Step 2: Type-check**

Run:
```
deno check supabase/functions/whatsapp-webhook/evolution.ts
```
Expected: nenhum erro.

---

## Task 4: `interpretImage` em `gemini.ts`

**Files:**
- Modify: `supabase/functions/whatsapp-webhook/gemini.ts`

- [ ] **Step 1: Importar novos símbolos**

No topo de `gemini.ts`, atualize os imports:

```ts
import { GEMINI_RESPONSE_SCHEMA, IMAGE_EXPENSE_SCHEMA } from "./schemas.ts";
import { EXPENSE_SYSTEM_PROMPT, IMAGE_SYSTEM_PROMPT } from "./prompts.ts";
import type { ExpenseExtraction, GeminiResult } from "./types.ts";
import { log } from "./utils.ts";
```

(Adiciona `IMAGE_EXPENSE_SCHEMA`, `IMAGE_SYSTEM_PROMPT` e `ExpenseExtraction` ao import existente.)

- [ ] **Step 2: Adicionar tipos do envelope visual**

Logo após a interface `GeminiEnvelope` existente (~linha 40), adicione:

```ts
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
```

- [ ] **Step 3: Adicionar função `interpretImage`**

Adicione ao final do arquivo (depois da função `interpret` existente):

```ts
export async function interpretImage(
  base64: string,
  mimetype: string,
  caption: string,
  todayISO: string,
): Promise<ImageGeminiResult> {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) throw new Error("GEMINI_API_KEY secret missing");

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
    log("gemini_image_http_error", {
      status: res.status,
      body: errBody.slice(0, 400),
      attempt,
      attempt_latency_ms: Date.now() - attemptStart,
    });
    if (!RETRIABLE_STATUS.has(res.status) || attempt === MAX_ATTEMPTS) {
      throw new Error(`Gemini image HTTP ${res.status}`);
    }
    await sleep(BACKOFF_MS[attempt - 1]);
  }

  const latency_ms = Date.now() - started;
  if (!res || !res.ok) throw new Error("Gemini image HTTP failure after retries");

  const raw = (await res.json()) as GeminiRawResponse;
  const text = raw.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  if (!text) {
    log("gemini_image_empty_response", { finishReason: raw.candidates?.[0]?.finishReason, latency_ms });
    throw new Error("Gemini image returned no text");
  }

  let envelope: ImageGeminiEnvelope;
  try {
    envelope = JSON.parse(text) as ImageGeminiEnvelope;
  } catch (err) {
    log("gemini_image_parse_error", { text: text.slice(0, 200), error: (err as Error).message });
    throw new Error("Gemini image returned invalid JSON");
  }

  log("gemini_image_interpreted", { intent: envelope.intent, has_motivo: !!envelope.motivo, latency_ms });

  return {
    intent: envelope.intent,
    payload: envelope.payload ?? undefined,
    motivo: envelope.motivo ?? undefined,
  };
}
```

- [ ] **Step 4: Type-check**

Run:
```
deno check supabase/functions/whatsapp-webhook/gemini.ts
```
Expected: nenhum erro.

---

## Task 5: Mensagens novas em `messages.ts`

**Files:**
- Modify: `supabase/functions/whatsapp-webhook/messages.ts`

- [ ] **Step 1: Adicionar funções**

Abra `messages.ts` e adicione ao final do arquivo:

```ts
export function msgImageUnsupported(motivo?: string): string {
  const base = pick([
    "Essa imagem não parece cupom fiscal nem comprovante de Pix.",
    "Não consegui ler isso como cupom ou Pix.",
    "Hmm, essa foto não bateu com cupom nem comprovante de transferência.",
  ]);
  const tail = motivo ? ` (${motivo}).` : ".";
  return `${base}${tail} Manda outra ou descreve por texto.`;
}

export function msgImageDownloadError(): string {
  return pick([
    "⚠️ Não consegui baixar a imagem aqui. Tenta enviar de novo?",
    "⚠️ A foto não chegou inteira. Reenvia, por favor.",
  ]);
}
```

- [ ] **Step 2: Type-check**

Run:
```
deno check supabase/functions/whatsapp-webhook/messages.ts
```
Expected: nenhum erro.

---

## Task 6: `handlers/image.ts` (orquestrador)

**Files:**
- Create: `supabase/functions/whatsapp-webhook/handlers/image.ts`

- [ ] **Step 1: Criar arquivo**

Crie `handlers/image.ts` com o conteúdo:

```ts
import type { ExpenseExtraction, WhatsappUser } from "../types.ts";
import { CATEGORIAS, STATUS_ENUM } from "../schemas.ts";
import { getMediaBase64 } from "../evolution.ts";
import { interpretImage } from "../gemini.ts";
import { registerExpense } from "./expense.ts";
import { msgImageDownloadError, msgImageUnsupported, msgSystemError } from "../messages.ts";
import { log } from "../utils.ts";

export interface ImageHandlerResult {
  message: string;
  action:
    | "image_expense_inserted"
    | "image_unsupported"
    | "image_invalid_payload"
    | "image_download_failed"
    | "image_gemini_failed"
    | "image_insert_failed";
  success: boolean;
  errorCode?: string;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const VALID_CATEGORIAS = new Set<string>(CATEGORIAS);
const VALID_STATUS = new Set<string>(STATUS_ENUM);

function isValidPayload(p: unknown): p is ExpenseExtraction {
  if (!p || typeof p !== "object") return false;
  const e = p as Partial<ExpenseExtraction>;
  return (
    typeof e.descricao === "string" && e.descricao.length > 0 &&
    typeof e.valor === "number" && Number.isFinite(e.valor) && e.valor > 0 &&
    typeof e.categoria === "string" && VALID_CATEGORIAS.has(e.categoria) &&
    typeof e.data === "string" && ISO_DATE.test(e.data) && !Number.isNaN(Date.parse(e.data)) &&
    typeof e.status === "string" && VALID_STATUS.has(e.status)
  );
}

export async function handleImage(
  user: WhatsappUser,
  messageId: string,
  caption: string,
  todayISO: string,
): Promise<ImageHandlerResult> {
  log("image_received", {
    phone: user.phone_number,
    message_id: messageId,
    has_caption: caption.length > 0,
    caption_length: caption.length,
  });

  let media;
  try {
    media = await getMediaBase64(messageId);
  } catch (err) {
    return {
      message: msgImageDownloadError(),
      action: "image_download_failed",
      success: false,
      errorCode: (err as Error).message.slice(0, 100),
    };
  }

  let result;
  try {
    result = await interpretImage(media.base64, media.mimetype, caption, todayISO);
  } catch (err) {
    return {
      message: msgSystemError(),
      action: "image_gemini_failed",
      success: false,
      errorCode: (err as Error).message.slice(0, 100),
    };
  }

  if (result.intent === "unsupported") {
    return {
      message: msgImageUnsupported(result.motivo),
      action: "image_unsupported",
      success: true,
    };
  }

  if (!isValidPayload(result.payload)) {
    log("image_invalid_payload", { phone: user.phone_number, payload: result.payload });
    return {
      message: msgImageUnsupported("não consegui ler valor/data"),
      action: "image_invalid_payload",
      success: true,
    };
  }

  try {
    const message = await registerExpense(user, result.payload);
    return { message, action: "image_expense_inserted", success: true };
  } catch (err) {
    return {
      message: msgSystemError(),
      action: "image_insert_failed",
      success: false,
      errorCode: (err as Error).message.slice(0, 100),
    };
  }
}
```

- [ ] **Step 2: Type-check**

Run:
```
deno check supabase/functions/whatsapp-webhook/handlers/image.ts
```
Expected: nenhum erro.

---

## Task 7: Wire up `index.ts` — switch por `messageType`

**Files:**
- Modify: `supabase/functions/whatsapp-webhook/index.ts`

- [ ] **Step 1: Adicionar import do handler**

No bloco de imports do topo de `index.ts`, adicione:

```ts
import { handleImage } from "./handlers/image.ts";
```

- [ ] **Step 2: Substituir branch `if (!rawText)` por switch de `messageType`**

Localize o bloco atual (linhas 114-125 aproximadamente):

```ts
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
```

Substitua por:

```ts
const messageType = data.messageType ?? "";

if (messageType === "imageMessage") {
  const caption = data.message?.imageMessage?.caption ?? "";
  const result = await handleImage(user, messageId, caption, todayISO());
  await sendText(phone, result.message);
  await logAudit({
    message_id: messageId,
    phone_number: phone,
    direction: "inbound",
    intent: "expense",
    action: result.action,
    success: result.success,
    latency_ms: Date.now() - started,
    raw_text: caption || "[imagem sem caption]",
    error_code: result.errorCode,
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
```

(O `if (!rawText)` continua como fallback para audio/sticker/etc — apenas a branch de imagem é interceptada antes.)

- [ ] **Step 3: Type-check do projeto inteiro**

Run:
```
deno check supabase/functions/whatsapp-webhook/index.ts
```
Expected: nenhum erro.

---

## Task 8: Commit do backend

- [ ] **Step 1: Revisar diff**

Run:
```
git -C ethereal-ledger status --short
git -C ethereal-ledger diff supabase/functions/whatsapp-webhook
```
Expected: vê os 6 arquivos alterados/criados (schemas, prompts, evolution, gemini, messages, index) + handlers/image.ts novo.

- [ ] **Step 2: Commit**

Run:
```
cd ethereal-ledger
git add supabase/functions/whatsapp-webhook
git commit -m "feat(whatsapp): Fase 4 — OCR de cupom + Pix via Gemini multimodal

Aceita imageMessage no webhook, baixa via Evolution
/chat/getBase64FromMediaMessage, classifica via Gemini 2.5 Flash
multimodal com caption como contexto extra. Insere despesa direto
(undo via /desfazer cobre erros). Fora do escopo: fatura/boleto,
storage de imagem, multi-item.

Spec: docs/superpowers/specs/2026-04-16-phase4-image-ocr-design.md

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```
Expected: commit criado, hooks passam.

---

## Task 9: Deploy da Edge Function

- [ ] **Step 1: Deploy via supabase CLI**

Run (do diretório `ethereal-ledger/`):
```
supabase functions deploy whatsapp-webhook
```
Expected: log "Deployed Function: whatsapp-webhook" e versão incrementada (>= v13).

- [ ] **Step 2: Sanity check do endpoint**

Run:
```
curl -i -X POST https://<project-ref>.supabase.co/functions/v1/whatsapp-webhook \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token-errado>"
```
Expected: HTTP 401 Unauthorized (auth ainda funciona).

(Substitua `<project-ref>` pela ref real do projeto Supabase do CasaFlow.)

---

## Task 10: Fixtures de teste

**Files:**
- Create: `tests/whatsapp-webhook/fixtures/image_*.json`

- [ ] **Step 1: Capturar payload real**

Mande **uma** foto qualquer pro número do bot. Logo depois, cole no terminal:

```sql
SELECT raw_event
FROM whatsapp_audit_log
WHERE action LIKE 'image_%' AND ts > now() - interval '5 minutes'
ORDER BY ts DESC LIMIT 1;
```

(Se a coluna `raw_event` não existir no audit, capture via Supabase Dashboard → Edge Functions → whatsapp-webhook → Logs, copiando o body do POST mais recente.)

- [ ] **Step 2: Salvar fixtures normalizadas**

Crie `tests/whatsapp-webhook/fixtures/image_cupom_fiscal.json` com o payload completo capturado, **trocando** `data.key.id` por um UUID novo a cada arquivo (pra não bater com `whatsapp_messages_seen`).

Replique o esqueleto pra `image_cupom_com_caption.json` (adicione `caption` em `data.message.imageMessage`), `image_pix.json`, `image_unsupported.json`, `image_malformed.json` (remova `mimetype` propositalmente).

---

## Task 11: Script `test-image.http`

**Files:**
- Create: `tests/whatsapp-webhook/test-image.http`

- [ ] **Step 1: Criar script REST Client**

Conteúdo:

```http
@host = https://<project-ref>.supabase.co
@token = {{$dotenv EVOLUTION_WEBHOOK_TOKEN}}

### 1. Cupom sem caption
POST {{host}}/functions/v1/whatsapp-webhook
Content-Type: application/json
Authorization: Bearer {{token}}

< ./fixtures/image_cupom_fiscal.json

### 2. Cupom com caption
POST {{host}}/functions/v1/whatsapp-webhook
Content-Type: application/json
Authorization: Bearer {{token}}

< ./fixtures/image_cupom_com_caption.json

### 3. Pix
POST {{host}}/functions/v1/whatsapp-webhook
Content-Type: application/json
Authorization: Bearer {{token}}

< ./fixtures/image_pix.json

### 4. Imagem fora do escopo
POST {{host}}/functions/v1/whatsapp-webhook
Content-Type: application/json
Authorization: Bearer {{token}}

< ./fixtures/image_unsupported.json

### 5. Re-envio (esperar duplicate_ignored)
POST {{host}}/functions/v1/whatsapp-webhook
Content-Type: application/json
Authorization: Bearer {{token}}

< ./fixtures/image_cupom_fiscal.json

### 6. Token inválido
POST {{host}}/functions/v1/whatsapp-webhook
Content-Type: application/json
Authorization: Bearer wrong

< ./fixtures/image_cupom_fiscal.json

### 7. Payload malformado (sem mimetype)
POST {{host}}/functions/v1/whatsapp-webhook
Content-Type: application/json
Authorization: Bearer {{token}}

< ./fixtures/image_malformed.json
```

- [ ] **Step 2: Validar via banco após rodar**

Run:
```sql
SELECT action, success, latency_ms, raw_text
FROM whatsapp_audit_log
WHERE ts > now() - interval '10 minutes' AND action LIKE 'image_%' OR action IN ('duplicate_ignored', 'auth_rejected')
ORDER BY ts DESC LIMIT 20;
```
Expected: ver `image_expense_inserted` (req 1, 2, 3), `image_unsupported` (req 4), `duplicate_ignored` (req 5), nada (req 6 → 401), `image_download_failed` (req 7).

---

## Task 12: E2E real (5 fotos do celular)

- [ ] **Step 1: Enviar 5 fotos reais para o número do bot**
  - 3 fotos de cupom fiscal diferentes (mercado, farmácia, restaurante)
  - 1 print de comprovante Pix
  - 1 foto fora do escopo (selfie ou foto da rua)

- [ ] **Step 2: Conferir respostas no WhatsApp** — todas em pt-BR, todas com formato esperado.

- [ ] **Step 3: Validar inserts no dashboard CasaFlow** — 4 despesas novas, valores corretos, categorias razoáveis.

- [ ] **Step 4: Métricas via SQL**

Run:
```sql
SELECT action, COUNT(*), AVG(latency_ms)::int AS p50_ms, MAX(latency_ms) AS p_max
FROM whatsapp_audit_log
WHERE action LIKE 'image_%' AND ts > now() - interval '1 hour'
GROUP BY action ORDER BY COUNT(*) DESC;
```
Expected: latência p50 < 6000ms, zero `image_unsupported` em cupons legíveis.

---

## Task 13: Atualizar relatório e plano

**Files:**
- Modify: `docs/RELATORIO_CASAFLOW_WHATSAPP.md`
- Modify: `docs/PLANO_CONTINUIDADE.md`

- [ ] **Step 1: Adicionar entrada de Fase 4 no relatório**

Em `RELATORIO_CASAFLOW_WHATSAPP.md`, adicione seção curta seguindo o padrão das fases anteriores:

```markdown
## Fase 4 — OCR de imagens (concluída 2026-04-16)

Aceita cupom fiscal e comprovante Pix/transferência via Gemini 2.5 Flash multimodal.
Caption do usuário entra como contexto extra na mesma chamada. Insert direto (sem
confirmação) — `/desfazer` cobre erros. Sem migration, sem storage.

- Latência p50: <preencher após E2E>ms (download + Gemini + insert)
- 5/5 fotos reais classificadas corretamente
- Plano: docs/superpowers/plans/2026-04-16-phase4-image-ocr.md
```

- [ ] **Step 2: Atualizar bloco "Status atual" do plano**

Em `PLANO_CONTINUIDADE.md` (linhas 8-13), atualize:

```markdown
**Status atual (2026-04-16):**
- ✅ Fase 1 (MVP registrar despesa)
- ✅ Fase 2 (robustez: undo, rate limit, audit, retry Gemini)
- ✅ Fase 3 (consultas — intent query com período/categoria/usuário)
- ✅ Fase 4 (OCR cupom + Pix via Gemini multimodal)
- ✅ Fase 6 (lembretes automáticos T-3/T-1 via pg_cron 9h BRT)
- ⏳ Fases 5 (voz), 7 (metas/frontend), 8 (subcategorias) — pendentes
```

E na seção da Fase 4 (linha ~194), adicione no topo do bloco:

```markdown
### Fase 4 — OCR de cupom fiscal (intent `image`) ✅ CONCLUÍDA (2026-04-16)

**Entregue:** branch `imageMessage` no `index.ts`, `handlers/image.ts` orquestra Evolution download + Gemini multimodal + `registerExpense`. Schema `IMAGE_EXPENSE_SCHEMA` reusa `ExpenseExtraction` direto. Caption como contexto extra na mesma chamada (Q3/B). Sem confirmação (Q1/B), sem storage (Q5/A), 1 despesa = total agregado (Q4/A). Plano: `docs/superpowers/plans/2026-04-16-phase4-image-ocr.md`.
```

- [ ] **Step 3: Commit final**

Run:
```
cd ethereal-ledger
git add docs/RELATORIO_CASAFLOW_WHATSAPP.md docs/PLANO_CONTINUIDADE.md tests/whatsapp-webhook
git commit -m "docs(phase4): registrar conclusão da Fase 4 + fixtures de teste

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
git push origin main
```
Expected: push aceito.

---

## Critério de pronto da fase

- 5/5 fotos reais (3 cupons + 1 Pix + 1 fora do escopo) processadas corretamente.
- Latência p50 < 6s.
- Audit limpo (sem `image_gemini_failed`, sem `image_insert_failed`).
- Spec, plano, relatório e plano-mãe atualizados e commitados em `main`.
