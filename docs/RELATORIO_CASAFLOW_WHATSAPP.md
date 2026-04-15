# Relatório de Implementação — CasaFlow + Assistente WhatsApp

**Data:** 15 de Abril de 2026
**Status:** Fase 0 concluída, Fase 1 pendente
**Objetivo:** Permitir registro de despesas no CasaFlow via WhatsApp usando IA Gemini

---

## 1. Contexto e Decisões Arquiteturais

### 1.1 Stack confirmada

| Camada | Tecnologia | Onde |
|---|---|---|
| Frontend | React 19 + Vite | Vercel |
| Banco | PostgreSQL 17 | Supabase (`jeyllykzwtixfzeybkkl`, região `sa-east-1`) |
| Auth | Supabase Auth | Supabase |
| Backend WhatsApp | Edge Function (Deno) | Supabase (a criar) |
| IA | **Gemini 2.5 Flash** | Google AI Studio |
| WhatsApp Gateway | Evolution API v2 | VPS Hostinger via Easypanel |

### 1.2 Decisões importantes tomadas

1. **Gemini em vez de OpenAI** — usuário já tem `GEMINI_API_KEY` ativa em outro projeto doméstico. Usaremos `gemini-2.5-flash` com `responseMimeType: "application/json"` + `responseSchema` para garantir saída estruturada na própria API (elimina necessidade de "tratamento de JSON inválido" do checklist original).
2. **Backend = Supabase Edge Function** (não Node.js standalone). Motivos: já no mesmo ecossistema, sem VPS extra, deploy via CLI, acesso interno a `service_role` sem exposição.
3. **Evolution já rodando** na URL `https://evolution-evolution-api.u9givm.easypanel.host`, instância chamada `casaflow`, status `Connected`.
4. **Categorias** — adotar as 6 do prompt mestre original (Habitação, Alimentação, Transporte, Lazer, Vestuário, Outros) como enum no `responseSchema` do Gemini. Coluna `expenses.category` permanece `text` livre no banco (mais flexível).
5. **Mapeamento Gemini → tabela `expenses`:**
   | Saída Gemini | Coluna `expenses` |
   |---|---|
   | `descricao` | `name` |
   | `valor` | `amount` |
   | `categoria` | `category` |
   | `data` | `due_date` |
   | `status` | `status` (check constraint já valida `pago`/`pendente`) |

---

## 2. Schema Atual do Banco (pós-limpeza)

### 2.1 Tabelas do CasaFlow original (pré-existentes)

#### `expenses` (0 linhas após limpeza)
```
id            uuid PK
user_id       uuid FK -> auth.users
name          text
amount        numeric
category      text
due_date      date
notes         text NULL
recurring     bool DEFAULT false
status        text DEFAULT 'pendente' CHECK IN ('pago','pendente')
created_at    timestamptz DEFAULT utc now()
household_id  uuid FK -> households
added_by_name text NULL
```

#### `households` (1 linha)
```
id          uuid PK DEFAULT gen_random_uuid()
name        text       -- "Casa"
invite_code text UNIQUE -- "ADFE48F2"
created_by  uuid FK -> auth.users
created_at  timestamptz
```
**Household ativo:** `f5a5bd3f-9fbf-4d78-9b18-8d51b998b35e` (nome: "Casa")

#### `household_members` (2 linhas)
```
id           uuid PK
household_id uuid FK -> households
user_id      uuid FK -> auth.users
joined_at    timestamptz
```
**Membros do household "Casa":**
- `0e566ba7-8f45-454d-b25e-ebf0f562977b` → mtamarozzi@hotmail.com
- `489f149c-894b-4bb6-bf69-80bb74ae4611` → rossana.tec.enf@gmail.com

#### `profiles` (3 linhas após backfill)
```
id         uuid PK FK -> auth.users
email      text
created_at timestamptz
updated_at timestamptz
```

#### `tasks` e `reminders`
Existem e fazem parte do CasaFlow (kanban doméstico + lembretes de contas). **Não tocar nelas** nesta fase. Podem ser exploradas em fase futura do assistente WhatsApp ("me lembra de pagar a luz dia 5").

### 2.2 Tabelas novas criadas para o Assistente WhatsApp

#### `whatsapp_users` (1 linha)
```
phone_number text PK
user_id      uuid FK -> auth.users
household_id uuid FK -> households
display_name text
active       bool DEFAULT true
created_at   timestamptz
updated_at   timestamptz (trigger set_updated_at)
```
**Índices:** `household_id`, `user_id`
**RLS:** habilitado, sem policies (acesso só via service_role) — INTENCIONAL
**Linha existente:**
- `5514998885355` → user_id `0e566ba7...` (mtamarozzi) → household "Casa", display_name "Marcelo"

#### `whatsapp_context` (0 linhas)
```
phone_number    text PK FK -> whatsapp_users (ON DELETE CASCADE)
pending_payload jsonb
question        text
expires_at      timestamptz DEFAULT now() + 5min
updated_at      timestamptz (trigger set_updated_at)
```
**Índice:** `expires_at`
**RLS:** habilitado, sem policies — INTENCIONAL
**Uso:** estado transiente para fluxo de clarificação ("paguei 80" → bot pergunta "de quê?" → próxima msg completa).

### 2.3 Função e triggers compartilhados

```sql
public.set_updated_at()  -- com SET search_path = public
```
Aplicada em `whatsapp_users` e `whatsapp_context` via trigger BEFORE UPDATE.

### 2.4 Correções aplicadas no banco

- ✅ `handle_new_user` recriado com `SET search_path = public` + `ON CONFLICT DO NOTHING` (corrigia warning de segurança e bug que não criava profile pra alguns usuários).
- ✅ Backfill: profiles criados retroativamente para mtamarozzi e rossana.

### 2.5 Migrations aplicadas (ordem)

1. `create_whatsapp_integration_tables`
2. `cleanup_test_data` (deletou 4 expenses + 11 household_members + 10 households)
3. `fix_handle_new_user_search_path`
4. `create_clean_household_and_backfill_profiles`

---

## 3. Estado da Evolution API

| Item | Valor |
|---|---|
| URL base | `https://evolution-evolution-api.u9givm.easypanel.host` |
| Hospedagem | VPS Hostinger via Easypanel |
| Instância | `casaflow` |
| Status | `Connected` (open) |
| Número conectado | 5514998885355 (Marcelo Mitelmão) |
| Manager | `https://evolution-evolution-api.u9givm.easypanel.host/manager` |
| Auth | `AUTHENTICATION_API_KEY` no `.env` do container |

⚠️ **API Key foi exposta em chat e PRECISA ser rotacionada** — instrução pro usuário pendente.

### 3.1 Teste de envio confirmado funcional

```bash
curl -X POST 'https://evolution-evolution-api.u9givm.easypanel.host/message/sendText/casaflow' \
  -H 'apikey: <NOVA_KEY>' \
  -H 'Content-Type: application/json' \
  -d '{"number":"5514998885355","text":"Teste"}'
```

### 3.2 Webhook a configurar (NÃO RODAR ATÉ EDGE FUNCTION EXISTIR)

```bash
curl -X POST 'https://evolution-evolution-api.u9givm.easypanel.host/webhook/set/casaflow' \
  -H 'apikey: <NOVA_KEY>' \
  -H 'Content-Type: application/json' \
  -d '{
    "webhook": {
      "enabled": true,
      "url": "https://jeyllykzwtixfzeybkkl.supabase.co/functions/v1/whatsapp-webhook",
      "headers": {
        "Authorization": "Bearer <EVOLUTION_WEBHOOK_TOKEN>"
      },
      "byEvents": false,
      "events": ["MESSAGES_UPSERT"]
    }
  }'
```

---

## 4. Secrets do Supabase (a configurar pelo usuário)

Local: https://supabase.com/dashboard/project/jeyllykzwtixfzeybkkl/functions/secrets

| Nome | Função | Valor |
|---|---|---|
| `GEMINI_API_KEY` | Edge Function chama Gemini | chave do Google AI Studio |
| `EVOLUTION_API_KEY` | Edge Function envia mensagens via Evolution | nova API key da Evolution (após rotação) |
| `EVOLUTION_WEBHOOK_TOKEN` | Edge Function valida webhooks recebidos | string aleatória 64 chars (gerar via `openssl rand -hex 32` ou random.org) |

`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` e `SUPABASE_ANON_KEY` já existem como variáveis padrão de Edge Functions — não precisa configurar.

---

## 5. Advisors de Segurança (Supabase)

Após todas as migrations:
- ⚠️ `auth_leaked_password_protection` (WARN) — HaveIBeenPwned desligado. Toggle simples no painel Auth → Settings.
- ℹ️ `rls_enabled_no_policy` em `whatsapp_users` e `whatsapp_context` (INFO) — **intencional**, acesso só via service_role.

---

## 6. O Que Falta Fazer

### 6.1 Pendências do usuário (offline, antes da Fase 1)

- [ ] Rotacionar `AUTHENTICATION_API_KEY` da Evolution (foi exposta em chat)
- [ ] Salvar os 3 secrets no Supabase
- [ ] Validar no dashboard CasaFlow que o household "Casa" aparece e que dá pra criar despesa manual sem quebrar nada
- [ ] (opcional) Ligar HaveIBeenPwned no Auth do Supabase

### 6.2 Fase 1 — MVP do Assistente (essencial)

Edge Function `whatsapp-webhook` (Deno/TypeScript) com fluxo:

1. **Validar token de webhook** — header `Authorization: Bearer <EVOLUTION_WEBHOOK_TOKEN>`. Rejeitar 401 se não bater.
2. **Parsear payload Evolution** — formato do evento `MESSAGES_UPSERT`. Extrair `phone_number` (de `data.key.remoteJid`, remover `@s.whatsapp.net`) e `message_text` (de `data.message.conversation` ou `data.message.extendedTextMessage.text`).
3. **Ignorar mensagens próprias** — `data.key.fromMe === true` deve retornar 200 sem processar (evita loop quando bot responde).
4. **Resolver usuário** — `SELECT * FROM whatsapp_users WHERE phone_number = ? AND active = true`. Se não existir, responder no WhatsApp "número não autorizado" e retornar.
5. **Verificar contexto pendente** — `SELECT * FROM whatsapp_context WHERE phone_number = ? AND expires_at > now()`. Se houver, mesclar com nova mensagem antes de chamar Gemini.
6. **Chamar Gemini 2.5 Flash** — endpoint REST, não SDK. URL: `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=<KEY>`. Body com `responseSchema` definindo `{descricao, valor, categoria (enum), data (date), status (enum)}` ou `{erro: string}`.
7. **Tratar resposta:**
   - Se Gemini retornar `erro` → salvar contexto em `whatsapp_context`, mandar pergunta de clarificação no WhatsApp.
   - Se Gemini retornar payload completo → `INSERT INTO expenses` com `household_id` e `user_id` resolvidos no passo 4, `added_by_name = display_name + " (WhatsApp)"`. Limpar contexto pendente.
8. **Confirmar no WhatsApp** — chamar Evolution `/message/sendText/casaflow` com confirmação tipo `"✅ R$ 120,00 em Habitação registrado (Conta de luz)"`.
9. **Logs estruturados** — `console.log(JSON.stringify({...}))` para usar no Supabase Functions logs.

### 6.3 Prompt sistema do Gemini (Fase 1)

```
Você é um interpretador de mensagens financeiras do CasaFlow.

Receberá uma mensagem em português brasileiro sobre uma despesa.
Data atual de referência: {{HOJE_ISO}} (use para resolver "hoje", "ontem", "anteontem", "dia 5", etc).

Categorias permitidas (use exatamente estas strings):
- Habitação (água, luz, aluguel, internet, condomínio, IPTU)
- Alimentação (mercado, restaurante, ifood, padaria)
- Transporte (combustível, uber, ônibus, estacionamento)
- Lazer (cinema, viagem, streaming, jogos)
- Vestuário (roupa, calçado, acessório)
- Outros (qualquer coisa que não se encaixe acima)

Status:
- "pago" quando a mensagem indicar pagamento já feito ("paguei", "gastei", "comprei")
- "pendente" quando indicar vencimento futuro ("vence dia X", "tem que pagar")

Se a mensagem não tiver valor numérico → retorne {"erro":"valor não informado"}
Se faltar contexto pra inferir descrição/categoria → retorne {"erro":"informação insuficiente"}
Caso contrário, retorne o objeto completo conforme o schema.
```

E o `responseSchema`:
```json
{
  "type": "object",
  "properties": {
    "descricao": {"type": "string"},
    "valor": {"type": "number"},
    "categoria": {"type": "string", "enum": ["Habitação","Alimentação","Transporte","Lazer","Vestuário","Outros"]},
    "data": {"type": "string", "format": "date"},
    "status": {"type": "string", "enum": ["pago","pendente"]},
    "erro": {"type": "string"}
  }
}
```

### 6.4 Fase 2 — Robustez (depois do MVP funcionar)

- [ ] Fluxo completo de clarificação multi-turno usando `whatsapp_context`
- [ ] Rate limit por número (ex: max 30 msgs/hora)
- [ ] Cron `pg_cron` para limpar `whatsapp_context` expirado
- [ ] Logs estruturados + alertas em caso de erro Gemini
- [ ] Comando `/desfazer` para apagar última despesa registrada via WhatsApp

### 6.5 Fase 3 — Relatórios via WhatsApp

Gemini detecta intenção (`{intent: "report", period: "month", category?: string}`), backend consulta Supabase, formata texto.

### 6.6 Fase 4 — Lembretes automáticos

`pg_cron` diário detectando expenses `pendente` próximas do vencimento, Gemini só formata a frase, Evolution dispara.

---

## 7. Fluxo Completo Esperado (referência)

```
[WhatsApp do usuário]
  ↓ "paguei 120 de luz hoje"
[Evolution API instância casaflow]
  ↓ POST webhook MESSAGES_UPSERT
[Edge Function whatsapp-webhook]
  ↓ valida token Authorization
  ↓ extrai phone_number e texto
  ↓ resolve household_id via whatsapp_users
  ↓ chama Gemini 2.5 Flash com responseSchema
  ↓ recebe JSON estruturado
  ↓ INSERT em expenses
  ↓ chama Evolution /message/sendText
[WhatsApp do usuário]
  ↓ "✅ R$ 120,00 em Habitação registrado (Conta de luz)"
[Dashboard CasaFlow no Vercel]
  → despesa aparece em tempo real (Supabase realtime)
```

---

## 8. Identificadores Importantes (referência rápida)

```
Supabase project_id:     jeyllykzwtixfzeybkkl
Supabase project_ref:    jeyllykzwtixfzeybkkl
Supabase URL:            https://jeyllykzwtixfzeybkkl.supabase.co
Edge Function URL alvo:  https://jeyllykzwtixfzeybkkl.supabase.co/functions/v1/whatsapp-webhook

Evolution URL base:      https://evolution-evolution-api.u9givm.easypanel.host
Evolution instância:     casaflow

Household "Casa":        f5a5bd3f-9fbf-4d78-9b18-8d51b998b35e
User mtamarozzi:         0e566ba7-8f45-454d-b25e-ebf0f562977b (mtamarozzi@hotmail.com)
User rossana:            489f149c-894b-4bb6-bf69-80bb74ae4611 (rossana.tec.enf@gmail.com)
User mmitelmao:          456bfcc8-f29b-4e0b-b82a-c99314924891 (mmitelmao@gmail.com — não usar)

WhatsApp do Marcelo:     5514998885355 (já cadastrado em whatsapp_users)
```
