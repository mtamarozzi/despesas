# Spec — Passo 4: Frontend de Receitas (`/receitas`) + card "Saldo do mês" no Dashboard

**Data:** 2026-04-17
**Autor:** Claude + Marcelo
**Fonte da SPEC:** `C:\Users\User\Documents\Despesas\docs\SPEC_DEFINITIVA_CASAFLOW.md` §7.4 (Receitas) + §10 (Dashboard reformulado, parcialmente antecipado)
**Relaciona-se com:** `PLANO_CONTINUIDADE.md` seção "SPEC DEFINITIVA — Passo 4"

## 1. Escopo

Entregar no CasaFlow web a primeira tela dedicada a **receitas** (entradas financeiras), espelhando o que hoje existe pra despesas. Inclui listagem mensal, filtros, CRUD completo por modal, transição de status "previsto → recebido" em 1 clique, e um card "Saldo do mês" no Dashboard antecipando a reforma do Passo 6.

Módulos de Metas, Recorrências e reforma completa do Dashboard ficam **fora** deste passo — cada um tem sua spec própria depois.

## 2. Decisões tomadas no brainstorming (2026-04-17)

| # | Decisão | Valor escolhido |
|---|---|---|
| D1 | Ordem de entrega | Receitas **antes** de Metas (diverge da SPEC oficial, mas Metas depende conceitualmente de receita conhecida) |
| D2 | Estrutura da entrada | Página `/receitas` dedicada (espelho de Despesas), **não** toggle em NewEntry |
| D3 | Escopo da V1 | Padrão: listar + filtros + totais + CRUD + transição previsto→recebido |
| D4 | Transição previsto→recebido | Botão inline verde "✓ Recebido" + toast "Desfazer" 5s (update otimista) |
| D5 | Layout da lista | Lista agrupada por mês com subtotal no header do grupo |
| D6 | Impacto no Dashboard | 1 card novo "Saldo do mês" lendo a view `monthly_summary` |
| D7 | Atribuição de usuário | Dropdown "Em nome de" (default = logado); `added_by_name` = logado sempre |
| D8a | Status default no form | "Recebido" |
| D8b | Confirmação ao excluir | Toast com Desfazer (5s) — mesmo padrão de "✓ Recebido" |
| D8c | Filtro de status default | "Todos" (recebidos + previstos visíveis) |

## 3. Arquitetura de arquivos

### 3.1 Novos arquivos em `src/`

| Arquivo | Responsabilidade |
|---|---|
| `hooks/useIncomes.js` | Stale-while-revalidate (template `useCategories`). Argumentos: `householdId`, `filters` ({ period, categoryId?, status?, userId? }). Retorna `{ incomes, loading, error, create, update, remove, markReceived, reload }`. Atualização local após cada mutation. Cancel pattern em todos os fetches. |
| `hooks/useHouseholdMembers.js` | Lista membros ativos do household via `household_members` join `profiles`. Retorna `{ members: [{user_id, display_name}], loading }`. Usado no dropdown "Em nome de" e no filtro de usuário. |
| `hooks/useMonthlySummary.js` | Lê view `monthly_summary` filtrando por `household_id` + `month_year` (default mês corrente). Retorna 1 objeto ou `null`. Método `reload()` para invalidar após mutations. |
| `pages/Incomes.jsx` | Página principal: header com 3 cards de totais, barra de filtros, lista agrupada por mês, botão "+ Nova receita". Monta `IncomeFormModal` em criar/editar. Toast manager in-page. |
| `pages/Incomes.css` | Tokens do tema (glass, radii, cores do design system). Grupos de mês, botão inline verde, toast. Responsivo ≤640px (totais 1 col, filtros scroll horizontal). |
| `components/IncomeFormModal.jsx` | Modal com 7 campos: nome, valor, data, categoria (dropdown income/both), "em nome de" (dropdown household_members), status (toggle recebido/previsto), notas. Modos "criar" e "editar". |
| `components/MonthlyBalanceCard.jsx` | Card pro Dashboard. Usa `useMonthlySummary`. Mostra "Saldo · {mês/ano}", valor grande colorido (verde ≥0, vermelho <0), subtítulos Recebido · Despesas. |
| `components/Toast.jsx` | Toast reaproveitável. Props: `{ message, actionLabel?, onAction?, variant: "success"|"error", duration: 5000 }`. Fila de 1 por vez. Se já existir alguma utility similar no projeto, reusar em vez de criar. |

### 3.2 Arquivos alterados

| Arquivo | Mudança |
|---|---|
| `components/Sidebar.jsx` | Adicionar item `{ id: 'incomes', label: 'Receitas', icon: TrendingUp }` entre `dashboard` e `new-entry`. |
| `components/Layout.jsx` | Adicionar Receitas ao `mobileMenuItems` (bottom nav). |
| `App.jsx` | `case 'incomes': return <Incomes user={session?.user} household={household} />`. |
| `pages/Dashboard.jsx` | Montar `<MonthlyBalanceCard household={household} />` como primeiro card (acima do fold). |

### 3.3 O que não muda

Página NewEntry (fluxo de despesa intocado) · CRUD de Categorias (Passo 3) · Edge Function `whatsapp-webhook` · migrations/views do Passo 1 · schema existente.

## 4. UX — detalhes por tela

### 4.1 Página `/receitas`

**Header (stack vertical):**
- Título "Receitas" + botão "+ Nova receita" (verde, CTA primário).
- Grid de 3 cards: **Recebido** (verde escuro), **Previsto** (âmbar escuro), **Total** (cinza do tema). Valores em R$ formatados pt-BR.
- Barra de filtros (inline): **Período** (default mês corrente · opções: Hoje / Semana / Mês atual / Mês anterior / Ano / Personalizado), **Categoria** (Todas + income/both), **Status** (Todos · Recebido · Previsto), **Em nome de** (Todos + membros ativos).
- "Personalizado" abre 2 inputs de data (início/fim) embaixo da barra — `<input type="date">` nativo, sem dependência nova.

**Lista:**
- Agrupada por mês (header `<MÊS ANO · N receitas>` + subtotal à direita).
- Ordenação `received_date desc` dentro do grupo.
- Cada item: nome em destaque + subtítulo `{categoria} · {dd/MM} · {display_name}`, valor à direita em verde.
- **Item com status "previsto":** em vez do menu "⋮", renderiza botão verde inline "✓ Recebido". Clique → `markReceived(id, { received_date: today })` otimista + toast "Marcado como recebido" com ação "Desfazer" (5s reverte).
- **Item com status "recebido":** menu "⋮" com **Editar** (abre modal em modo edição) e **Excluir** (otimista + toast "Receita excluída · Desfazer" 5s).
- Empty state: "Nenhuma receita em {período}" + botão "+ Nova receita".

**Filtros** aplicam imediatamente (sem botão "Aplicar"); estado local do componente, não sincronizado com query string na V1.

### 4.2 Modal `IncomeFormModal`

7 campos, validação client-side:
1. **Nome** (text, obrigatório, trim não-vazio).
2. **Valor** (input monetário pt-BR, obrigatório, > 0).
3. **Data** (date, default hoje, obrigatória).
4. **Categoria** (dropdown das categorias `type in ('income','both') and active=true`, obrigatório).
5. **Em nome de** (dropdown `useHouseholdMembers`, default = usuário logado, obrigatório).
6. **Status** (toggle 2 botões: Recebido / Previsto · default "Recebido" · obrigatório).
7. **Notas** (textarea, opcional).

Botões Cancelar (fecha modal) · Salvar (chama `create` ou `update`, fecha modal em sucesso). Erro do servidor → toast vermelho, modal continua aberto.

Gravação (criar):
- `household_id` = household atual
- `user_id` = seleção do dropdown "Em nome de"
- `added_by_name` = display_name do usuário logado
- `recurrence_id` = `null` (criação manual não amarra recorrência na V1)
- demais campos conforme form

Gravação (editar): atualiza os 7 campos editáveis; **`recurrence_id` e `added_by_name` preservados** (receitas vindas de recorrência continuam vinculadas; histórico de "quem lançou" é imutável).

### 4.3 Card "Saldo do mês" no Dashboard

Gradient de fundo (`#1e293b → #0c4a6e`). Label "SALDO · {MÊS/ANO}" em caps pequeno. Valor grande (28px bold) colorido: verde `#22c55e` se ≥0, vermelho `#ef4444` se <0. Rodapé flex: `Recebido R$ X` (verde pequeno) · `Despesas R$ Y` (vermelho pequeno).

Lê `monthly_summary` via `useMonthlySummary` com `month_year = primeiro dia do mês corrente`.

### 4.4 Responsividade

`≤640px`: grid de totais colapsa pra 1 coluna; barra de filtros vira scroll horizontal; lista mantém 1 coluna (natural); modal ocupa ~95% da largura. Breakpoint igual ao resto do projeto.

## 5. Data flow

```
Incomes.jsx
├── useHouseholdMembers(householdId) → membros pro dropdown/filtro
├── useIncomes(householdId, filters) → incomes + mutations
└── (no submit de IncomeFormModal) chama create/update
    → otimista: atualiza estado local imediato
    → request Supabase (insert/update/delete em public.incomes)
    → sucesso: mantém estado; falha: reverte + toast erro

Dashboard.jsx
└── MonthlyBalanceCard
    └── useMonthlySummary(householdId) → view monthly_summary
```

RLS já criadas no Passo 1 (`household_members.user_id = auth.uid()`) garantem isolamento — nenhuma policy nova.

## 6. Edge cases

| Caso | Comportamento |
|---|---|
| Household sem categorias income | Dropdown vazio + link "Criar em Ajustes". Não acontece em produção (seed tem 6) mas é salvaguarda. |
| Mês sem receitas | Empty state com CTA "+ Nova receita". |
| Mutation falha no servidor | Reverte estado local + toast vermelho "Não foi possível {ação}. Tente de novo." |
| Categoria excluída enquanto receita existe | `ON DELETE SET NULL` já trata. UI mostra "Sem categoria" no item. |
| Usuário desativado no household | Some do dropdown; continua aparecendo no histórico com `display_name` gravado. |
| Receita criada via WhatsApp | Aparece igual na lista (ambos escrevem em `public.incomes`). Card Dashboard pode ficar stale até reload — aceitável V1. |
| Toast perdido em navegação | Ação vira permanente (undo é in-memory). Aceitável. |

## 7. Riscos

- **Bug de sessão zumbi (herdado do Passo 3):** `auth.uid()` pode apontar pra usuário deletado, quebrando hooks com "user not found". **Mitigação:** incluir no plano deste passo a correção `getUser()` após `getSession()` em `App.jsx` — destrava permanentemente.
- **Card Dashboard stale entre abas:** `useMonthlySummary` lê 1x ao montar. Mutations em outra aba não refletem sem reload. Aceitável na V1; V2 pode adicionar realtime Supabase ou polling leve.

## 8. Validação / critério de pronto

**Estática:**
- `npm run build` zero erros.
- `npx eslint src/pages/Incomes.jsx src/components/IncomeFormModal.jsx src/components/MonthlyBalanceCard.jsx src/hooks/useIncomes.js src/hooks/useHouseholdMembers.js src/hooks/useMonthlySummary.js` zero erros/warnings no código novo.

**E2E manual em produção (`casa.hubautomacao.pro/receitas`):**
1. Criar receita com status "Recebido" → aparece na lista, card Dashboard atualiza após reload.
2. Criar receita "Previsto" → clicar "✓ Recebido" → toast Undo → aguardar 5s → confirma virou recebida.
3. Criar "Previsto" → clicar "✓ Recebido" → clicar Desfazer dentro de 5s → volta pro estado previsto.
4. Editar receita no modal → salvar → reflete na lista.
5. Excluir → toast Undo → Desfazer → reaparece.
6. Filtrar por categoria/status/usuário → totais recalculam; mudança imediata.
7. Criar receita pelo WhatsApp ("recebi 200 de aluguel") → após reload, aparece em `/receitas` e card Dashboard atualiza.
8. Mobile (DevTools 375px): totais em 1 col, filtros scroll horizontal, lista legível, modal confortável.

**Finalização do workflow:**
- Atualizar `PLANO_CONTINUIDADE.md` com seção "SPEC DEFINITIVA — Passo 4 ✅ CONCLUÍDO" contendo arquivos criados/alterados, decisões e validação.
- Commit com mensagem no padrão do repo + push pro GitHub.

## 9. Ganchos pros próximos passos

- **Passo 5 (Metas):** consome `goal_progress`. Nada do Passo 4 bloqueia.
- **Passo 6 (Dashboard reformulado):** `MonthlyBalanceCard` é a peça inicial — expande com gráficos, metas, tendências.
- **Passo 7 (Recorrências):** ativa badge 🔁 na lista de receitas e cria CRUD de `public.recurrences`.

## 10. Fora de escopo deste passo

- Vínculo visual com recorrências (badge 🔁) → Passo 7.
- Gráficos de evolução / comparativo receitas × despesas → Passo 6.
- Saldo projetado ajustado por metas → Passo 5.
- Bulk actions (excluir N receitas) → backlog.
- Exportação CSV/PDF → backlog.
- Realtime Supabase para sincronizar abas → backlog.
