# Fase 4 — OCR de imagens (cupom fiscal + comprovante Pix/transferência)

**Data:** 2026-04-16
**Autor:** Claude + Marcelo
**Plano-mãe:** `docs/PLANO_CONTINUIDADE.md` § Fase 4
**Status:** design aprovado, pendente plano de implementação

---

## 1. Objetivo

Permitir que o usuário envie uma **foto de cupom fiscal** ou um **print de comprovante Pix/transferência** pelo WhatsApp e tenha a despesa registrada automaticamente no CasaFlow, com a mesma UX do fluxo de texto atual (`/desfazer` cobre erros de OCR).

**Fora de escopo desta fase:** faturas/boletos (múltiplos valores e datas), fotos de extrato, áudio (Fase 5), múltiplos itens por cupom (Fase 8), galeria de imagens no dashboard, storage da imagem original.

---

## 2. Decisões-chave (resolvidas no brainstorming)

| # | Decisão | Escolha | Razão |
|---|---|---|---|
| Q1 | Fluxo de confirmação | **Insert direto + `/desfazer`** | Reaproveita infra existente; UX em 1 turno; Gemini Flash multimodal é preciso o suficiente. |
| Q2 | Escopo de imagens aceitas | **Cupom fiscal + comprovante Pix/transferência** | Cobre 95% do uso real; faturas/boletos abrem caixa de Pandora (qual valor? mínimo? juros?). |
| Q3 | Caption do usuário | **Contexto extra para o Gemini multimodal** | Uma chamada só; permite override natural de data/pagador/método sem segundo turno. |
| Q4 | Granularidade | **1 despesa = valor total agregado** | Mantém schema atual intacto; granularidade fina é problema da Fase 8 (subcategorias). |
| Q5 | Storage da imagem | **Não guardar** | YAGNI; dedup já coberto por `whatsapp_messages_seen.message_id`. |

Estas decisões anulam o item 4.5 do plano-mãe (confirmação obrigatória) e a "decisão pendente" sobre storage descrita ali.

---

## 3. Arquitetura

### 3.1 Ponto de entrada (mudança em `index.ts`)

Hoje, quando `extractText(data.message)` retorna vazio, o fluxo cai em `msgNonText()` (linhas 114-125). Esta branch passa a fazer **switch por tipo de mensagem**:

```
1. Auth / dedup / user / rate limit  → idêntico ao atual
2. Switch em messageType:
   ├─ conversation | extendedTextMessage   → fluxo de texto atual (intacto)
   ├─ imageMessage                         → handleImage(user, data, today)
   └─ qualquer outro                       → msgNonText() como hoje
```

Texto e imagem nunca se misturam no mesmo turno (caption da imagem é tratada **dentro** de `handleImage`, não como mensagem de texto separada).

### 3.2 Fluxo de `handleImage`

```
a. messageId, caption ← extrair do payload
b. {base64, mimetype} ← evolution.getMediaBase64(messageId)
c. result ← gemini.interpretImage(base64, mimetype, caption, today)
d. switch result.intent:
   ├─ "expense" + payload válido       → registerExpense(user, payload)
   │                                     → sendText("✅ R$ X em <cat> registrado (<desc>)")
   │                                     → audit action="image_expense_inserted"
   ├─ "expense" + payload inválido     → sendText(msgImageUnsupported("não consegui ler valor/data"))
   │                                     → audit action="image_invalid_payload"
   └─ "unsupported"                    → sendText(msgImageUnsupported(motivo))
                                          → audit action="image_unsupported"
```

`registerExpense` é reaproveitado **sem alteração** — recebe o mesmo `ExpensePayload` que o fluxo de texto produz. Imagem só muda a *origem* do payload (Gemini multimodal em vez de Gemini textual).

### 3.3 Por que NÃO passa pelo router de intent

O router atual decide entre `expense | query | undo | unknown` para texto. Quando a entrada é imagem, intent é fixo (`expense` ou `unsupported`). Chamar o router seria custo extra sem ganho.

---

## 4. Componentes & arquivos

### 4.1 Novos

| Arquivo | Responsabilidade |
|---|---|
| `supabase/functions/whatsapp-webhook/handlers/image.ts` | `handleImage(user, eventData, today)`: orquestra download → Gemini → registerExpense ou erro. Retorna `{message, action, success}` para o `index.ts` enviar e auditar. |

Prompt do Gemini multimodal é adicionado a `prompts.ts` como nova constante `IMAGE_SYSTEM_PROMPT` (segue padrão do `EXPENSE_SYSTEM_PROMPT` atual).

### 4.2 Modificados (cirúrgico)

| Arquivo | Mudança |
|---|---|
| `index.ts` | Substituir branch `if (!rawText)` por `switch (messageType)`. Texto: caminho atual intacto. Imagem: chama `handleImage`. Outros: `msgNonText`. |
| `gemini.ts` | Adicionar `interpretImage(base64, mimeType, caption, today)`: chama Gemini com `inlineData` + `responseSchema = IMAGE_EXPENSE_SCHEMA`. Reusa `withRetry` e logger atuais. |
| `evolution.ts` | Adicionar `getMediaBase64(messageId, instance)`: POST em `/chat/getBase64FromMediaMessage/<instance>` com `{message: {key: {id}}}`. Retorna `{base64, mimetype}`. Throw em 4xx/5xx (capturado por `handleImage`). |
| `schemas.ts` | Novo `IMAGE_EXPENSE_SCHEMA` (ver §5). Reusa o mesmo enum de categorias do schema de texto. |
| `messages.ts` | `msgImageUnsupported(motivo?: string)` e `msgImageDownloadError()`. |
| `types.ts` | Sem mudança: `EvolutionMessageContent` já contém `imageMessage: {mimetype?, caption?}`. |
| `prompts.ts` | Adicionar `IMAGE_SYSTEM_PROMPT` (string export, mesmo padrão do `EXPENSE_SYSTEM_PROMPT`). |

### 4.3 Não muda

- `expense.ts` (`registerExpense`), `query.ts`, `undo.ts`, `context.ts`, `rate-limit.ts`, `audit.ts`, `supabase-client.ts` — zero toque.
- Banco de dados — **sem migration nova** (decisão Q5: não guardar imagem).

### 4.4 Princípio de boundary

`handleImage` orquestra `getMediaBase64` + `interpretImage` + `registerExpense` internamente, espelhando o estilo de `query.ts` (que orquestra DB + formatação). Mantém `index.ts` enxuto e o handler testável isoladamente.

---

## 5. Schema Gemini & Prompt

### 5.1 `IMAGE_EXPENSE_SCHEMA` (responseSchema)

```ts
{
  type: "OBJECT",
  required: ["intent"],
  properties: {
    intent: { type: "STRING", enum: ["expense", "unsupported"] },
    payload: {
      type: "object",
      nullable: true,
      properties: {
        descricao: { type: "string" },                          // ex.: "supermercado extra", "pix joão"
        valor:     { type: "number" },                          // > 0
        categoria: { type: "string", enum: [...CATEGORIAS] },   // mesmo enum do schema de texto
        data:      { type: "string" },                          // ISO YYYY-MM-DD
        status:    { type: "string", enum: [...STATUS_ENUM] }   // "pago" para cupom/Pix; caption pode forçar "pendente"
      },
      required: ["descricao", "valor", "categoria", "data", "status"]
    },
    motivo: { type: "string", nullable: true }                  // só preenchido se intent=unsupported
  },
  required: ["intent"]
}
```

**Reuso direto de `ExpenseExtraction`:** o `payload` é exatamente a forma que `registerExpense` já consome — zero adapter. Caption do usuário pode influenciar `data`, `status` (e indiretamente `descricao`/`categoria`) via prompt; não há colunas para `pago_por`/`metodo`/`observacao` na tabela `expenses` hoje, então não fazem parte do schema (YAGNI).

### 5.2 Prompt (`prompts/image.md`)

Esqueleto do conteúdo:

> Você é um assistente que extrai despesas de imagens. Receberá:
> 1. Uma imagem (cupom fiscal OU comprovante de Pix/transferência bancária).
> 2. Opcionalmente, uma legenda do usuário (texto digitado junto).
> 3. A data de hoje em ISO.
>
> **Regras:**
> - Cupom fiscal: `valor` = total da nota; `descricao` = nome do estabelecimento; `data` = data impressa no cupom (se ilegível, use hoje).
> - Comprovante Pix/TED/transferência: `valor` = valor transferido; `descricao` = "Pix para `<destinatário>`" ou "Transferência `<destinatário>`"; `data` = data da operação; `metodo` = `"pix" | "transferencia"`.
> - Imagem fora do escopo (foto de fatura/boleto, screenshot de extrato, foto aleatória) → `intent="unsupported"` + `motivo` curto pt-BR.
> - **Caption do usuário tem prioridade para:** `data`, `pago_por`, `metodo`, `observacao`.
> - **Imagem tem prioridade para:** `valor`, `descricao`.
> - `categoria`: SEMPRE da lista fornecida.
>
> Retorne APENAS JSON conforme o schema.

A lista de categorias é injetada via interpolação no prompt em runtime (mesma fonte que o schema usa).

### 5.3 Modelo

`gemini-2.5-flash` (multimodal nativo, ~2-3s, custo trivial). Sem fallback para Pro. Confirma D5 do plano-mãe.

### 5.4 Validação pós-Gemini (no handler)

Antes de chamar `registerExpense`:
- `valor > 0`
- `data` parseable como ISO date
- `categoria` ∈ enum de categorias

Se qualquer um falhar → `msgImageUnsupported("não consegui ler valor/data")`, audit `action="image_invalid_payload"`. **Não tenta corrigir** (sem segundo turno de Gemini).

---

## 6. Error handling

| Falha | Detecção | Resposta WhatsApp | Audit `action` | `success` |
|---|---|---|---|---|
| Evolution download falha (404, timeout, 5xx) | `getMediaBase64` throw | `msgImageDownloadError()` — "Não consegui baixar a imagem, tenta enviar de novo" | `image_download_failed` | `false` |
| Imagem corrompida / mimetype inválido | `getMediaBase64` retorna sem base64 ou mimetype não-imagem | `msgImageDownloadError()` | `image_download_failed` | `false` |
| Gemini timeout / 5xx (após `withRetry`) | `interpretImage` throw | `msgSystemError()` (existente) | `image_gemini_failed` | `false` |
| Gemini retorna `intent="unsupported"` | resultado normal | `msgImageUnsupported(motivo)` — "Essa imagem não parece cupom nem Pix. Manda outra ou descreve por texto." | `image_unsupported` | `true` |
| Gemini retorna `expense` mas payload inválido | validação no handler | `msgImageUnsupported("não consegui ler valor/data")` | `image_invalid_payload` | `true` |
| `registerExpense` falha (DB) | throw do supabase | `msgSystemError()` | `image_insert_failed` | `false` |
| Sucesso | — | mesma confirmação do texto: `"✅ R$ X em <categoria> registrado (<descricao>)"` | `image_expense_inserted` | `true` |

**Sem retry automático em nada.** Imagem corrompida ou Gemini que rejeita → usuário re-envia. Evita loop e custo Gemini repetido.

### 6.1 Observabilidade adicional

- `latency_ms` no audit fica como total agregado (download + Gemini + insert). Decomposição por etapa fica para depois caso diagnóstico fique opaco — não bloqueia a fase nem requer migration.
- `raw_text` no audit recebe a `caption` da imagem (ou string `"[imagem sem caption]"` se vazia). Permite entender no log o que o usuário digitou junto.
- Logs estruturados (`log()` console):
  - `image_received` `{phone, message_id, has_caption, caption_length}`
  - `image_downloaded` `{message_id, mimetype, size_bytes}`
  - `image_interpreted` `{message_id, intent, latency_ms}`

---

## 7. Testing

### 7.1 Estratégia

Espelhar o que já existe em `tests/whatsapp-webhook/`: scripts `.http` + fixtures de payload Evolution. Sem framework novo.

### 7.2 Fixtures (`tests/whatsapp-webhook/fixtures/`)

- `image_cupom_fiscal.json` — payload Evolution real, `messageType=imageMessage`, sem caption
- `image_cupom_com_caption.json` — cupom + caption "ontem com Rossana"
- `image_pix.json` — comprovante Pix
- `image_unsupported.json` — foto qualquer (meme/selfie) para testar branch `unsupported`
- `image_no_caption_no_mimetype.json` — edge case payload malformado

### 7.3 Casos de teste (`tests/whatsapp-webhook/test-image.http`)

1. Cupom sem caption → `image_expense_inserted` + linha em `expenses`
2. Cupom + caption com data/pagador → override aplicado (data e `added_by_name` corretos)
3. Pix sem caption → `image_expense_inserted` com `metodo="pix"`
4. Foto aleatória → `image_unsupported`, **nenhum** insert em `expenses`
5. Re-envio do mesmo `messageId` → `duplicate_ignored` (dedup já existente)
6. Número não autorizado enviando imagem → `unauthorized`
7. Rate limit excedido (31ª imagem na hora) → `rate_limited`
8. Payload malformado (sem mimetype/base64) → `image_download_failed` sem crash da função

### 7.4 Limitações

Não há mock fácil para Evolution download em testes locais contra a função deployada. Os testes E2E reais usam fotos do celular do Marcelo enviadas para o número de teste, validados via `whatsapp_audit_log` e `expenses`. Unit tests do prompt ficam fora de escopo (Gemini é não-determinístico).

### 7.5 Query de validação pós-deploy

```sql
SELECT action, COUNT(*), AVG(latency_ms)::int AS p50_ms
FROM whatsapp_audit_log
WHERE action LIKE 'image_%' AND ts > now() - interval '1 day'
GROUP BY action ORDER BY COUNT(*) DESC;
```

### 7.6 Critério de pronto da Fase 4

- 5 fotos reais processadas com sucesso (3 cupons, 1 Pix, 1 não-suportado)
- Zero falsos positivos de `unsupported` em cupons legíveis
- Latência total p50 < 6s (download ~500ms + Gemini multimodal ~3s + insert ~200ms)
- Commit + push em `main`
- Atualização do `RELATORIO_CASAFLOW_WHATSAPP.md` e do bloco "Status atual" em `PLANO_CONTINUIDADE.md`

---

## 8. Riscos & mitigações

| Risco | Mitigação |
|---|---|
| Payload `imageMessage` da Evolution diferente do esperado | Gravar fixture do 1º webhook real **antes** de confiar no parser; só seguir após inspeção. |
| Gemini classifica cupom legível como `unsupported` (falso positivo) | Audit `image_unsupported` é monitorado; se aparecer padrão, ajustar prompt sem mexer no schema. |
| Latência de download Evolution alta (cold container do bot) | Logar `image_downloaded` com `size_bytes`; se p50 > 2s, considerar warm-up ou compressão pré-Gemini. |
| Caption maliciosa tentando injetar instrução no prompt | Caption é interpolada como **dado** (delimitada com marcadores claros no prompt), não como instrução; schema rígido limita o que Gemini pode retornar. |
| Custo Gemini multimodal escapar | Gemini Flash multimodal é ~$0.0001 por imagem com Q2/A escopo restrito; rate limit já cobre abuso (30 msgs/h). |

---

## 9. Não faz parte desta fase

- Múltiplos itens por cupom (Fase 8 — subcategorias)
- Storage da imagem no Supabase Storage (futuro, se solicitado)
- Confirmação interativa "sim/não" antes de inserir (decisão Q1/B)
- OCR de fatura/boleto (intent próprio futuro)
- TTS de resposta (Fase 5)
- Decomposição de `latency_ms` por etapa no audit (futuro, se necessário)
