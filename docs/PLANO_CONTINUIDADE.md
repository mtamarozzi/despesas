# Plano de Continuidade — CasaFlow + Assistente WhatsApp

**Data:** 2026-04-15 (criado) · 2026-04-16 (última atualização)
**Autor:** Claude + Marcelo
**Baseado em:** `RELATORIO_CASAFLOW_WHATSAPP.md` + screenshots em `Inspira/`
**Escopo:** do estado atual (Fase 0 concluída) até assistente completo (texto + voz + imagem + consultas + lembretes)

**Status atual (2026-04-16):**
- ✅ Fase 1 (MVP registrar despesa)
- ✅ Fase 2 (robustez: undo, rate limit, audit, retry Gemini)
- ✅ Fase 3 (consultas — intent query com período/categoria/usuário)
- ✅ Fase 4 (OCR cupom + Pix via Gemini multimodal)
- 📝 Fase 5 (mensagens de voz) — **design + plano prontos, execução pausada** em 2026-04-16 após identificação do gap de Receitas. Retomável a qualquer momento. Spec: `docs/superpowers/specs/2026-04-16-phase5-audio-messages-design.md`. Plano: `docs/superpowers/plans/2026-04-16-phase5-audio-messages.md` (commit `3e12189`).
- ✅ Fase 6 (lembretes automáticos T-3/T-1 via pg_cron 9h BRT)
- 🆕 **Fase de Receitas/Entradas (prioridade alta)** — ver seção "Pendência crítica" abaixo.
- ⏳ Fases 7 (metas/frontend), 8 (subcategorias) — pendentes (metas depende de Receitas)

---

## Pendência crítica — Módulo de Receitas (Entradas)

**Identificada em 2026-04-16 pelo Marcelo.**

O projeto inteiro (nome do diretório "Despesas", tabela `expenses`, todos os intents do WhatsApp, dashboard CasaFlow, Fases 1–6) foi construído modelando apenas **saídas**. Um controle financeiro doméstico sem tracking de **entradas** (salário, freelas, 13º, transferências recebidas, rendimentos, vendas pontuais) é incompleto por desenho — metas só fazem sentido contra receita conhecida, e o usuário não consegue responder "sobrou quanto esse mês?" sem o lado positivo do razão.

**Não foi levantado antes na brainstorming inicial nem em nenhuma das 4 fases subsequentes.** É uma falha de revisão que impacta a arquitetura a partir daqui: Fase 7 (metas) especificamente precisa de receita conhecida antes de ser útil.

**Escopo a brainstormar (quando retomar):**
- Schema: nova tabela `income` OU transações polimórficas `transactions(type: "expense" | "income", ...)` OU colunar na própria `expenses` com sinal (negativo/positivo). Decisão de brainstorming.
- Categorias de receita: salário, freela, 13º, bônus, rendimento, outros. Separadas das categorias de despesa.
- Novo intent WhatsApp `income`: "recebi 5000 de salário hoje", "caiu 200 de freela".
- OCR de comprovante de crédito/depósito? (reuso da infra da Fase 4 multimodal).
- Áudio de receita? (reuso da Fase 5 quando retomada).
- Dashboard: card "Saldo do mês" = Σreceitas − Σdespesas, gráfico barras positivas/negativas, evolução histórica.
- Lembretes: bot pode lembrar "entrou salário hoje?" se usuário marcar data recorrente (fora de escopo inicial).

**Ordem sugerida de retomada:**
1. Brainstorming Receitas (spec + plano)
2. Implementação Receitas (schema, intents, dashboard)
3. Retomar Fase 5 (voz) com intent `income` de graça
4. Fase 7 (metas) sobre base completa
5. Fase 8 (subcategorias)

---

## 0. Princípios do plano

1. **Uma Edge Function, múltiplos intents.** A inspiração (N8N) separa "Registrar gastos" / "Consultas" / outros em workflows distintos. No Supabase Edge Function vamos unificar em **um único endpoint com um router de intent baseado em Gemini**, pra evitar múltiplos cold starts e simplificar o deploy. Modularidade vem dos arquivos internos, não de funções separadas.
2. **Gemini estruturado.** Todo chamada ao Gemini usa `responseMimeType: "application/json"` + `responseSchema`. Nunca parsear texto livre.
3. **Idempotência do webhook.** Evolution pode re-entregar eventos. Usar `messages.key.id` como chave de deduplicação (tabela nova `whatsapp_messages_seen`).
4. **Fail loud, degrade soft.** Erro de Gemini/Supabase → log estruturado + mensagem humana no WhatsApp pedindo pra tentar de novo. Nunca silêncio.
5. **Git sempre.** Cada fase termina com commit no repo `mtamarozzi/despesas`. Edge function versionada junto com o frontend (monorepo em `ethereal-ledger/`).
6. **Não quebrar o que existe.** CasaFlow web em produção. Nenhuma mudança no frontend até Fase 5. Novas tabelas não afetam as existentes.

---

## 1. Estrutura de pastas alvo (monorepo)

```
ethereal-ledger/
├── src/                          # React 19 (intocado até Fase 5)
├── supabase/
│   ├── config.toml               # criado por `supabase init`
│   ├── functions/
│   │   └── whatsapp-webhook/
│   │       ├── index.ts          # handler HTTP + router de intent
│   │       ├── evolution.ts      # cliente Evolution (send text, send audio, get media)
│   │       ├── gemini.ts         # cliente Gemini (generateContent, schemas)
│   │       ├── supabase-client.ts# factory service_role
│   │       ├── handlers/
│   │       │   ├── expense.ts    # intent: registrar despesa
│   │       │   ├── query.ts      # intent: consulta ("quanto gastei em X")
│   │       │   ├── image.ts      # OCR cupom (Fase 4)
│   │       │   ├── audio.ts      # transcrição voz (Fase 5)
│   │       │   └── undo.ts       # /desfazer (Fase 2)
│   │       ├── prompts/
│   │       │   ├── router.md     # detecta intent
│   │       │   ├── expense.md    # extrai despesa
│   │       │   └── query.md      # interpreta consulta
│   │       ├── schemas.ts        # responseSchemas tipados
│   │       ├── types.ts          # Evolution payload + domain types
│   │       └── utils.ts          # formatBRL, parseDate, logger
│   └── migrations/               # DDL versionado (apply_migration do MCP)
├── tests/
│   └── whatsapp-webhook/
│       ├── fixtures/             # payloads Evolution gravados
│       ├── test-auth.http        # REST Client
│       ├── test-expense.http
│       ├── test-query.http
│       └── run.sh                # curl batch
└── docs/
    ├── RELATORIO_CASAFLOW_WHATSAPP.md
    └── PLANO_CONTINUIDADE.md    # este arquivo
```

---

## 2. Roadmap por fase

### Fase 1 — MVP: Registrar despesa por texto (atual)

**Objetivo:** usuário manda "paguei 120 de luz hoje", despesa aparece no dashboard.

**Entregáveis:**

| # | Item | Responsável | Checkpoint |
|---|---|---|---|
| 1.1 | Migration `create_whatsapp_messages_seen` (idempotência) | Claude (MCP) | `apply_migration` |
| 1.2 | `supabase init` + `supabase link` em `ethereal-ledger/` | Marcelo (PowerShell) | `supabase/` existe |
| 1.3 | Scaffold dos 6 arquivos modulares da Edge Function | Claude | revisão |
| 1.4 | Prompt + schema do Gemini pra intent `expense` | Claude | revisão |
| 1.5 | Router de intent (só `expense` nesta fase; resto retorna "não entendi") | Claude | revisão |
| 1.6 | Script `tests/whatsapp-webhook/run.sh` com 5 casos | Claude | local pass |
| 1.7 | Secrets no Supabase (`GEMINI_API_KEY`, `EVOLUTION_API_KEY`, `EVOLUTION_WEBHOOK_TOKEN`) | Marcelo | painel Supabase |
| 1.8 | Rotação da API key da Evolution | Marcelo | novo `.env` do container |
| 1.9 | `supabase functions deploy whatsapp-webhook` | Marcelo | função live |
| 1.10 | Curl de smoke test contra função deployada | Ambos | 200 OK + insert real |
| 1.11 | Configurar webhook `MESSAGES_UPSERT` na Evolution | Marcelo | evento chega |
| 1.12 | Teste end-to-end: mandar msg real pro número | Marcelo | despesa aparece no dashboard |
| 1.13 | Commit + push → GitHub | Claude (via /commit) | branch `main` |

**Critério de pronto:** Marcelo manda "paguei 120 de luz hoje" no WhatsApp e em < 10s recebe "✅ R$ 120,00 em Habitação registrado (luz)" e a despesa aparece no dashboard CasaFlow.

**Riscos da fase:**
- Formato do payload `MESSAGES_UPSERT` da Evolution não bater com doc → mitigação: gravar fixture do 1º webhook recebido antes de confiar no parser.
- Cold start do Edge Function + latência Gemini > 15s → Gemini 2.5 Flash é rápido (~1-2s), mas instrumentar timings no log.

---

### Fase 2 — Robustez: clarificação, undo, rate limit

**Objetivo:** bot aguenta uso diário real com 2 pessoas.

**Entregáveis:**

| # | Item |
|---|---|
| 2.1 | Fluxo de clarificação completo: `{erro: ...}` grava `whatsapp_context`, próxima msg é mesclada e reenviada ao Gemini |
| 2.2 | Comando `/desfazer` — apaga última despesa registrada via WhatsApp nos últimos 10min (filtro `added_by_name LIKE '% (WhatsApp)'`) |
| 2.3 | Rate limit: max 30 msgs/hora por número (tabela `whatsapp_rate_limit` ou contagem em `whatsapp_messages_seen`) |
| 2.4 | `pg_cron` diário pra limpar `whatsapp_context` expirado + `whatsapp_messages_seen` > 7 dias |
| 2.5 | Mensagens de erro humanizadas em pt-BR pra cada falha (Gemini, DB, Evolution) |
| 2.6 | Tabela `whatsapp_audit_log` (message_id, phone, intent detectado, ação, sucesso, latência) |

**Critério de pronto:** uma pessoa faz 15 interações (algumas ambíguas, uma errada que ela desfaz) e tudo se resolve só no WhatsApp.

---

### Período de Observação (entre Fase 2 e Fase 3)

**Decisão (2026-04-15):** antes de começar a Fase 3, rodar o bot em produção real por 1–2 dias com uso orgânico de Marcelo e Rossana. Objetivo: coletar dados empíricos pra calibrar as próximas fases.

**Queries de análise a rodar ao retomar** (via MCP `execute_sql` ou painel Supabase):

```sql
-- 1. Distribuição de intents e actions
SELECT intent, action, COUNT(*) AS total
FROM whatsapp_audit_log
WHERE ts > now() - interval '3 days'
GROUP BY intent, action
ORDER BY total DESC;

-- 2. Frases classificadas como unknown (candidatas a melhorar prompt)
SELECT raw_text, COUNT(*) AS tentativas
FROM whatsapp_audit_log
WHERE action = 'unknown_intent' AND ts > now() - interval '3 days'
GROUP BY raw_text
ORDER BY tentativas DESC;

-- 3. Latência média por action
SELECT action, AVG(latency_ms)::int AS p50, MAX(latency_ms) AS p_max, COUNT(*) AS n
FROM whatsapp_audit_log
WHERE ts > now() - interval '3 days' AND latency_ms IS NOT NULL
GROUP BY action
ORDER BY p50 DESC;

-- 4. Distribuição de categorias nas despesas registradas via WhatsApp
SELECT category, COUNT(*) AS qtd, SUM(amount)::numeric(10,2) AS total
FROM expenses
WHERE added_by_name LIKE '% (WhatsApp)' AND created_at > now() - interval '3 days'
GROUP BY category
ORDER BY total DESC;

-- 5. Despesas desfeitas (contexto para entender confusões)
SELECT ts, raw_text
FROM whatsapp_audit_log
WHERE action = 'expense_undone' AND ts > now() - interval '3 days'
ORDER BY ts DESC;
```

**Possíveis saídas do período:**
- Continuar Fase 3 como planejado (consultas)
- Tunar prompt/schema do Gemini antes da Fase 3 (se `unknown_intent` > 15%)
- Reordenar backlog (ex: se lembretes forem mais valiosos que OCR, F6 vem antes de F4)

---

### Fase 3 — Consultas (intent `query`) ✅ CONCLUÍDA (2026-04-16)

**Entregue:** single-shot Gemini classifica + extrai `{period, category?, user_name?, custom_start?, custom_end?}`. Handler `handlers/query.ts` resolve janelas today/week/month/custom em Deno, filtra por categoria e por usuário (fuzzy match em `whatsapp_users.display_name`). Resposta pt-BR com total, top 3 gastos e agregação por categoria. Deploy v12. Plano: `docs/superpowers/plans/2026-04-16-phase3-queries.md`.

**Objetivo original:** inspiração tela 1 — "Quanto foi gasto na categoria saúde?"

**Entregáveis:**

| # | Item |
|---|---|
| 3.1 | Prompt + schema `query`: extrai `{period: "today"\|"week"\|"month"\|"custom", category?, user?, custom_start?, custom_end?}` |
| 3.2 | Handler `query.ts` — monta SELECT no Supabase com filtros resolvidos |
| 3.3 | Formatação pt-BR da resposta (R$ + totais + top 3 itens) |
| 3.4 | Router detecta `query` vs `expense` vs `unknown` via Gemini no 1º turno |
| 3.5 | Suporte a "quanto a Rossana gastou" — resolver por `display_name` em `whatsapp_users` |

**Exemplos que devem funcionar:**
- "quanto gastei esse mês"
- "quanto foi gasto em alimentação na semana"
- "resume abril pra mim"
- "quanto a Rossana gastou hoje"

---

### Fase 4 — OCR de cupom fiscal (intent `image`) ✅ CONCLUÍDA (2026-04-16)

**Entregue:** branch `imageMessage` no `index.ts` direciona para `handlers/image.ts`, que orquestra `evolution.getMediaBase64` → `gemini.interpretImage` (multimodal com `inlineData`) → `registerExpense` reaproveitado. Schema `IMAGE_EXPENSE_SCHEMA` reusa `ExpenseExtraction` direto (sem colunas novas). Caption entra como contexto extra delimitado (`<<<...>>>`) na mesma chamada Gemini (Q3/B). Sem confirmação (Q1/B), sem storage (Q5/A), 1 despesa = total agregado (Q4/A). Escopo: cupom fiscal + comprovante Pix/TED (Q2/C).

**Validado em E2E (v15, verify_jwt=false):** 3/3 cupons + 1/1 Pix inseridos com valor, categoria, data corretos; 1/1 selfie devolvida como `image_unsupported` sem insert. Latência p50 ~7.5s (download + Gemini multimodal + insert). Plano: `docs/superpowers/plans/2026-04-16-phase4-image-ocr.md`. Spec: `docs/superpowers/specs/2026-04-16-phase4-image-ocr-design.md`.

**Incidente/aprendizado:** deploy inicial (v14) regrediu `verify_jwt` para `true` (default do CLI Supabase), o que bloqueou Evolution no platform level antes do nosso código. Corrigido com `[functions.whatsapp-webhook] verify_jwt = false` no `config.toml` + redeploy como v15. Agora persistido.

**Objetivo original:** inspiração tela 2 — usuário tira foto da notinha, bot identifica itens.

**Entregáveis:**

| # | Item |
|---|---|
| 4.1 | Detectar `messageType = imageMessage` no payload Evolution |
| 4.2 | Baixar mídia via Evolution `/chat/getBase64FromMediaMessage/casaflow` |
| 4.3 | Enviar imagem pro Gemini 2.5 Flash (multimodal) com prompt de extração de cupom |
| 4.4 | Schema de saída: `{estabelecimento, data, valor_total, categoria_sugerida, itens?: Array}` |
| 4.5 | Fluxo de confirmação: bot manda "Identifiquei R$ 32,70 na Farmácia Brasil em 16/08/26. Confirma?" → usuário responde sim/não → insere |
| 4.6 | Salvar URL/hash da imagem em `expenses.notes` ou nova coluna `attachment_url` (decidir) |

**Decisão pendente:** armazenar a imagem (Supabase Storage) ou só a leitura estruturada? Recomendo: só leitura + hash por hora; storage vem depois se pedirem.

---

### Fase 5 — Mensagens de voz (intent `audio`)

**Objetivo:** inspiração tela 1 — bot responde com balão de áudio + texto; usuário também manda voz.

**Entregáveis:**

| # | Item |
|---|---|
| 5.1 | Detectar `messageType = audioMessage` |
| 5.2 | Baixar áudio (opus/ogg) |
| 5.3 | Transcrever via Gemini 2.5 Flash (aceita áudio nativamente) ou Whisper — preferir Gemini pra manter 1 provedor |
| 5.4 | Tratar transcrição como se fosse texto (reusar handler `expense`/`query`) |
| 5.5 | **(Opcional)** TTS de resposta: Google Cloud TTS → upload pra Supabase Storage → enviar via Evolution `/message/sendWhatsAppAudio` |

**Escopo mínimo da fase:** aceitar voz do usuário (transcrever). Responder com voz é plus — avaliar custo do TTS antes.

---

### Fase 6 — Lembretes automáticos (outbound) ✅ CONCLUÍDA (2026-04-16)

**Entregue:** Edge Function `whatsapp-reminders` separada (bearer auth via `REMINDERS_CRON_TOKEN`). pg_cron `0 12 * * *` UTC = 9h BRT (`jobid=4`, `active=true`). Janelas T-3 e T-1 em vez de única (decisão D2 override). Template pt-BR fixo em vez de Gemini (decisão D1 override — eliminou 1-2s latência + ponto de falha 503). Coluna `expenses.last_reminded_at` + index parcial. Validado: 3 msgs enviadas, idempotência confirmada. Plano: `docs/superpowers/plans/2026-04-16-phase6-reminders.md`.

**Objetivo original:** bot avisa antes de vencimento.

**Entregáveis:**

| # | Item |
|---|---|
| 6.1 | `pg_cron` diário às 9h (TZ America/Sao_Paulo) chamando uma Edge Function `whatsapp-reminders` |
| 6.2 | SELECT em `expenses` onde `status='pendente' AND due_date BETWEEN now() AND now()+3d` |
| 6.3 | Agrupar por `household_id`, enviar pra cada número ativo |
| 6.4 | Gemini só formata a mensagem amigável (não decide conteúdo) |
| 6.5 | Marcar despesa como "lembrada" pra não spammar (coluna `reminded_at`) |

---

### Fase 7 — Metas e painel (inspiração telas de Metas)

**Objetivo:** das telas "metas" e "metas_config" da inspiração — mas isso é **frontend + schema novo**. Fica pra depois que o WhatsApp estiver sólido.

**Entregáveis (alto nível):**
- Tabela `goals` (household_id, category, monthly_limit, current_month_total via view)
- View materializada `monthly_spending_by_category`
- Página `/metas` no React
- Intent `goal_query` no WhatsApp ("quanto falta da minha meta de alimentação?")

---

### Fase 8 — Subcategorias hierárquicas

**Objetivo:** dividir cada categoria-mãe em sub-itens estruturados (Alimentação → mercado, almoço, delivery, padaria, lanche...) pra permitir relatórios granulares e metas mais finas ("máximo R$ 300/mês em delivery").

**Decisão (2026-04-15):** fora do escopo das fases 2–7. Entra só depois da Fase 7 (metas por mãe) estar sólida — assim evaluamos se subcategoria é necessário com dados reais, ou se a descrição livre em `expenses.name` já basta.

**Entregáveis:**

| # | Item |
|---|---|
| 8.1 | Decidir arquitetura: tabela `categories` (id, parent_id, name, household_id) OU campo `expenses.subcategory text` + lista controlada no prompt |
| 8.2 | Migration correspondente + seed das ~30 subcategorias óbvias (mercado, uber, streaming, etc.) |
| 8.3 | Atualizar `schemas.ts` do Gemini incluindo `subcategoria` opcional + atualizar prompt `expense` com tabela parent→subs |
| 8.4 | `registerExpense` grava `subcategory` quando Gemini preencher |
| 8.5 | Frontend: seletor em cascata no New Entry; fallback "Outros" quando sub não se aplica |
| 8.6 | Relatórios: drilldown por categoria mãe → agregado por sub |
| 8.7 | (se Fase 7 concluída) meta por subcategoria além da por mãe |

---

## 3. Decisões de arquitetura que precisam da tua confirmação

| # | Decisão | Opção A | Opção B | Recomendação |
|---|---|---|---|---|
| D1 | Router de intent | Uma chamada Gemini classifica + extrai no mesmo turno | 1ª chamada classifica, 2ª extrai | **A** (mais rápido, mais barato) |
| D2 | Idempotência | Tabela `whatsapp_messages_seen` com `message_id` PK | Confiar na Evolution (tem `messageTimestamp`) | **A** (Evolution re-entrega em caso de timeout) |
| D3 | Storage de imagens | Não guardar (só leitura) | Supabase Storage | **Não guardar** até Fase 4 terminar |
| D4 | TTS na resposta | Sim (Google Cloud TTS) | Só texto | **Só texto** na Fase 5 inicial |
| D5 | Modelo Gemini | 2.5 Flash sempre | Flash pra expense, Pro pra query complexa | **Flash sempre** (suficiente, 10x mais barato) |
| D6 | Secrets | Supabase Secrets (Edge Function) | Vault externo | **Supabase Secrets** |
| D7 | CI/CD | Deploy manual via `supabase functions deploy` | GitHub Actions on push to main | **Manual na Fase 1, GHA depois da Fase 2** |

---

## 4. Tabelas novas a criar (por fase)

| Fase | Tabela | Motivo |
|---|---|---|
| 1 | `whatsapp_messages_seen` | idempotência |
| 2 | `whatsapp_audit_log` | observabilidade |
| 2 | `whatsapp_rate_limit` (opcional, pode derivar de audit_log) | proteção |
| 6 | coluna `expenses.reminded_at` | não spammar |
| 7 | `goals` + view `monthly_spending_by_category` | metas |

---

## 5. Critérios globais de qualidade

- Todo erro loga `{ts, phone, message_id, step, error, latency_ms}` como JSON.
- Toda resposta ao WhatsApp é pt-BR, curta (≤ 140 chars quando possível), usa emoji só em confirmação (✅ ❌ ⚠️).
- Nenhuma string hardcoded no código da função — textos em `messages.ts` (i18n-ready).
- Nenhuma chave de API no repo — `.env.example` documentado, `.gitignore` cobrindo `.env*`.
- Cada fase termina com: (a) checklist completo, (b) teste end-to-end gravado, (c) commit com mensagem padronizada.

---

## 6. Próxima ação concreta (Fase 1, item 1.1)

Criar migration `create_whatsapp_messages_seen`:

```sql
CREATE TABLE public.whatsapp_messages_seen (
  message_id text PRIMARY KEY,
  phone_number text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_whatsapp_messages_seen_received ON public.whatsapp_messages_seen(received_at);
ALTER TABLE public.whatsapp_messages_seen ENABLE ROW LEVEL SECURITY;
```

**Aguardo tua confirmação das decisões D1–D7 antes de seguir.** Se aceitar as recomendações em bloco, posso avançar com todas e começar o 1.1.
