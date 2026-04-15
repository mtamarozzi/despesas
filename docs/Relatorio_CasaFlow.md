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
    *   **F1.8 em andamento (2026-04-15):** Edge Function deployada via `supabase functions deploy --no-verify-jwt` após hotfix — prompt do Gemini extraído para `prompts.ts` (inlineado como string TS) porque `Deno.readTextFile` de `.md` com `import.meta.url` falha no runtime da Edge Function. Smoke test de auth passou (401 com token inválido). Webhook da instância `casaflow` configurado via script `scripts/configure-webhook.ps1` apontando para a Edge Function com `Authorization: Bearer` + event `MESSAGES_UPSERT`. Falta apenas o teste end-to-end real (mensagem WhatsApp de Marcelo para ele mesmo).
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
*Última atualização: 15 de Abril de 2026 — F1.8 webhook configurado, aguardando teste end-to-end*
