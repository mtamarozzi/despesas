# Testes da Edge Function `whatsapp-webhook`

Smoke tests via curl que simulam payloads da Evolution API `messages.upsert`.

## Como rodar

### Pré-requisitos

1. Secrets configurados no Supabase (`GEMINI_API_KEY`, `EVOLUTION_API_KEY`, `EVOLUTION_WEBHOOK_TOKEN`) — necessário para casos 4 e 5.
2. Para rodar **localmente**: `supabase functions serve whatsapp-webhook --env-file supabase/.env.local`.
3. Para rodar contra **produção**: função já deployada via `supabase functions deploy`.

### Local (função servida em `localhost`)

```bash
export FUNCTION_URL="http://localhost:54321/functions/v1/whatsapp-webhook"
export EVOLUTION_WEBHOOK_TOKEN="<token do .env.local>"
bash tests/whatsapp-webhook/run.sh
```

### Produção (função deployada)

```bash
export FUNCTION_URL="https://jeyllykzwtixfzeybkkl.supabase.co/functions/v1/whatsapp-webhook"
export EVOLUTION_WEBHOOK_TOKEN="<mesmo valor do secret EVOLUTION_WEBHOOK_TOKEN>"
bash tests/whatsapp-webhook/run.sh
```

## Casos cobertos

| # | Cenário | Esperado |
|---|---|---|
| 1 | Bearer token inválido | HTTP 401 |
| 2 | `fromMe: true` | HTTP 200, zero efeitos colaterais |
| 3 | Número não cadastrado em `whatsapp_users` | HTTP 200, envia mensagem de bloqueio |
| 4 | Mensagem clara ("paguei 120 de luz hoje") | HTTP 200, INSERT em `expenses` + confirmação no WhatsApp |
| 5 | Mensagem ambígua ("gastei 80") | HTTP 200, upsert em `whatsapp_context` + pergunta no WhatsApp |
| 5b | Follow-up ("foi mercado") após caso 5 | HTTP 200, insere despesa completa + limpa contexto |

## Notas

- Cada execução gera IDs únicos por sufixo timestamp pra não bater na idempotência (`whatsapp_messages_seen`).
- Casos 4, 5 e 5b disparam mensagens reais no WhatsApp do número cadastrado (`5514998885355`). Comunique antes de rodar contra produção.
- Para validar casos 4 e 5 end-to-end, inspecione:
  - `SELECT * FROM expenses ORDER BY created_at DESC LIMIT 5;`
  - `SELECT * FROM whatsapp_context;`
  - Logs da função: `supabase functions logs whatsapp-webhook`
