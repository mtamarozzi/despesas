# Fase 5 — Mensagens de voz — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aceitar mensagens de voz no webhook do WhatsApp, processar via Gemini multimodal single-shot (mesmo roteador do texto), e responder em texto com a transcrição ecoada.

**Architecture:** Adicionar branch `audioMessage` ao switch de `messageType` no `index.ts`. Novo `handlers/audio.ts` orquestra `getMediaBase64` (Evolution, reuso) → `interpretAudio` (Gemini multimodal via `callGemini`, novo) → despacha para handlers de texto existentes (`registerExpense`, `handleQuery`, `undoLastExpense`) com prefix de transcrição. Schema reusa estrutura do texto, adicionando apenas campo `transcription`.

**Tech Stack:** Deno + Supabase Edge Functions, Gemini 2.5 Flash multimodal (`inlineData` com áudio opus/ogg), Evolution API (`/chat/getBase64FromMediaMessage/casaflow`), TypeScript.

**Spec de origem:** `docs/superpowers/specs/2026-04-16-phase5-audio-messages-design.md`

---

## File Structure

**Criar:**
- `supabase/functions/whatsapp-webhook/handlers/audio.ts` — orquestrador de áudio
- `supabase/functions/whatsapp-webhook/validators.ts` — `isValidExpensePayload` (movido de `handlers/image.ts` pra reuso)

**Modificar:**
- `supabase/functions/whatsapp-webhook/schemas.ts` — adicionar `AUDIO_RESPONSE_SCHEMA`
- `supabase/functions/whatsapp-webhook/prompts.ts` — adicionar `AUDIO_SYSTEM_PROMPT`
- `supabase/functions/whatsapp-webhook/gemini.ts` — adicionar `AudioGeminiEnvelope`, `AudioGeminiResult`, `interpretAudio`
- `supabase/functions/whatsapp-webhook/messages.ts` — adicionar `msgAudioPrefix`, `msgAudioDownloadError`, `msgAudioInaudible`, `msgAudioInvalidPayload`
- `supabase/functions/whatsapp-webhook/handlers/image.ts` — trocar `isValidPayload` local pelo import de `validators.ts`
- `supabase/functions/whatsapp-webhook/index.ts` — branch `audioMessage` antes do branch `imageMessage`
- `docs/PLANO_CONTINUIDADE.md` — marcar Fase 5 concluída

**Não muda:**
- `evolution.ts` (`getMediaBase64` já existe), `handlers/expense.ts`, `handlers/query.ts`, `handlers/undo.ts`, `handlers/context.ts`
- `audit.ts`, `rate-limit.ts`, `supabase-client.ts`, `utils.ts`, `types.ts`
- Banco de dados (sem migration)
- `config.toml` (`verify_jwt=false` já persistido)

---

## Task 1: `validators.ts` (mover `isValidPayload` de `handlers/image.ts`)

**Files:**
- Create: `supabase/functions/whatsapp-webhook/validators.ts`
- Modify: `supabase/functions/whatsapp-webhook/handlers/image.ts`

- [ ] **Step 1: Criar `validators.ts`**

Crie `validators.ts` com:

```ts
import type { ExpenseExtraction } from "./types.ts";
import { CATEGORIAS, STATUS_ENUM } from "./schemas.ts";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const VALID_CATEGORIAS = new Set<string>(CATEGORIAS);
const VALID_STATUS = new Set<string>(STATUS_ENUM);

export function isValidExpensePayload(p: unknown): p is ExpenseExtraction {
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
```

- [ ] **Step 2: Atualizar `handlers/image.ts` para importar de `validators.ts`**

Em `handlers/image.ts`:

Substitua o import:
```ts
import { CATEGORIAS, STATUS_ENUM } from "../schemas.ts";
```
por:
```ts
import { isValidExpensePayload } from "../validators.ts";
```

Remova o bloco de constantes e função local:
```ts
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const VALID_CATEGORIAS = new Set<string>(CATEGORIAS);
const VALID_STATUS = new Set<string>(STATUS_ENUM);

function isValidPayload(p: unknown): p is ExpenseExtraction {
  ...
}
```

Troque as 2 chamadas de `isValidPayload(result.payload)` por `isValidExpensePayload(result.payload)`.

- [ ] **Step 3: Type-check (ou verificação manual)**

Run (se `deno` estiver disponível):
```
deno check supabase/functions/whatsapp-webhook/handlers/image.ts supabase/functions/whatsapp-webhook/validators.ts
```
Se `deno` não estiver, cross-check manual: imports em `image.ts` apontam pra `validators.ts` existente; chamadas renomeadas.

---

## Task 2: Schema `AUDIO_RESPONSE_SCHEMA`

**Files:**
- Modify: `supabase/functions/whatsapp-webhook/schemas.ts`

- [ ] **Step 1: Adicionar schema ao final do arquivo**

```ts
export const AUDIO_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    transcription: { type: "string" },
    intent: { type: "string", enum: [...INTENT_ENUM] },
    expense: {
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
    query: {
      type: "object",
      nullable: true,
      properties: {
        period: { type: "string", enum: [...QUERY_PERIOD_ENUM] },
        category: { type: "string", nullable: true },
        user_name: { type: "string", nullable: true },
        custom_start: { type: "string", nullable: true },
        custom_end: { type: "string", nullable: true },
      },
      required: ["period"],
    },
    erro: { type: "string", nullable: true },
  },
  required: ["intent", "transcription"],
} as const;
```

- [ ] **Step 2: Type-check**
```
deno check supabase/functions/whatsapp-webhook/schemas.ts
```

---

## Task 3: Prompt `AUDIO_SYSTEM_PROMPT`

**Files:**
- Modify: `supabase/functions/whatsapp-webhook/prompts.ts`

- [ ] **Step 1: Adicionar prompt ao final do arquivo**

```ts
export const AUDIO_SYSTEM_PROMPT = `${EXPENSE_SYSTEM_PROMPT}

IMPORTANTE (áudio): além dos campos normais, preencha "transcription" com o texto literal em pt-BR que o usuário falou no áudio, sem adicionar comentários nem formatação. Se o áudio estiver inaudível ou em outra língua, coloque intent="unknown" e transcription="" (string vazia).`;
```

- [ ] **Step 2: Type-check**
```
deno check supabase/functions/whatsapp-webhook/prompts.ts
```

---

## Task 4: `interpretAudio` em `gemini.ts`

**Files:**
- Modify: `supabase/functions/whatsapp-webhook/gemini.ts`

- [ ] **Step 1: Atualizar imports**

Em `gemini.ts`, troque as 2 primeiras linhas de import por:

```ts
import { AUDIO_RESPONSE_SCHEMA, GEMINI_RESPONSE_SCHEMA, IMAGE_EXPENSE_SCHEMA } from "./schemas.ts";
import { AUDIO_SYSTEM_PROMPT, EXPENSE_SYSTEM_PROMPT, IMAGE_SYSTEM_PROMPT } from "./prompts.ts";
```

- [ ] **Step 2: Adicionar interfaces de envelope/result**

Logo após `ImageGeminiResult` (~linha 52), adicione:

```ts
export interface AudioGeminiEnvelope {
  transcription: string;
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

export interface AudioGeminiResult {
  transcription: string;
  intent: "expense" | "query" | "unknown" | "undo";
  payload?: ExpenseExtraction;
  queryPayload?: {
    period: "today" | "week" | "month" | "custom";
    category?: string;
    user_name?: string;
    custom_start?: string;
    custom_end?: string;
  };
  erro?: string;
}
```

- [ ] **Step 3: Adicionar função `interpretAudio` ao final do arquivo**

```ts
export async function interpretAudio(
  base64: string,
  mimetype: string,
  todayISO: string,
): Promise<AudioGeminiResult> {
  const systemPrompt = AUDIO_SYSTEM_PROMPT.replaceAll("{{TODAY_ISO}}", todayISO);

  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: [{
      role: "user",
      parts: [
        { inlineData: { mimeType: mimetype, data: base64 } },
      ],
    }],
    generationConfig: {
      temperature: 0.2,
      responseMimeType: "application/json",
      responseSchema: AUDIO_RESPONSE_SCHEMA,
    },
  });

  const { parsed: envelope, latency_ms } = await callGemini<AudioGeminiEnvelope>(body, "gemini_audio");

  log("gemini_audio_interpreted", {
    intent: envelope.intent,
    transcription_length: envelope.transcription?.length ?? 0,
    has_erro: !!envelope.erro,
    latency_ms,
  });

  return {
    transcription: envelope.transcription ?? "",
    intent: envelope.intent,
    payload: envelope.expense ?? undefined,
    queryPayload: envelope.query ?? undefined,
    erro: envelope.erro ?? undefined,
  };
}
```

- [ ] **Step 4: Type-check**
```
deno check supabase/functions/whatsapp-webhook/gemini.ts
```

---

## Task 5: Mensagens de áudio

**Files:**
- Modify: `supabase/functions/whatsapp-webhook/messages.ts`

- [ ] **Step 1: Adicionar funções ao final do arquivo**

```ts
export function msgAudioPrefix(transcription: string): string {
  return `🎤 _${transcription}_\n\n`;
}

export function msgAudioDownloadError(): string {
  return pick([
    "⚠️ Não consegui baixar o áudio aqui. Reenvia, por favor?",
    "⚠️ O áudio não chegou inteiro. Tenta de novo?",
  ]);
}

export function msgAudioInaudible(): string {
  return pick([
    "🔇 Não consegui ouvir o áudio direito. Tenta gravar num lugar mais silencioso ou manda por texto?",
    "🔇 O áudio ficou inaudível aqui. Reenvia ou descreve por texto.",
  ]);
}

export function msgAudioInvalidPayload(): string {
  return pick([
    "Entendi o que você falou, mas não consegui extrair a despesa direitinho. Tenta por texto?",
    "Captei o áudio mas o valor/data não fechou. Manda por texto que aí eu registro.",
  ]);
}
```

- [ ] **Step 2: Type-check**
```
deno check supabase/functions/whatsapp-webhook/messages.ts
```

---

## Task 6: `handlers/audio.ts` (orquestrador)

**Files:**
- Create: `supabase/functions/whatsapp-webhook/handlers/audio.ts`

- [ ] **Step 1: Criar arquivo**

Conteúdo completo:

```ts
import type { WhatsappUser } from "../types.ts";
import { getMediaBase64 } from "../evolution.ts";
import { interpretAudio } from "../gemini.ts";
import { isValidExpensePayload } from "../validators.ts";
import { registerExpense } from "./expense.ts";
import { handleQuery } from "./query.ts";
import { undoLastExpense } from "./undo.ts";
import { clearPendingContext, savePendingContext } from "./context.ts";
import {
  msgAudioDownloadError,
  msgAudioInaudible,
  msgAudioInvalidPayload,
  msgAudioPrefix,
  msgSystemError,
  msgUnknown,
} from "../messages.ts";
import { log } from "../utils.ts";

export interface AudioHandlerResult {
  message: string;
  action:
    | "audio_expense_inserted"
    | "audio_context_saved"
    | "audio_invalid_payload"
    | "audio_query_answered"
    | "audio_undo"
    | "audio_unknown_intent"
    | "audio_inaudible"
    | "audio_download_failed"
    | "audio_gemini_failed"
    | "audio_handler_failed";
  success: boolean;
  transcription?: string;
  errorCode?: string;
}

export async function handleAudio(
  user: WhatsappUser,
  messageId: string,
  todayISO: string,
): Promise<AudioHandlerResult> {
  log("audio_received", { phone: user.phone_number, message_id: messageId });

  let media;
  try {
    media = await getMediaBase64(messageId);
  } catch (err) {
    return {
      message: msgAudioDownloadError(),
      action: "audio_download_failed",
      success: false,
      errorCode: (err as Error).message.slice(0, 100),
    };
  }

  let result;
  try {
    result = await interpretAudio(media.base64, media.mimetype, todayISO);
  } catch (err) {
    return {
      message: msgSystemError(),
      action: "audio_gemini_failed",
      success: false,
      errorCode: (err as Error).message.slice(0, 100),
    };
  }

  const transcription = (result.transcription ?? "").trim();

  if (transcription === "") {
    return {
      message: msgAudioInaudible(),
      action: "audio_inaudible",
      success: true,
      transcription: "",
    };
  }

  const prefix = msgAudioPrefix(transcription);

  try {
    if (result.intent === "undo") {
      const { message } = await undoLastExpense(user);
      await clearPendingContext(user.phone_number);
      return {
        message: prefix + message,
        action: "audio_undo",
        success: true,
        transcription,
      };
    }

    if (result.intent === "query" && result.queryPayload) {
      const queryMsg = await handleQuery(user, result.queryPayload, todayISO);
      await clearPendingContext(user.phone_number);
      return {
        message: prefix + queryMsg,
        action: "audio_query_answered",
        success: true,
        transcription,
      };
    }

    if (result.intent === "expense") {
      if (isValidExpensePayload(result.payload)) {
        const expenseMsg = await registerExpense(user, result.payload);
        await clearPendingContext(user.phone_number);
        return {
          message: prefix + expenseMsg,
          action: "audio_expense_inserted",
          success: true,
          transcription,
        };
      }
      if (result.erro) {
        await savePendingContext(user.phone_number, transcription, result.erro);
        return {
          message: prefix + result.erro,
          action: "audio_context_saved",
          success: true,
          transcription,
        };
      }
      return {
        message: prefix + msgAudioInvalidPayload(),
        action: "audio_invalid_payload",
        success: true,
        transcription,
      };
    }

    await clearPendingContext(user.phone_number);
    return {
      message: prefix + msgUnknown(),
      action: "audio_unknown_intent",
      success: true,
      transcription,
    };
  } catch (err) {
    return {
      message: msgSystemError(),
      action: "audio_handler_failed",
      success: false,
      errorCode: (err as Error).message.slice(0, 100),
    };
  }
}
```

- [ ] **Step 2: Type-check**
```
deno check supabase/functions/whatsapp-webhook/handlers/audio.ts
```

---

## Task 7: Wire up `index.ts` — branch `audioMessage`

**Files:**
- Modify: `supabase/functions/whatsapp-webhook/index.ts`

- [ ] **Step 1: Adicionar import do handler**

Ao lado do `import { handleImage } from "./handlers/image.ts";`, adicione:

```ts
import { handleAudio } from "./handlers/audio.ts";
```

- [ ] **Step 2: Adicionar branch de áudio antes do branch de imagem**

Localize o bloco da Fase 4:

```ts
const messageType = data.messageType ?? "";

if (messageType === "imageMessage") {
  const caption = data.message?.imageMessage?.caption ?? "";
  const result = await handleImage(user, messageId, caption, todayISO());
  ...
}
```

Insira **antes** do `if (messageType === "imageMessage")`:

```ts
if (messageType === "audioMessage") {
  const result = await handleAudio(user, messageId, todayISO());
  await sendText(phone, result.message);
  await logAudit({
    message_id: messageId,
    phone_number: phone,
    direction: "inbound",
    intent: "expense",
    action: result.action,
    success: result.success,
    latency_ms: Date.now() - started,
    raw_text: result.transcription
      ? result.transcription.slice(0, 500)
      : `[${result.action}]`,
    error_code: result.errorCode,
  });
  return new Response("ok", { status: 200 });
}
```

`raw_text` pega a transcrição do próprio result quando disponível, ou o action label (`[audio_download_failed]`, etc.) para estados pré-transcrição. Cortado em 500 chars.

- [ ] **Step 3: Type-check**
```
deno check supabase/functions/whatsapp-webhook/index.ts
```

---

## Task 8: Commit do backend

- [ ] **Step 1: Revisar diff**

Run:
```
git -C ethereal-ledger status --short
```
Expected: 7 modificados + 2 novos (`handlers/audio.ts`, `validators.ts`).

- [ ] **Step 2: Commit**

```bash
cd C:/Users/User/Documents/Despesas/ethereal-ledger
git add supabase/functions/whatsapp-webhook
git commit -m "$(cat <<'EOF'
feat(whatsapp): Fase 5 — mensagens de voz via Gemini multimodal

Aceita audioMessage no webhook, baixa via Evolution getMediaBase64
(reuso), classifica+transcreve num único shot de Gemini 2.5 Flash
usando AUDIO_RESPONSE_SCHEMA (mesmo shape do texto + transcription)
e despacha pro handler existente de expense/query/undo com prefix
"🎤 _transcrição_" na resposta. Sem TTS (só texto saindo).

Também extrai isValidExpensePayload para validators.ts (reusado
por image.ts e audio.ts).

Spec: docs/superpowers/specs/2026-04-16-phase5-audio-messages-design.md

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

Expected: commit criado, hooks passam.

---

## Task 9: Deploy

- [ ] **Step 1: Deploy**

```
cd C:/Users/User/Documents/Despesas/ethereal-ledger
supabase functions deploy whatsapp-webhook --no-verify-jwt
```

Expected: "Deployed Function: whatsapp-webhook" (versão >= 17).

- [ ] **Step 2: Verificar via MCP**

O controller do subagent-driven (ou o operador) chama `list_edge_functions` para confirmar `version=17` e `verify_jwt=false`.

---

## Task 10: E2E real (5 áudios do celular)

- [ ] **Step 1: Marcelo manda 5 áudios para o número do bot**

1. "Gastei cinquenta reais no mercado hoje"
2. "Quanto eu gastei essa semana"
3. "Desfaz o último"
4. "Oi tudo bem"
5. Áudio em silêncio OU em inglês (inaudible/unknown)

- [ ] **Step 2: Conferir respostas no WhatsApp**

Esperado:
- (1) `🎤 _gastei cinquenta reais no mercado hoje_\n\n✅ R$ 50,00 em Alimentação registrado (mercado)`
- (2) `🎤 _quanto eu gastei essa semana_\n\n📊 ... (agregação)`
- (3) `🎤 _desfaz o último_\n\n↩️ Removi: R$ 50,00 ...`
- (4) `🎤 _oi tudo bem_\n\nNão peguei bem...`
- (5) `🔇 Não consegui ouvir...` (sem prefix)

- [ ] **Step 3: Métricas via SQL**

```sql
SELECT action, COUNT(*), AVG(latency_ms)::int AS p50_ms, MAX(latency_ms) AS p_max
FROM whatsapp_audit_log
WHERE action LIKE 'audio_%' AND ts > now() - interval '1 hour'
GROUP BY action ORDER BY COUNT(*) DESC;
```

Expected: p50 < 7000ms, ≥4 linhas cobrindo os intents testados.

- [ ] **Step 4: Validar dashboard**

Conferir que a despesa de R$ 50 do caso (1) apareceu e sumiu após o `/desfazer` do caso (3). Dashboard CasaFlow deve refletir apenas despesas de áudio legítimas.

---

## Task 11: Atualizar PLANO_CONTINUIDADE + push

**Files:**
- Modify: `docs/PLANO_CONTINUIDADE.md`

- [ ] **Step 1: Atualizar bloco "Status atual"**

Substituir:

```markdown
- ✅ Fase 4 (OCR cupom + Pix via Gemini multimodal)
- ✅ Fase 6 (lembretes automáticos T-3/T-1 via pg_cron 9h BRT)
- ⏳ Fases 5 (voz), 7 (metas/frontend), 8 (subcategorias) — pendentes
```

Por:

```markdown
- ✅ Fase 4 (OCR cupom + Pix via Gemini multimodal)
- ✅ Fase 5 (mensagens de voz — single-shot multimodal, transcrição ecoada)
- ✅ Fase 6 (lembretes automáticos T-3/T-1 via pg_cron 9h BRT)
- ⏳ Fases 7 (metas/frontend), 8 (subcategorias) — pendentes
```

- [ ] **Step 2: Adicionar bloco CONCLUÍDA na seção da Fase 5**

Na seção `### Fase 5 — Mensagens de voz (intent audio)`, inserir no topo:

```markdown
### Fase 5 — Mensagens de voz (intent `audio`) ✅ CONCLUÍDA (2026-04-16)

**Entregue:** branch `audioMessage` no `index.ts` → `handlers/audio.ts` orquestra `getMediaBase64` (reuso) + `interpretAudio` (single-shot multimodal via `callGemini`) + dispatch pro handler existente de expense/query/undo. `AUDIO_RESPONSE_SCHEMA` = schema do texto + campo `transcription` obrigatório. Resposta sempre com prefix `🎤 _transcrição_\n\n` pra transparência (Q3/A). Todos os intents suportados (Q4/A), sem TTS (Q5/A). Refactor `callGemini<T>` feito antes (Q1/A, commit `8bf5a1a`). `isValidExpensePayload` movido pra `validators.ts` (reusado por image.ts e audio.ts). Plano: `docs/superpowers/plans/2026-04-16-phase5-audio-messages.md`. Spec: `docs/superpowers/specs/2026-04-16-phase5-audio-messages-design.md`.
```

- [ ] **Step 3: Commit + push**

```bash
cd C:/Users/User/Documents/Despesas/ethereal-ledger
git add docs/PLANO_CONTINUIDADE.md
git commit -m "$(cat <<'EOF'
docs: marcar Fase 5 como concluída no plano de continuidade

Fase 5 (mensagens de voz via Gemini multimodal single-shot) validada
em E2E: 5/5 áudios classificados corretamente, transcrição visível
no response, p50 <7s.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
git push origin main
```

Expected: push aceito.

---

## Critério de pronto da fase

- 5/5 áudios reais processados conforme Task 10 §Step 2.
- Latência p50 < 7s (confirmada via Task 10 §Step 3).
- `whatsapp-webhook` em produção com version ≥ 17 e `verify_jwt=false`.
- Audit limpo (sem `audio_gemini_failed` ou `audio_handler_failed` nas mensagens de teste).
- Spec, plano, PLANO_CONTINUIDADE atualizados e commitados em `main`.
