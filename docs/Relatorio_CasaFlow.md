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
*Última atualização: 15 de Abril de 2026 — F1.1 (migration de idempotência) concluída*
