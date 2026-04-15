# Relatório de Desenvolvimento: CasaFlow
**Status:** Versão 1.1 (Produção + Assistente WhatsApp em desenvolvimento)
**Arquitetura:** Modern Web Application (SPA) + BaaS (Supabase) + WhatsApp Gateway (Evolution API) + IA (Gemini 2.5 Flash)

---

### 1. Linha do Tempo e Marcos Principais
O desenvolvimento seguiu uma trajetória de evolução rápida, focando inicialmente na funcionalidade básica e expandindo para recursos avançados de colaboração familiar.

*   **Fase 1: Fundação (Março/Abril 2026)**
    *   Setup inicial com **React 19** e **Vite**.
    *   Configuração do banco de dados **PostgreSQL** via **Supabase**.
    *   Criação das telas base: Dashboard, Login e Cadastro de Despesas.
*   **Fase 2: Inteligência e Visualização**
    *   Implementação de gráficos dinâmicos com **Chart.js**.
    *   Criação da **Visualização em Calendário**, permitindo ver gastos por data de forma intuitiva.
    *   Desenvolvimento do módulo de **Relatórios** detalhados.
*   **Fase 3: Colaboração Familiar**
    *   Criação do sistema de **Household (Família)**, permitindo que múltiplos usuários compartilhem o mesmo orçamento.
    *   Implementação de segurança via **JWT Metadata**, garantindo que os dados de uma família fiquem isolados e seguros.
*   **Fase 4: Refinamento e Branding**
    *   Tradução completa da interface para **Português (PT-BR)**.
    *   Ajuste de **Responsividade** para funcionamento perfeito em Celulares, Tablets e Desktops.
    *   Rebranding oficial para **CasaFlow**, com novo logotipo e interface *Glassmorphism* (efeito de vidro).
*   **Fase 5: Assistente WhatsApp (Em andamento — Abril 2026)**
    *   Integração **Evolution API** rodando em VPS Hostinger (instância `casaflow` conectada).
    *   Preparação do banco (**Fase 0 concluída**): tabelas `whatsapp_users`, `whatsapp_context`, household "Casa" com 2 membros reais, número 5514998885355 vinculado.
    *   Planejamento detalhado da **Fase 1 (MVP)**: Edge Function `whatsapp-webhook` que interpreta mensagens via **Gemini 2.5 Flash** e registra despesas automaticamente.
    *   **F1.1 concluída (2026-04-15):** migration `create_whatsapp_messages_seen` aplicada — tabela de idempotência do webhook (evita processar eventos duplicados da Evolution).
    *   **F1.2 concluída (2026-04-15):** `supabase init` + `supabase link --project-ref jeyllykzwtixfzeybkkl` no diretório `ethereal-ledger/` (CLI oficial versão 2.90.0).
    *   **F1.3 concluída (2026-04-15):** scaffold modular da Edge Function `whatsapp-webhook/` com 10 arquivos (handler HTTP, clientes Evolution/Gemini/Supabase, types, utils, handlers, prompts). Lógica completa será adicionada em F1.4 e F1.5.
    *   **F1.4 concluída (2026-04-15):** integração real com **Gemini 2.5 Flash** via `fetch` nativo. `responseSchema` unificado (intent + extração numa chamada, decisão D1) + prompt sistema em pt-BR com regras das 6 categorias, resolução de datas relativas, critérios `pago`/`pendente` e gatilhos de erro. `temperature=0.2` para determinismo.
    *   **F1.5 concluída (2026-04-15):** router de intent ligado no `index.ts` + fluxo completo de clarificação multi-turno via tabela `whatsapp_context`. 3 caminhos: (a) payload completo → insere despesa + limpa contexto + confirma; (b) `intent=expense` com `erro` → grava contexto com texto combinado + pergunta de clarificação; (c) `intent=unknown` → limpa contexto + mensagem padrão. Ao receber nova mensagem com contexto pendente, textos são concatenados antes de chamar o Gemini (resolve "gastei 80" → "de quê?" → "mercado" numa inserção única).
    *   **F1.6 concluída (2026-04-15):** suite de smoke tests via curl em `tests/whatsapp-webhook/` com 6 casos (token inválido, fromMe, número bloqueado, despesa clara, despesa ambígua, follow-up de clarificação). Fixtures JSON + script `run.sh` que injeta IDs únicos por execução para evitar bloqueio pela idempotência.
    *   **F1.7 concluída (2026-04-15):** 3 secrets (`GEMINI_API_KEY`, `EVOLUTION_API_KEY`, `EVOLUTION_WEBHOOK_TOKEN`) configurados no painel do Supabase. Evolution API key rotacionada após exposição prévia.
    *   **F1.8 concluída (2026-04-15):** Edge Function deployada via `supabase functions deploy --no-verify-jwt` após hotfix — prompt do Gemini extraído para `prompts.ts` (inlineado como string TS) porque `Deno.readTextFile` de `.md` com `import.meta.url` falha no runtime da Edge Function. Webhook da instância `casaflow` configurado via script `scripts/configure-webhook.ps1` apontando para a Edge Function com `Authorization: Bearer` + event `MESSAGES_UPSERT`. Adicionados 2 números de teste em `whatsapp_users` (Rossana + linha 2 do Marcelo) pra contornar a limitação de `fromMe=true` quando o bot compartilha número com o dono.
    *   **F1.9 concluída (2026-04-15) — MVP VALIDADO EM PRODUÇÃO:** teste end-to-end real passou de ambas as linhas (Rossana e Marcelo linha 2) com a mensagem "paguei 120 de luz hoje". Gemini retornou descrição "conta de luz", categoria Habitação, data correta, status "pago". 2 despesas inseridas em `expenses` com `added_by_name` correto. Confirmação no WhatsApp chegou em ~5 segundos: "✅ R$ 120,00 em Habitação registrado (conta de luz)". **Fase 1 completa.**
    *   **F1-hotfix SPA (2026-04-15):** após deploy na Vercel (casa.hubautomacao.pro), o frontend travou no loading "Configurando CasaFlow...". Causa: o `user_metadata.household_id` dos usuários apontava para households antigos deletados na limpeza da F0. Fix: renomeado household atual de "Casa" para "CasaFlow" (bate com o search do `App.jsx:57`) e atualizado `auth.users.raw_user_meta_data.household_id` de Marcelo e Rossana para o UUID correto `f5a5bd3f-9fbf-4d78-9b18-8d51b998b35e`. Usuários precisaram fazer logout/login para o JWT pegar o metadata novo. App voltou ao normal, mostrando as 2 despesas de teste.
*   **Fase 6: Fase 2 do Assistente WhatsApp (Em andamento — Abril 2026)**
    *   **F2.0 concluída (2026-04-15):** `App.jsx` refatorado com self-healing do `fetchHousehold` — extraído helper `findOrCreateDefaultHousehold` e alterada a ordem de tentativa: agora primeiro tenta `maybeSingle` pelo id do metadata (não mais `.single()` que bloqueava por erro); se vier vazio, cai automaticamente no fluxo de buscar/criar "CasaFlow" e atualizar o metadata do usuário. Evita que nova limpeza/rotação do banco no futuro trave o SPA de novo.
    *   **F2.6 concluída (2026-04-15):** migration `create_whatsapp_audit_log` aplicada. Tabela registra cada interação (message_id, phone_number, direction inbound/outbound, intent, action, success, latency_ms, error_code, raw_text) com índices por phone+ts e ts. É a fundação para F2.3 (rate limit por janela de 1h) e F2.5 (análise de frases que o Gemini mais erra).
    *   **F2.5 concluída (2026-04-15):** todas as strings do bot extraídas para `messages.ts` com 2–3 variações sorteadas em cada situação (confirma despesa, não autorizado, texto não reconhecido, erro de sistema, rate limit). Adicionado `audit.ts` com função `logAudit()` invocada em cada caminho do `index.ts` (duplicate, unauthorized, non_text, expense_inserted, context_saved, unknown_intent, handler_error). Função `registerExpense` passa a usar `msgConfirmExpense()`. Deploy via CLI validado.
    *   **Decisão (2026-04-15):** subcategorias hierárquicas (Alimentação → mercado/delivery/padaria) saem do escopo das fases 2–7 e viram **Fase 8** no `PLANO_CONTINUIDADE.md`. Motivo: mantém foco no MVP e permite decisão de schema (tabela vs lista controlada) baseada em uso real das categorias-mãe antes de adicionar complexidade.
    *   **F2.2 concluída (2026-04-15) — comando /desfazer validado em produção:** schema Gemini ganhou intent `undo` (enum agora é `expense | unknown | undo`); prompt atualizado com exemplos ("desfazer", "apaga último", "errei, apaga", "anula"). Novo `handlers/undo.ts` busca a última despesa do usuário com `added_by_name LIKE '% (WhatsApp)'` criada nos últimos 10min, deleta, e responde com mensagem humanizada. Se não achar, retorna resposta de "nada pra desfazer". Teste end-to-end: (1) "paguei 50 no almoço" → inserção + confirmação; (2) "desfazer" → remoção + confirmação; (3) "desfazer" de novo → "nada pra desfazer". Auditoria com `action='expense_undone'` e `action='undo_nothing'` gravada em `whatsapp_audit_log`.
    *   **F2.3 concluída (2026-04-15) — rate limit validado em produção:** novo módulo `rate-limit.ts` conta inbounds do `whatsapp_audit_log` em janela deslizante de 60min; se >= 30, bloqueia **antes** de chamar o Gemini (economiza custo). Colocado após resolução de usuário e antes do processamento de texto. Teste forçado via seed de 28 linhas fake em `whatsapp_audit_log`: total chegou a 31/30 → mensagem subsequente recebeu resposta humanizada "Calma, estamos indo rápido demais 😅" e `action='rate_limited'` gravado. Seed limpo após validação.
    *   **F2.4 concluída (2026-04-15) — pg_cron habilitado + 3 jobs de cleanup:** migration `enable_pg_cron_cleanup_jobs` aplicada. Jobs criados e ativos: (a) `whatsapp_context_cleanup` a cada 5min — remove contextos com `expires_at < now()`; (b) `whatsapp_messages_seen_cleanup` às 03:00 UTC diário — remove registros > 7 dias; (c) `whatsapp_audit_log_cleanup` aos domingos 04:00 UTC — retém 90 dias de auditoria. Migration é idempotente (faz unschedule dos jobs de mesmo nome antes de recriar) — pode rodar de novo sem erro. **Fase 2 completa.**
    *   Documentos vivos do assistente: `docs/PLANO_CONTINUIDADE.md` (roadmap até Fase 7) e `docs/RELATORIO_CASAFLOW_WHATSAPP.md` (estado técnico detalhado).

---

### 2. Funcionalidades Implementadas
O CasaFlow não é apenas um rastreador de despesas, é uma plataforma de gestão financeira colaborativa:

*   **Dashboard Inteligente:** Resumo visual imediato de gastos, saldo e categorias principais.
*   **Gestão de Despesas:** Fluxo simplificado para adicionar, editar e excluir despesas com suporte a categorias.
*   **Calendário de Gastos:** Interface visual que facilita o planejamento financeiro mensal.
*   **Sistema de Família:** Permite convidar membros para a mesma conta, onde todos podem adicionar despesas e visualizar o saldo comum.
*   **Relatórios Avançados:** Filtros e análises por categoria e período.
*   **Segurança de Dados:** Uso de RLS (Row Level Security) do Supabase para garantir privacidade total dos dados.

---

### 3. Especificações Técnicas
| Componente | Tecnologia | Benefício |
| :--- | :--- | :--- |
| **Front-end** | React 19 + Vite | Interface ultrarrápida e moderna. |
| **Banco de Dados** | PostgreSQL (Supabase) | Nível bancário de robustez e confiabilidade. |
| **Autenticação** | Supabase Auth | Login seguro com criptografia de ponta. |
| **Gráficos** | Chart.js | Visualização de dados clara e profissional. |
| **Estilização** | Vanilla CSS (Modern) | Design exclusivo com efeito glassmorphism. |

---

### 4. Diferenciais Competitivos
1.  **Tempo de Resposta:** Devido ao uso de Vite e React 19, o app é instantâneo.
2.  **Custo de Infraestrutura:** A arquitetura *Serverless* permite que o sistema escale sem a necessidade de servidores caros.
3.  **Colaboração em Tempo Real:** Alterações feitas por um membro da família aparecem instantaneamente para os outros membros.

---
*Última atualização: 15 de Abril de 2026 — **Fase 2 concluída** (F2.4 pg_cron + todos os cleanup jobs ativos).*
