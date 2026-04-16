# Fase 5 — Mensagens de voz (intent `audio`)

**Data:** 2026-04-16
**Autor:** Claude + Marcelo
**Plano-mãe:** `docs/PLANO_CONTINUIDADE.md` § Fase 5
**Status:** design aprovado, pendente plano de implementação

---

## 1. Objetivo

Permitir que o usuário envie uma **mensagem de voz** pelo WhatsApp e tenha o conteúdo processado pelo mesmo roteador de intents do texto (`expense | query | undo | unknown`), com a transcrição visível na resposta para transparência.

**Fora de escopo:** TTS de resposta (bot responde só em texto), áudios longos (>2min), suporte a caption em áudio.

---

## 2. Decisões-chave (resolvidas no brainstorming)

| # | Decisão | Escolha | Razão |
|---|---|---|---|
| Q1 | Refactor `gemini.ts` | **Antes da Fase 5** | Evitar triplicação de retry/HTTP/parse. Helper `callGemini<T>(body, logPrefix)` extraído no commit `8bf5a1a`, deployado como v16 e validado E2E. |
| Q2 | Pipeline de áudio | **Single-shot multimodal** | Gemini 2.5 Flash aceita `inlineData` com áudio nativo. 1 chamada, mesmo endpoint, mesmo `callGemini` helper. |
| Q3 | Transcrição visível no response | **Sempre ecoar** | Áudio é propenso a erro de reconhecimento (sotaque, ambiente); mostrar a transcrição elimina dúvida e é 1 linha a mais na mensagem. |
| Q4 | Intents suportados | **Todos (`expense | query | undo | unknown`)** | Custo zero ao reusar o schema do texto; restringir exigiria ADICIONAR código. |
| Q5 | TTS de resposta | **Não** (só texto) | Provedor separado, chave, custo extra. YAGNI. Fica como potencial Fase 5.5 futura. |

---

## 3. Arquitetura

### 3.1 Ponto de entrada (mudança em `index.ts`)

Após o branch de `imageMessage` (Fase 4), adicionar:

```
switch (messageType):
  ├─ conversation | extendedTextMessage   → fluxo de texto atual (intacto)
  ├─ imageMessage                         → handleImage (Fase 4, intacto)
  ├─ audioMessage                         → NOVO: handleAudio(user, data, today)
  └─ outros                               → msgNonText() (fallback)
```

Audio e imagem nunca se misturam num turno. Áudio normalmente não traz caption (descartado se vier).

### 3.2 Fluxo de `handleAudio`

```
a. messageId, mimetype ← extrair do payload
b. {base64, mimetype} ← evolution.getMediaBase64(messageId)      // reuso puro da Fase 4
c. result ← gemini.interpretAudio(base64, mimetype, todayISO)    // single-shot
d. transcription ← result.transcription (string, pode ser "")
e. prefix ← msgAudioPrefix(transcription)                        // "🎤 _transcription_\n\n"
f. Dispatch por intent:
   ├─ "expense" + payload válido  → registerExpense() + prefix+confirmação
   │                                audit action="audio_expense_inserted"
   ├─ "expense" + erro            → savePendingContext + prefix+erro
   │                                audit action="audio_context_saved"
   ├─ "expense" + payload inválido → prefix + msgAudioInvalidPayload
   │                                 audit action="audio_invalid_payload"
   ├─ "query"                     → handleQuery() + prefix+resultado
   │                                audit action="audio_query_answered"
   ├─ "undo"                      → undoLastExpense() + prefix+resultado
   │                                audit action="audio_undo"
   ├─ "unknown" + transcription ≠ ""
   │                              → prefix + msgUnknown()
   │                                audit action="audio_unknown_intent"
   └─ transcription === "" (áudio inaudível)
                                 → msgAudioInaudible() (sem prefix)
                                   audit action="audio_inaudible"
```

### 3.3 Reuso

**Não criamos nada novo em clients/handlers:**
- `evolution.getMediaBase64` — idêntico ao da imagem
- `gemini.callGemini<T>` — helper recém-extraído
- `registerExpense` / `handleQuery` / `undoLastExpense` / `savePendingContext` / `clearPendingContext` — handlers existentes chamados exatamente como `index.ts` faz no fluxo de texto
- `rate-limit`, `audit`, `dedup` — via `index.ts`, que já cobre todos os branches

---

## 4. Componentes & arquivos

### 4.1 Novos

| Arquivo | Responsabilidade |
|---|---|
| `supabase/functions/whatsapp-webhook/handlers/audio.ts` | `handleAudio(user, messageId, todayISO)`: orquestra download → Gemini → roteamento por intent → formatação com prefix. Retorna `{message, action, success, errorCode}` (mesmo shape de `handleImage`). |

### 4.2 Modificados

| Arquivo | Mudança |
|---|---|
| `index.ts` | Adicionar branch `if (messageType === "audioMessage")` **após** o branch `imageMessage` e **antes** do `if (!rawText)`. Chama `handleAudio`, envia `result.message`, auditoria uniforme (mesmo padrão de `handleImage`). |
| `gemini.ts` | Adicionar `interpretAudio(base64, mimetype, todayISO)`: chama `callGemini<AudioGeminiEnvelope>(body, "gemini_audio")`. ~25 linhas (o helper faz o grosso). |
| `schemas.ts` | Novo `AUDIO_RESPONSE_SCHEMA` — cópia de `GEMINI_RESPONSE_SCHEMA` com campo `transcription: string` obrigatório. Mantém schema de texto original inalterado. |
| `prompts.ts` | Novo `AUDIO_SYSTEM_PROMPT` — template-string do `EXPENSE_SYSTEM_PROMPT` + instrução adicional de transcrição. |
| `messages.ts` | Novos `msgAudioPrefix(transcription)`, `msgAudioDownloadError()`, `msgAudioInaudible()`, `msgAudioInvalidPayload()`. |
| `types.ts` | Adicionar `AudioGeminiEnvelope` e `AudioGeminiResult` (ou exportar de `gemini.ts`). Decidir no plano de implementação. |

### 4.3 Não muda

- `evolution.ts` (`getMediaBase64` já existe), `handlers/expense.ts`, `handlers/query.ts`, `handlers/undo.ts`, `handlers/context.ts`, `audit.ts`, `rate-limit.ts`, `supabase-client.ts`, `utils.ts`
- Banco de dados — **sem migration**
- `EvolutionMessageContent.audioMessage: {mimetype?}` já existe em `types.ts`

---

## 5. Schema Gemini & Prompt

### 5.1 `AUDIO_RESPONSE_SCHEMA`

```ts
export const AUDIO_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    transcription: { type: "string" },
    intent: { type: "string", enum: [...INTENT_ENUM] },
    expense: { /* idêntico a GEMINI_RESPONSE_SCHEMA.expense */ },
    query:   { /* idêntico a GEMINI_RESPONSE_SCHEMA.query */ },
    erro:    { type: "string", nullable: true },
  },
  required: ["intent", "transcription"],
} as const;
```

`expense` e `query` reaproveitam os subobjetos literais do schema de texto (mesmas enums/campos). Zero divergência de taxonomia.

### 5.2 `AUDIO_SYSTEM_PROMPT`

Conteúdo:

> `${EXPENSE_SYSTEM_PROMPT}`
>
> **IMPORTANTE (áudio):** além dos campos normais, preencha `transcription` com o texto literal em pt-BR que o usuário falou no áudio, sem adicionar comentários nem formatação. Se o áudio estiver inaudível ou em outra língua, coloque `intent="unknown"` e `transcription=""` (string vazia).

### 5.3 Modelo

`gemini-2.5-flash` (mesmo D5 do plano-mãe). Áudio e texto passam pelo mesmo `callGemini` via `ENDPOINT` compartilhado.

### 5.4 Validação pós-Gemini

Antes de rotear, `handleAudio` valida:
- `result.transcription` é `string` (schema garante, mas defensivo; se não for, tratar como inaudível)
- Se `intent="expense"` + payload presente → reusar `isValidPayload` da Fase 4 (mover para `utils.ts` ou duplicar local — decisão para o plano de implementação)
- Qualquer falha de validação → prefix + `msgAudioInvalidPayload()`, audit `audio_invalid_payload`, sem throw

---

## 6. Error handling

| Falha | Detecção | Resposta WhatsApp | Audit `action` | `success` |
|---|---|---|---|---|
| Download Evolution falha | `getMediaBase64` throw | `msgAudioDownloadError()` — "⚠️ Não consegui baixar o áudio, reenvia?" | `audio_download_failed` | `false` |
| Gemini timeout/5xx pós-retry | `interpretAudio` throw | `msgSystemError()` | `audio_gemini_failed` | `false` |
| Transcrição vazia (inaudível) | `transcription === ""` | `msgAudioInaudible()` — "🔇 Não consegui ouvir o áudio. Tenta gravar num lugar mais silencioso?" | `audio_inaudible` | `true` |
| Intent=expense + payload válido | ok | `🎤 _transcrição_\n\n<msgConfirmExpense>` | `audio_expense_inserted` | `true` |
| Intent=expense + erro | ok | `🎤 _transcrição_\n\n<erro>` + `savePendingContext` | `audio_context_saved` | `true` |
| Intent=expense + payload inválido | `isValidPayload` fail | `🎤 _transcrição_\n\n<msgAudioInvalidPayload>` | `audio_invalid_payload` | `true` |
| Intent=query | ok | `🎤 _transcrição_\n\n<msgQueryResult>` | `audio_query_answered` | `true` |
| Intent=undo | ok | `🎤 _transcrição_\n\n<undo msg>` | `audio_undo` | `true` |
| Intent=unknown + transcrição não-vazia | ok | `🎤 _transcrição_\n\n<msgUnknown>` | `audio_unknown_intent` | `true` |
| Handler chamado faz throw (DB error etc) | throw | `msgSystemError()` | `audio_handler_failed` | `false` |

**Logs estruturados (`log()` console):**
- `audio_received` `{phone, message_id, mimetype}`
- `gemini_audio_*` (automaticamente via `callGemini` com `logPrefix="gemini_audio"`)
- `audio_invalid_payload` quando disparado

**`raw_text` no audit** = transcrição (ou `"[audio inaudível]"` se vazia). Permite auditar no audit sem precisar entender payload binário.

**Sem retry automático.** Gemini já faz internamente via `callGemini`. Download falho → usuário reenvia.

---

## 7. Testing

### 7.1 Estratégia

Mesma da Fase 4: E2E real com mensagens de voz do celular. Sem framework novo.

### 7.2 Casos E2E (mínimo)

1. Áudio "gastei cinquenta no mercado" → `audio_expense_inserted` + despesa visível no dashboard
2. Áudio "quanto gastei essa semana" → `audio_query_answered` com agregação por categoria
3. Áudio "desfaz último" → `audio_undo` apaga a despesa do caso 1
4. Áudio "oi tudo bem" → `audio_unknown_intent` com transcrição
5. Áudio em silêncio OU em inglês → `audio_inaudible`

### 7.3 Query de validação pós-deploy

```sql
SELECT action, COUNT(*), AVG(latency_ms)::int AS p50_ms, MAX(latency_ms) AS p_max
FROM whatsapp_audit_log
WHERE action LIKE 'audio_%' AND ts > now() - interval '1 hour'
GROUP BY action ORDER BY COUNT(*) DESC;
```

### 7.4 Critério de pronto

- 5/5 áudios reais processados conforme tabela §7.2
- Transcrição visível em todas as respostas não-inaudíveis
- Latência p50 < 7s (download + Gemini multimodal + handler)
- Commits + push em `main`
- `PLANO_CONTINUIDADE.md` atualizado com bloco "✅ CONCLUÍDA" da Fase 5
- `verify_jwt=false` persistido em `config.toml` (herança da correção da Fase 4 — já existe, validar na hora do deploy)

---

## 8. Riscos & mitigações

| Risco | Mitigação |
|---|---|
| Payload `audioMessage` da Evolution com shape diferente do esperado | Gravar o 1º payload real nos logs antes de confiar; ajustar parser se necessário. |
| Gemini rejeita áudio por duração/tamanho | Tratar como `audio_gemini_failed` com `msgSystemError`; adicionar limite explícito só se aparecer. |
| Transcrição acerta mas classificação erra (ex: "quanto gastei em maio" → intent=expense em vez de query) | Audit com transcrição visível permite caçar padrão; ajustar prompt sem refatorar. |
| Latência >10s assusta usuário | Logar latência decomposta se p_max disparar; otimização fica fora de escopo da Fase 5. |
| Caption de áudio (raro mas possível) | Descartar; áudio nunca usa caption de forma útil. |

---

## 9. Não faz parte desta fase

- TTS de resposta (Fase 5.5 potencial, fora do escopo)
- Suporte a áudios >2min (deixar Gemini rejeitar)
- Fallback Whisper quando Gemini falha (mais provedor, YAGNI)
- Salvar arquivo de áudio original no Supabase Storage
- Caption em áudio
- Decomposição granular de `latency_ms` no audit
