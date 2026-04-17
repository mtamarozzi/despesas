# Plano de Implementação — Passo 4: Tela de Receitas

> **Para agentes:** SUB-SKILL OBRIGATÓRIA: Use `superpowers:subagent-driven-development` (recomendado) ou `superpowers:executing-plans` pra implementar esse plano tarefa a tarefa. Os passos usam checkbox (`- [ ]`) pra rastreamento.

**Goal:** entregar uma tela `/receitas` completa (listar + filtros + totais + CRUD + transição previsto→recebido) e um card "Saldo do mês" no Dashboard, sobre o schema de `public.incomes` já criado no Passo 1.

**Arquitetura:** 3 hooks novos (`useIncomes`, `useHouseholdMembers`, `useMonthlySummary`) seguindo o template stale-while-revalidate do projeto; 1 página nova (`Incomes.jsx`); 3 componentes (`IncomeFormModal`, `MonthlyBalanceCard`, `Toast`). Integração via `App.jsx` (novo case `'incomes'`), `Sidebar.jsx`, `Layout.jsx`, `Dashboard.jsx`. Inclui fix do bug de sessão zumbi herdado do Passo 3.

**Tech Stack:** React 19 · Vite 8 · Supabase JS 2.99 · lucide-react 0.577 (sem TypeScript; validação = `npm run build` + `npm run lint` + E2E manual em produção Vercel).

**Spec:** `docs/superpowers/specs/2026-04-17-passo4-receitas-design.md`.

---

## Convenções usadas no plano

- Working dir: `C:\Users\User\Documents\Despesas\ethereal-ledger\`
- Cliente Supabase: `import { supabase } from '../utils/supabaseClient'` (hooks) / `import { supabase } from './utils/supabaseClient'` (ajustar conforme depth).
- Ícones: `import { X, TrendingUp } from 'lucide-react'` e renderizar `<X size={20} />` ou `<item.icon size={20} />`.
- Moeda pt-BR: `new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor)`.
- Data ISO: toda ida/volta com o banco usa `YYYY-MM-DD`; UI converte via `new Date().toISOString().slice(0,10)`.
- CSS: variáveis `--primary-color`, `--accent-green`, `--accent-red`, `--accent-orange`, `--surface-color`, `--text-primary`, `--text-secondary`, `--border-color`, `--radius-md/lg/xl`. Classe utilitária `.glass`.
- Sem TDD: cada task termina com `npm run build` + smoke manual + commit.
- Mensagens de commit: padrão `<tipo>(passo-4): <descricao-curta-ptbr>`. Tipo = `feat`, `fix`, `style`, `refactor`, `docs`.

---

## Mapa de arquivos

**Novos:**
- `src/hooks/useIncomes.js`
- `src/hooks/useHouseholdMembers.js`
- `src/hooks/useMonthlySummary.js`
- `src/pages/Incomes.jsx`
- `src/pages/Incomes.css`
- `src/components/IncomeFormModal.jsx`
- `src/components/IncomeFormModal.css`
- `src/components/MonthlyBalanceCard.jsx`
- `src/components/MonthlyBalanceCard.css`
- `src/components/Toast.jsx`
- `src/components/Toast.css`

**Alterados:**
- `src/components/Sidebar.jsx` — item "Receitas" entre Dashboard e NewEntry.
- `src/components/Layout.jsx` — item "Receitas" no `mobileMenuItems`.
- `src/App.jsx` — `case 'incomes'` + fix sessão zumbi.
- `src/pages/Dashboard.jsx` — montar `<MonthlyBalanceCard />` como primeiro card.
- `PLANO_CONTINUIDADE.md` (raiz) — seção "Passo 4 ✅ CONCLUÍDO" ao fim.

---

## Task 1: Hook `useHouseholdMembers`

**Files:**
- Create: `src/hooks/useHouseholdMembers.js`

- [ ] **Passo 1.1: Criar o arquivo com o hook**

```javascript
import { useEffect, useState } from 'react';
import { supabase } from '../utils/supabaseClient';

// null = carregando, array = carregado (pode ser vazio)
export function useHouseholdMembers(householdId) {
  const [members, setMembers] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!householdId) return undefined;
    let cancelled = false;
    supabase
      .from('household_members')
      .select('user_id, profiles:profiles(id, display_name, email)')
      .eq('household_id', householdId)
      .then(({ data, error: err }) => {
        if (cancelled) return;
        if (err) {
          setError(err.message);
          setMembers([]);
          return;
        }
        const flat = (data ?? [])
          .map((row) => ({
            user_id: row.user_id,
            display_name:
              row.profiles?.display_name?.trim() || row.profiles?.email || 'Sem nome',
          }))
          .sort((a, b) => a.display_name.localeCompare(b.display_name, 'pt-BR'));
        setError(null);
        setMembers(flat);
      });
    return () => {
      cancelled = true;
    };
  }, [householdId]);

  return {
    members: members ?? [],
    loading: members === null,
    error,
  };
}
```

- [ ] **Passo 1.2: Validar com build**

Rodar: `npm run build`
Esperado: build passa sem erros novos (pode ter warnings pré-existentes de outros arquivos).

- [ ] **Passo 1.3: Lintar o arquivo novo**

Rodar: `npx eslint src/hooks/useHouseholdMembers.js`
Esperado: zero problemas.

- [ ] **Passo 1.4: Commit**

```bash
git add src/hooks/useHouseholdMembers.js
git commit -m "feat(passo-4): hook useHouseholdMembers para dropdown Em nome de"
```

---

## Task 2: Hook `useMonthlySummary`

**Files:**
- Create: `src/hooks/useMonthlySummary.js`

- [ ] **Passo 2.1: Criar o arquivo**

```javascript
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../utils/supabaseClient';

// undefined = carregando, null = sem dados, obj = carregado
export function useMonthlySummary(householdId, monthYear) {
  const [summary, setSummary] = useState(undefined);
  const [error, setError] = useState(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!householdId || !monthYear) return undefined;
    let cancelled = false;
    supabase
      .from('monthly_summary')
      .select('*')
      .eq('household_id', householdId)
      .eq('month_year', monthYear)
      .maybeSingle()
      .then(({ data, error: err }) => {
        if (cancelled) return;
        if (err) {
          setError(err.message);
          setSummary(null);
          return;
        }
        setError(null);
        setSummary(data ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [householdId, monthYear, reloadToken]);

  const reload = useCallback(() => setReloadToken((n) => n + 1), []);

  return {
    summary,
    loading: summary === undefined,
    error,
    reload,
  };
}

// Helper: primeiro dia do mês corrente em formato YYYY-MM-01
export function currentMonthYear() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  return `${yyyy}-${mm}-01`;
}
```

- [ ] **Passo 2.2: Build + lint**

```bash
npm run build
npx eslint src/hooks/useMonthlySummary.js
```
Esperado: sem erros.

- [ ] **Passo 2.3: Commit**

```bash
git add src/hooks/useMonthlySummary.js
git commit -m "feat(passo-4): hook useMonthlySummary para o card Saldo do mes"
```

---

## Task 3: Hook `useIncomes`

**Files:**
- Create: `src/hooks/useIncomes.js`

- [ ] **Passo 3.1: Criar o arquivo**

```javascript
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../utils/supabaseClient';

// null = carregando, array = carregado
export function useIncomes(householdId, filters) {
  const [incomes, setIncomes] = useState(null);
  const [error, setError] = useState(null);
  const [reloadToken, setReloadToken] = useState(0);

  const { startDate, endDate, categoryId, status, userId } = filters || {};

  useEffect(() => {
    if (!householdId) return undefined;
    let cancelled = false;
    let q = supabase
      .from('incomes')
      .select(
        'id, name, amount, received_date, status, notes, user_id, category_id, added_by_name, recurrence_id, created_at, updated_at, categories:categories(id, name, icon, color)',
      )
      .eq('household_id', householdId)
      .order('received_date', { ascending: false })
      .order('created_at', { ascending: false });

    if (startDate) q = q.gte('received_date', startDate);
    if (endDate) q = q.lte('received_date', endDate);
    if (categoryId) q = q.eq('category_id', categoryId);
    if (status) q = q.eq('status', status);
    if (userId) q = q.eq('user_id', userId);

    q.then(({ data, error: err }) => {
      if (cancelled) return;
      if (err) {
        setError(err.message);
        setIncomes([]);
        return;
      }
      setError(null);
      setIncomes(data ?? []);
    });

    return () => {
      cancelled = true;
    };
  }, [householdId, startDate, endDate, categoryId, status, userId, reloadToken]);

  const reload = useCallback(() => setReloadToken((n) => n + 1), []);

  const create = useCallback(
    async (input) => {
      const payload = {
        household_id: householdId,
        user_id: input.user_id,
        name: input.name.trim(),
        amount: Number(input.amount),
        category_id: input.category_id || null,
        received_date: input.received_date,
        status: input.status || 'recebido',
        notes: input.notes?.trim() || null,
        added_by_name: input.added_by_name,
        recurrence_id: null,
      };
      const { data, error: err } = await supabase
        .from('incomes')
        .insert(payload)
        .select(
          'id, name, amount, received_date, status, notes, user_id, category_id, added_by_name, recurrence_id, created_at, updated_at, categories:categories(id, name, icon, color)',
        )
        .single();
      if (err) throw err;
      setIncomes((prev) => [data, ...(prev ?? [])]);
      return data;
    },
    [householdId],
  );

  const update = useCallback(async (id, patch) => {
    const payload = {};
    if (patch.name !== undefined) payload.name = patch.name.trim();
    if (patch.amount !== undefined) payload.amount = Number(patch.amount);
    if (patch.category_id !== undefined) payload.category_id = patch.category_id || null;
    if (patch.received_date !== undefined) payload.received_date = patch.received_date;
    if (patch.status !== undefined) payload.status = patch.status;
    if (patch.notes !== undefined) payload.notes = patch.notes?.trim() || null;
    if (patch.user_id !== undefined) payload.user_id = patch.user_id;

    const { data, error: err } = await supabase
      .from('incomes')
      .update(payload)
      .eq('id', id)
      .select(
        'id, name, amount, received_date, status, notes, user_id, category_id, added_by_name, recurrence_id, created_at, updated_at, categories:categories(id, name, icon, color)',
      )
      .single();
    if (err) throw err;
    setIncomes((prev) => (prev ?? []).map((r) => (r.id === id ? data : r)));
    return data;
  }, []);

  const remove = useCallback(async (id) => {
    const { error: err } = await supabase.from('incomes').delete().eq('id', id);
    if (err) throw err;
    setIncomes((prev) => (prev ?? []).filter((r) => r.id !== id));
  }, []);

  const markReceived = useCallback(
    async (id, receivedDate) => {
      return update(id, {
        status: 'recebido',
        received_date: receivedDate || new Date().toISOString().slice(0, 10),
      });
    },
    [update],
  );

  return {
    incomes: incomes ?? [],
    loading: incomes === null,
    error,
    reload,
    create,
    update,
    remove,
    markReceived,
  };
}
```

- [ ] **Passo 3.2: Build + lint**

```bash
npm run build
npx eslint src/hooks/useIncomes.js
```
Esperado: sem erros.

- [ ] **Passo 3.3: Commit**

```bash
git add src/hooks/useIncomes.js
git commit -m "feat(passo-4): hook useIncomes com filtros e CRUD + markReceived"
```

---

## Task 4: Componente `Toast`

**Files:**
- Create: `src/components/Toast.jsx`
- Create: `src/components/Toast.css`

- [ ] **Passo 4.1: Criar `Toast.css`**

```css
.toast-container {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 1000;
  pointer-events: none;
}

.toast {
  background: var(--surface-color);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-main);
  padding: 12px 16px;
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 260px;
  max-width: 420px;
  pointer-events: auto;
  animation: toast-in 0.22s ease-out;
  color: var(--text-primary);
}

.toast.toast-success { border-left: 3px solid var(--accent-green); }
.toast.toast-error { border-left: 3px solid var(--accent-red); }

.toast-message { flex: 1; font-size: 14px; }

.toast-action {
  background: transparent;
  border: 0;
  color: var(--primary-color);
  font-weight: 600;
  cursor: pointer;
  font-size: 13px;
  padding: 4px 8px;
}

.toast-action:hover { text-decoration: underline; }

@keyframes toast-in {
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: translateY(0); }
}
```

- [ ] **Passo 4.2: Criar `Toast.jsx`**

```jsx
import { useEffect } from 'react';
import './Toast.css';

export function Toast({ message, actionLabel, onAction, variant = 'success', duration = 5000, onClose }) {
  useEffect(() => {
    if (!duration) return undefined;
    const timer = setTimeout(() => {
      if (onClose) onClose();
    }, duration);
    return () => clearTimeout(timer);
  }, [duration, onClose]);

  if (!message) return null;

  return (
    <div className="toast-container">
      <div className={`toast toast-${variant}`}>
        <span className="toast-message">{message}</span>
        {actionLabel && onAction ? (
          <button
            type="button"
            className="toast-action"
            onClick={() => {
              onAction();
              if (onClose) onClose();
            }}
          >
            {actionLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}
```

- [ ] **Passo 4.3: Build + lint**

```bash
npm run build
npx eslint src/components/Toast.jsx
```

- [ ] **Passo 4.4: Commit**

```bash
git add src/components/Toast.jsx src/components/Toast.css
git commit -m "feat(passo-4): componente Toast reaproveitavel com acao Desfazer"
```

---

## Task 5: Componente `IncomeFormModal`

**Files:**
- Create: `src/components/IncomeFormModal.jsx`
- Create: `src/components/IncomeFormModal.css`

- [ ] **Passo 5.1: Criar `IncomeFormModal.css`**

```css
.income-modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(4px);
  z-index: 900;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.income-modal {
  background: var(--surface-color);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-main);
  width: 100%;
  max-width: 460px;
  max-height: 92vh;
  overflow-y: auto;
  padding: 20px;
}

.income-modal header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.income-modal header h2 {
  font-size: 18px;
  margin: 0;
  color: var(--text-primary);
}

.income-modal-close {
  background: transparent;
  border: 0;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 4px;
  border-radius: var(--radius-sm);
}

.income-modal-close:hover { background: var(--surface-alt); }

.income-form { display: grid; gap: 12px; }

.income-form label {
  display: grid;
  gap: 4px;
  font-size: 12px;
  color: var(--text-secondary);
}

.income-form input,
.income-form select,
.income-form textarea {
  background: var(--surface-alt);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  color: var(--text-primary);
  padding: 10px 12px;
  font-family: var(--font-main);
  font-size: 14px;
  width: 100%;
  box-sizing: border-box;
}

.income-form input:focus,
.income-form select:focus,
.income-form textarea:focus {
  outline: 2px solid var(--primary-color);
  outline-offset: 0;
}

.income-form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }

.income-status-toggle { display: flex; gap: 6px; }

.income-status-toggle button {
  flex: 1;
  padding: 10px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-color);
  background: var(--surface-alt);
  color: var(--text-secondary);
  cursor: pointer;
  font-weight: 500;
  font-size: 14px;
}

.income-status-toggle button.active.recebido {
  background: var(--accent-green);
  color: white;
  border-color: var(--accent-green);
}

.income-status-toggle button.active.previsto {
  background: var(--accent-orange);
  color: white;
  border-color: var(--accent-orange);
}

.income-form-actions { display: flex; gap: 8px; margin-top: 8px; }

.income-form-actions button {
  flex: 1;
  padding: 12px;
  border-radius: var(--radius-md);
  border: 0;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.income-form-cancel { background: var(--surface-alt); color: var(--text-secondary); }

.income-form-submit { background: var(--accent-green); color: white; }

.income-form-submit:disabled { opacity: 0.6; cursor: not-allowed; }

.income-form-error {
  background: rgba(255, 71, 87, 0.12);
  border: 1px solid var(--accent-red);
  color: var(--accent-red);
  padding: 8px 12px;
  border-radius: var(--radius-md);
  font-size: 13px;
}

@media (max-width: 640px) {
  .income-form-row { grid-template-columns: 1fr; }
}
```

- [ ] **Passo 5.2: Criar `IncomeFormModal.jsx`**

```jsx
import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import './IncomeFormModal.css';

const EMPTY = {
  name: '',
  amount: '',
  received_date: new Date().toISOString().slice(0, 10),
  category_id: '',
  user_id: '',
  status: 'recebido',
  notes: '',
};

export function IncomeFormModal({ open, mode, income, categories, members, currentUserId, onSubmit, onClose }) {
  const [form, setForm] = useState(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open) return;
    if (mode === 'edit' && income) {
      setForm({
        name: income.name ?? '',
        amount: String(income.amount ?? ''),
        received_date: income.received_date ?? new Date().toISOString().slice(0, 10),
        category_id: income.category_id ?? '',
        user_id: income.user_id ?? currentUserId ?? '',
        status: income.status ?? 'recebido',
        notes: income.notes ?? '',
      });
    } else {
      setForm({ ...EMPTY, user_id: currentUserId ?? '' });
    }
    setError(null);
  }, [open, mode, income, currentUserId]);

  if (!open) return null;

  const incomeCategories = (categories ?? []).filter(
    (c) => (c.type === 'income' || c.type === 'both') && c.active,
  );

  const isValid =
    form.name.trim().length > 0 &&
    Number(form.amount) > 0 &&
    form.received_date &&
    form.category_id &&
    form.user_id;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!isValid || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(form);
    } catch (err) {
      setError(err?.message ?? 'Erro ao salvar.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="income-modal-backdrop" onClick={onClose} role="presentation">
      <div className="income-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <header>
          <h2>{mode === 'edit' ? 'Editar receita' : 'Nova receita'}</h2>
          <button type="button" className="income-modal-close" onClick={onClose} aria-label="Fechar">
            <X size={18} />
          </button>
        </header>

        <form className="income-form" onSubmit={handleSubmit}>
          {error ? <div className="income-form-error">{error}</div> : null}

          <label>
            Nome *
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Ex: Salário"
              autoFocus
            />
          </label>

          <div className="income-form-row">
            <label>
              Valor (R$) *
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                placeholder="0,00"
              />
            </label>
            <label>
              Data *
              <input
                type="date"
                value={form.received_date}
                onChange={(e) => setForm({ ...form, received_date: e.target.value })}
              />
            </label>
          </div>

          <label>
            Categoria *
            <select
              value={form.category_id}
              onChange={(e) => setForm({ ...form, category_id: e.target.value })}
            >
              <option value="">Selecione…</option>
              {incomeCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            Em nome de *
            <select
              value={form.user_id}
              onChange={(e) => setForm({ ...form, user_id: e.target.value })}
            >
              <option value="">Selecione…</option>
              {(members ?? []).map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {m.display_name}
                  {m.user_id === currentUserId ? ' (você)' : ''}
                </option>
              ))}
            </select>
          </label>

          <div className="income-status-toggle">
            <button
              type="button"
              className={`recebido ${form.status === 'recebido' ? 'active' : ''}`}
              onClick={() => setForm({ ...form, status: 'recebido' })}
            >
              ✓ Recebido
            </button>
            <button
              type="button"
              className={`previsto ${form.status === 'previsto' ? 'active' : ''}`}
              onClick={() => setForm({ ...form, status: 'previsto' })}
            >
              Previsto
            </button>
          </div>

          <label>
            Notas
            <textarea
              rows={2}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Opcional"
            />
          </label>

          <div className="income-form-actions">
            <button type="button" className="income-form-cancel" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="income-form-submit" disabled={!isValid || submitting}>
              {submitting ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Passo 5.3: Build + lint**

```bash
npm run build
npx eslint src/components/IncomeFormModal.jsx
```

- [ ] **Passo 5.4: Commit**

```bash
git add src/components/IncomeFormModal.jsx src/components/IncomeFormModal.css
git commit -m "feat(passo-4): modal IncomeFormModal com 7 campos e validacao cliente"
```

---

## Task 6: Componente `MonthlyBalanceCard`

**Files:**
- Create: `src/components/MonthlyBalanceCard.jsx`
- Create: `src/components/MonthlyBalanceCard.css`

- [ ] **Passo 6.1: Criar `MonthlyBalanceCard.css`**

```css
.balance-card {
  background: linear-gradient(135deg, var(--surface-color) 0%, rgba(12, 74, 110, 0.45) 100%);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-xl);
  padding: 20px;
  color: var(--text-primary);
  box-shadow: var(--shadow-main);
}

.balance-card-label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-secondary);
  margin-bottom: 6px;
}

.balance-card-value {
  font-size: 32px;
  font-weight: 700;
  margin-bottom: 10px;
}

.balance-card-value.positive { color: var(--accent-green); }
.balance-card-value.negative { color: var(--accent-red); }

.balance-card-breakdown {
  display: flex;
  gap: 18px;
  font-size: 12px;
  color: var(--text-secondary);
}

.balance-card-breakdown strong { font-weight: 600; }

.balance-card-breakdown .received strong { color: var(--accent-green); }
.balance-card-breakdown .expenses strong { color: var(--accent-red); }

.balance-card.loading { opacity: 0.6; }

@media (max-width: 640px) {
  .balance-card-value { font-size: 26px; }
  .balance-card-breakdown { flex-direction: column; gap: 4px; }
}
```

- [ ] **Passo 6.2: Criar `MonthlyBalanceCard.jsx`**

```jsx
import { useMonthlySummary, currentMonthYear } from '../hooks/useMonthlySummary';
import './MonthlyBalanceCard.css';

const fmt = (v) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v || 0));

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

function formatMonth(monthYear) {
  if (!monthYear) return '';
  const [y, m] = monthYear.split('-');
  return `${MONTH_NAMES[Number(m) - 1]}/${y}`;
}

export function MonthlyBalanceCard({ household }) {
  const monthYear = currentMonthYear();
  const { summary, loading } = useMonthlySummary(household?.id, monthYear);

  const received = Number(summary?.received_income ?? 0);
  const expenses = Number(summary?.total_expenses ?? 0);
  const balance = received - expenses;

  return (
    <div className={`balance-card ${loading ? 'loading' : ''}`}>
      <div className="balance-card-label">Saldo · {formatMonth(monthYear)}</div>
      <div className={`balance-card-value ${balance >= 0 ? 'positive' : 'negative'}`}>
        {fmt(balance)}
      </div>
      <div className="balance-card-breakdown">
        <span className="received">
          Recebido <strong>{fmt(received)}</strong>
        </span>
        <span className="expenses">
          Despesas <strong>{fmt(expenses)}</strong>
        </span>
      </div>
    </div>
  );
}
```

- [ ] **Passo 6.3: Build + lint**

```bash
npm run build
npx eslint src/components/MonthlyBalanceCard.jsx
```

- [ ] **Passo 6.4: Commit**

```bash
git add src/components/MonthlyBalanceCard.jsx src/components/MonthlyBalanceCard.css
git commit -m "feat(passo-4): card MonthlyBalanceCard lendo view monthly_summary"
```

---

## Task 7: Página `Incomes`

**Files:**
- Create: `src/pages/Incomes.jsx`
- Create: `src/pages/Incomes.css`

- [ ] **Passo 7.1: Criar `Incomes.css`**

```css
.incomes-page { display: grid; gap: 16px; padding: 4px 0 24px; }

.incomes-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.incomes-header h1 { margin: 0; color: var(--text-primary); font-size: 22px; }

.incomes-btn-new {
  background: var(--accent-green);
  color: white;
  border: 0;
  border-radius: var(--radius-md);
  padding: 10px 16px;
  font-weight: 600;
  font-size: 14px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.incomes-totals {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}

.incomes-total-card {
  padding: 14px;
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-color);
  color: var(--text-primary);
}

.incomes-total-card .label {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-secondary);
  margin-bottom: 4px;
}

.incomes-total-card .value { font-size: 20px; font-weight: 700; }

.incomes-total-card.received { background: rgba(34, 197, 94, 0.15); }
.incomes-total-card.received .value { color: var(--accent-green); }

.incomes-total-card.planned { background: rgba(251, 146, 60, 0.12); }
.incomes-total-card.planned .value { color: var(--accent-orange); }

.incomes-total-card.total { background: var(--surface-color); }

.incomes-filters {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 4px;
}

.incomes-filters select,
.incomes-filters input[type='date'] {
  background: var(--surface-color);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  color: var(--text-primary);
  padding: 6px 10px;
  font-size: 13px;
  font-family: var(--font-main);
  flex-shrink: 0;
}

.incomes-custom-range {
  display: flex;
  gap: 6px;
  align-items: center;
  font-size: 12px;
  color: var(--text-secondary);
}

.incomes-list { display: grid; gap: 12px; }

.incomes-group {
  background: var(--surface-color);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  padding: 12px 14px;
}

.incomes-group-header {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-secondary);
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border-color);
  margin-bottom: 4px;
}

.incomes-group-header strong { color: var(--accent-green); font-weight: 600; }

.income-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 0;
  border-bottom: 1px solid var(--border-color);
  color: var(--text-primary);
}

.income-row:last-child { border-bottom: 0; }

.income-row .info { display: grid; gap: 2px; }

.income-row .info strong { font-size: 14px; color: var(--text-primary); }
.income-row .info small { font-size: 11px; color: var(--text-secondary); }

.income-row .right { display: flex; align-items: center; gap: 10px; }

.income-row .amount { font-weight: 600; }

.income-row.recebido .amount { color: var(--accent-green); }

.income-row.previsto .amount { color: var(--accent-orange); }

.income-row-actions { position: relative; }

.income-row-menu-btn {
  background: transparent;
  border: 0;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 4px 8px;
  border-radius: var(--radius-sm);
}

.income-row-menu-btn:hover { background: var(--surface-alt); }

.income-row-menu {
  position: absolute;
  right: 0;
  top: 100%;
  background: var(--surface-color);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-main);
  min-width: 140px;
  z-index: 10;
  padding: 4px;
}

.income-row-menu button {
  display: block;
  width: 100%;
  text-align: left;
  padding: 8px 10px;
  background: transparent;
  border: 0;
  color: var(--text-primary);
  cursor: pointer;
  font-size: 13px;
  border-radius: var(--radius-sm);
}

.income-row-menu button:hover { background: var(--surface-alt); }

.income-row-menu button.danger { color: var(--accent-red); }

.income-mark-received {
  background: var(--accent-green);
  color: white;
  border: 0;
  border-radius: var(--radius-sm);
  padding: 6px 10px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.incomes-empty {
  background: var(--surface-color);
  border: 1px dashed var(--border-color);
  border-radius: var(--radius-lg);
  padding: 32px;
  text-align: center;
  color: var(--text-secondary);
}

.incomes-empty button {
  margin-top: 12px;
  background: var(--accent-green);
  color: white;
  border: 0;
  border-radius: var(--radius-md);
  padding: 8px 14px;
  cursor: pointer;
  font-weight: 600;
}

@media (max-width: 640px) {
  .incomes-totals { grid-template-columns: 1fr; }
  .incomes-header { flex-direction: column; align-items: stretch; }
}
```

- [ ] **Passo 7.2: Criar `Incomes.jsx`**

```jsx
import { useMemo, useState } from 'react';
import { Plus, MoreVertical } from 'lucide-react';
import { useIncomes } from '../hooks/useIncomes';
import { useCategories } from '../hooks/useCategories';
import { useHouseholdMembers } from '../hooks/useHouseholdMembers';
import { IncomeFormModal } from '../components/IncomeFormModal';
import { Toast } from '../components/Toast';
import './Incomes.css';

const fmt = (v) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v || 0));

const MONTH_NAMES_SHORT = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];

function monthRange(kind) {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const first = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const lastThisMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
  switch (kind) {
    case 'today':
      return { startDate: today, endDate: today };
    case 'week': {
      const start = new Date(now); start.setDate(now.getDate() - 6);
      return { startDate: start.toISOString().slice(0, 10), endDate: today };
    }
    case 'month':
      return { startDate: first, endDate: lastThisMonth };
    case 'prev-month': {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 10);
      const end = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().slice(0, 10);
      return { startDate: start, endDate: end };
    }
    case 'year':
      return { startDate: `${now.getFullYear()}-01-01`, endDate: `${now.getFullYear()}-12-31` };
    default:
      return { startDate: first, endDate: lastThisMonth };
  }
}

function groupByMonth(incomes) {
  const groups = new Map();
  for (const it of incomes) {
    const d = it.received_date || '';
    const key = d.slice(0, 7); // YYYY-MM
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(it);
  }
  return Array.from(groups.entries()).sort((a, b) => b[0].localeCompare(a[0]));
}

function formatGroupLabel(key) {
  if (!key) return '';
  const [y, m] = key.split('-');
  return `${MONTH_NAMES_SHORT[Number(m) - 1]} ${y}`;
}

export default function Incomes({ user, household }) {
  const [period, setPeriod] = useState('month');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [userFilter, setUserFilter] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingIncome, setEditingIncome] = useState(null);
  const [menuOpenId, setMenuOpenId] = useState(null);
  const [toast, setToast] = useState(null);

  const range =
    period === 'custom'
      ? { startDate: customStart || undefined, endDate: customEnd || undefined }
      : monthRange(period);

  const filters = useMemo(
    () => ({
      startDate: range.startDate,
      endDate: range.endDate,
      categoryId: categoryFilter || undefined,
      status: statusFilter || undefined,
      userId: userFilter || undefined,
    }),
    [range.startDate, range.endDate, categoryFilter, statusFilter, userFilter],
  );

  const { incomes, loading, create, update, remove, markReceived } = useIncomes(household?.id, filters);
  const { categories } = useCategories(household?.id);
  const { members } = useHouseholdMembers(household?.id);

  const totals = useMemo(() => {
    const r = incomes.filter((i) => i.status === 'recebido').reduce((s, i) => s + Number(i.amount || 0), 0);
    const p = incomes.filter((i) => i.status === 'previsto').reduce((s, i) => s + Number(i.amount || 0), 0);
    return { received: r, planned: p, total: r + p };
  }, [incomes]);

  const groups = useMemo(() => groupByMonth(incomes), [incomes]);

  function closeMenu() {
    setMenuOpenId(null);
  }

  async function handleSubmit(form) {
    const displayName =
      user?.user_metadata?.full_name || user?.user_metadata?.display_name || user?.email || 'Usuário';
    if (editingIncome) {
      await update(editingIncome.id, {
        name: form.name,
        amount: form.amount,
        received_date: form.received_date,
        category_id: form.category_id,
        user_id: form.user_id,
        status: form.status,
        notes: form.notes,
      });
      setToast({ variant: 'success', message: 'Receita atualizada.' });
    } else {
      await create({
        ...form,
        added_by_name: displayName,
      });
      setToast({ variant: 'success', message: 'Receita registrada.' });
    }
    setModalOpen(false);
    setEditingIncome(null);
  }

  async function handleMarkReceived(income) {
    const prev = { id: income.id, status: income.status, received_date: income.received_date };
    closeMenu();
    try {
      await markReceived(income.id);
      setToast({
        variant: 'success',
        message: 'Marcado como recebido.',
        actionLabel: 'Desfazer',
        onAction: async () => {
          try {
            await update(prev.id, { status: prev.status, received_date: prev.received_date });
          } catch (err) {
            setToast({ variant: 'error', message: 'Não foi possível desfazer.' });
          }
        },
      });
    } catch (err) {
      setToast({ variant: 'error', message: `Erro: ${err.message || err}` });
    }
  }

  async function handleDelete(income) {
    const snapshot = { ...income };
    closeMenu();
    try {
      await remove(income.id);
      setToast({
        variant: 'success',
        message: 'Receita excluída.',
        actionLabel: 'Desfazer',
        onAction: async () => {
          try {
            await create({
              name: snapshot.name,
              amount: snapshot.amount,
              received_date: snapshot.received_date,
              category_id: snapshot.category_id,
              user_id: snapshot.user_id,
              status: snapshot.status,
              notes: snapshot.notes,
              added_by_name: snapshot.added_by_name,
            });
          } catch (err) {
            setToast({ variant: 'error', message: 'Não foi possível restaurar.' });
          }
        },
      });
    } catch (err) {
      setToast({ variant: 'error', message: `Erro ao excluir: ${err.message || err}` });
    }
  }

  function openCreate() {
    setEditingIncome(null);
    setModalOpen(true);
  }

  function openEdit(income) {
    setEditingIncome(income);
    setModalOpen(true);
    closeMenu();
  }

  const incomeCategories = categories.filter(
    (c) => (c.type === 'income' || c.type === 'both') && c.active,
  );

  return (
    <div className="incomes-page">
      <header className="incomes-header">
        <h1>Receitas</h1>
        <button type="button" className="incomes-btn-new" onClick={openCreate}>
          <Plus size={16} /> Nova receita
        </button>
      </header>

      <div className="incomes-totals">
        <div className="incomes-total-card received">
          <div className="label">Recebido</div>
          <div className="value">{fmt(totals.received)}</div>
        </div>
        <div className="incomes-total-card planned">
          <div className="label">Previsto</div>
          <div className="value">{fmt(totals.planned)}</div>
        </div>
        <div className="incomes-total-card total">
          <div className="label">Total</div>
          <div className="value">{fmt(totals.total)}</div>
        </div>
      </div>

      <div className="incomes-filters">
        <select value={period} onChange={(e) => setPeriod(e.target.value)}>
          <option value="today">Hoje</option>
          <option value="week">Últimos 7 dias</option>
          <option value="month">Mês atual</option>
          <option value="prev-month">Mês anterior</option>
          <option value="year">Este ano</option>
          <option value="custom">Personalizado</option>
        </select>
        {period === 'custom' ? (
          <div className="incomes-custom-range">
            <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} />
            <span>até</span>
            <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} />
          </div>
        ) : null}
        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
          <option value="">Todas categorias</option>
          {incomeCategories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">Todos status</option>
          <option value="recebido">Recebido</option>
          <option value="previsto">Previsto</option>
        </select>
        <select value={userFilter} onChange={(e) => setUserFilter(e.target.value)}>
          <option value="">Todos</option>
          {members.map((m) => (
            <option key={m.user_id} value={m.user_id}>
              {m.display_name}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="incomes-empty">Carregando…</div>
      ) : incomes.length === 0 ? (
        <div className="incomes-empty">
          Nenhuma receita neste período.
          <div>
            <button type="button" onClick={openCreate}>
              + Nova receita
            </button>
          </div>
        </div>
      ) : (
        <div className="incomes-list">
          {groups.map(([key, items]) => {
            const sub = items.reduce((s, i) => s + Number(i.amount || 0), 0);
            return (
              <div className="incomes-group" key={key}>
                <div className="incomes-group-header">
                  <span>
                    {formatGroupLabel(key)} · {items.length} receita{items.length === 1 ? '' : 's'}
                  </span>
                  <strong>{fmt(sub)}</strong>
                </div>
                {items.map((it) => {
                  const memberName =
                    members.find((m) => m.user_id === it.user_id)?.display_name || '—';
                  const catName = it.categories?.name || 'Sem categoria';
                  const dateShort = it.received_date ? it.received_date.slice(8, 10) + '/' + it.received_date.slice(5, 7) : '';
                  return (
                    <div className={`income-row ${it.status}`} key={it.id}>
                      <div className="info">
                        <strong>{it.name}</strong>
                        <small>
                          {catName} · {dateShort} · {memberName}
                        </small>
                      </div>
                      <div className="right">
                        <span className="amount">{fmt(it.amount)}</span>
                        {it.status === 'previsto' ? (
                          <button
                            type="button"
                            className="income-mark-received"
                            onClick={() => handleMarkReceived(it)}
                          >
                            ✓ Recebido
                          </button>
                        ) : (
                          <div className="income-row-actions">
                            <button
                              type="button"
                              className="income-row-menu-btn"
                              onClick={() => setMenuOpenId(menuOpenId === it.id ? null : it.id)}
                              aria-label="Menu"
                            >
                              <MoreVertical size={16} />
                            </button>
                            {menuOpenId === it.id ? (
                              <div className="income-row-menu">
                                <button type="button" onClick={() => openEdit(it)}>
                                  Editar
                                </button>
                                <button
                                  type="button"
                                  className="danger"
                                  onClick={() => handleDelete(it)}
                                >
                                  Excluir
                                </button>
                              </div>
                            ) : null}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      <IncomeFormModal
        open={modalOpen}
        mode={editingIncome ? 'edit' : 'create'}
        income={editingIncome}
        categories={categories}
        members={members}
        currentUserId={user?.id}
        onSubmit={handleSubmit}
        onClose={() => {
          setModalOpen(false);
          setEditingIncome(null);
        }}
      />

      {toast ? (
        <Toast
          message={toast.message}
          variant={toast.variant}
          actionLabel={toast.actionLabel}
          onAction={toast.onAction}
          onClose={() => setToast(null)}
        />
      ) : null}
    </div>
  );
}
```

- [ ] **Passo 7.3: Build + lint**

```bash
npm run build
npx eslint src/pages/Incomes.jsx
```

- [ ] **Passo 7.4: Commit**

```bash
git add src/pages/Incomes.jsx src/pages/Incomes.css
git commit -m "feat(passo-4): pagina Incomes com lista agrupada, filtros, totais e acoes"
```

---

## Task 8: Integrar Receitas na navegação (`Sidebar`, `Layout`, `App`)

**Files:**
- Modify: `src/components/Sidebar.jsx` (array `menuItems`)
- Modify: `src/components/Layout.jsx` (array `mobileMenuItems`)
- Modify: `src/App.jsx` (import + case no switch)

- [ ] **Passo 8.1: Editar `Sidebar.jsx`**

Localizar o import de `lucide-react` e acrescentar `TrendingUp`.

```javascript
// Antes (exemplo):
import { LayoutDashboard, Receipt, PlusCircle, BarChart3, Bell, Settings, LogOut } from 'lucide-react';
// Depois:
import { LayoutDashboard, Receipt, PlusCircle, BarChart3, Bell, Settings, LogOut, TrendingUp } from 'lucide-react';
```

Localizar `menuItems` (array de objetos) e inserir o item Receitas entre `dashboard` e `new-entry`:

```javascript
const menuItems = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'incomes', label: 'Receitas', icon: TrendingUp },
  { id: 'new-entry', label: 'Nova despesa', icon: PlusCircle },
  // ... demais itens existentes intocados
];
```

Não mudar mais nada no arquivo.

- [ ] **Passo 8.2: Editar `Layout.jsx`**

Adicionar `TrendingUp` no import do lucide-react (mesma linha do Sidebar) e o item no array `mobileMenuItems`:

```javascript
const mobileMenuItems = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'incomes', label: 'Receitas', icon: TrendingUp },
  { id: 'expenses', label: 'Despesas', icon: Receipt },
  { id: 'new-entry', label: 'Novo', icon: PlusCircle },
  { id: 'calendar', label: 'Calendário', icon: Bell },
  { id: 'settings', label: 'Ajustes', icon: Settings },
];
```

Observação: como há 6 itens no bottom nav, remover "Relatórios" da lista mobile (continua acessível pelo sidebar desktop) pra não quebrar o layout de 6 slots. Se o original já tinha 6, manter os existentes e substituir o de menor uso ("Relatórios") pelo novo "Receitas".

- [ ] **Passo 8.3: Editar `App.jsx`**

No topo, adicionar o import da página:

```javascript
import Incomes from './pages/Incomes';
```

No `switch` da função `renderContent()`, adicionar o case imediatamente antes do default/Dashboard:

```javascript
case 'incomes':
  return <Incomes user={session?.user} household={household} />;
```

- [ ] **Passo 8.4: Build + lint**

```bash
npm run build
npx eslint src/components/Sidebar.jsx src/components/Layout.jsx src/App.jsx
```

- [ ] **Passo 8.5: Smoke manual local**

```bash
npm run dev
```
Abrir `http://localhost:5173`, logar, clicar "Receitas" no sidebar. Esperado: a página aparece com headers, filtros, e "Carregando…"/"Nenhuma receita neste período" — ou a lista real se houver dados. Criar uma receita de teste via modal. Parar o dev server.

- [ ] **Passo 8.6: Commit**

```bash
git add src/components/Sidebar.jsx src/components/Layout.jsx src/App.jsx
git commit -m "feat(passo-4): rota /incomes ligada ao Sidebar, bottom nav e App"
```

---

## Task 9: Montar `MonthlyBalanceCard` no Dashboard

**Files:**
- Modify: `src/pages/Dashboard.jsx`

- [ ] **Passo 9.1: Editar `Dashboard.jsx`**

No topo, adicionar o import:

```javascript
import { MonthlyBalanceCard } from '../components/MonthlyBalanceCard';
```

No começo do JSX retornado pelo componente (primeiro elemento do layout, acima dos cards existentes), acrescentar:

```jsx
<MonthlyBalanceCard household={household} />
```

Verificar que `household` já está disponível como prop ou extrair do destructuring. Se a página recebe `household` via prop, basta passar; se não, importar via contexto/prop da mesma forma que outros componentes do arquivo recebem dados do household.

- [ ] **Passo 9.2: Build + lint**

```bash
npm run build
npx eslint src/pages/Dashboard.jsx
```

- [ ] **Passo 9.3: Smoke manual**

```bash
npm run dev
```
Acessar Dashboard. Esperado: card "Saldo · {mês}/{ano}" aparece no topo com valores vindos de `monthly_summary`. Parar o dev server.

- [ ] **Passo 9.4: Commit**

```bash
git add src/pages/Dashboard.jsx
git commit -m "feat(passo-4): card Saldo do mes no topo do Dashboard"
```

---

## Task 10: Fix bug de sessão zumbi no `App.jsx`

**Files:**
- Modify: `src/App.jsx`

Contexto: o Passo 3 identificou que `getSession()` retorna JWT de conta deletada, fazendo `auth.uid()` apontar pra user inexistente e quebrando RLS. O fix é validar com `getUser()` após obter a sessão e forçar `signOut()` se o usuário não existe mais.

- [ ] **Passo 10.1: Localizar o handler de `onAuthStateChange` e `fetchHousehold` no `App.jsx`**

Logo após receber o evento `INITIAL_SESSION` (ou o primeiro `session` não nulo), inserir o bloco abaixo antes de usar a sessão pra carregar household/expenses:

```javascript
// Após obter session != null
const { data: userCheck, error: userErr } = await supabase.auth.getUser();
if (userErr || !userCheck?.user) {
  console.warn('[auth] sessão apontando pra usuário inexistente — forçando signOut');
  await supabase.auth.signOut();
  return; // onAuthStateChange será disparado de novo com session=null
}
```

Se o handler atual já for síncrono, converter pra `async` o callback de `onAuthStateChange`:

```javascript
supabase.auth.onAuthStateChange(async (_event, session) => {
  if (session) {
    const { data: userCheck, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userCheck?.user) {
      console.warn('[auth] sessão apontando pra usuário inexistente — forçando signOut');
      await supabase.auth.signOut();
      return;
    }
  }
  setSession(session);
  // ...demais side effects existentes (fetchHousehold etc.)
});
```

- [ ] **Passo 10.2: Build + lint**

```bash
npm run build
npx eslint src/App.jsx
```

- [ ] **Passo 10.3: Smoke manual**

Logar normalmente. Esperado: nenhuma regressão visível no fluxo de login/carregamento de household. Abrir DevTools → Console: sem o warning `[auth] sessão apontando...` (usuário logado é válido). Opcional: abrir Aba Anônima e testar com credenciais válidas de outro membro.

- [ ] **Passo 10.4: Commit**

```bash
git add src/App.jsx
git commit -m "fix(passo-4): detectar sessao zumbi via getUser() e forcar signOut"
```

---

## Task 11: Validação estática final

- [ ] **Passo 11.1: Build production**

```bash
npm run build
```
Esperado: build conclui sem erros; warnings pré-existentes do Vite são aceitáveis.

- [ ] **Passo 11.2: Lint completo dos arquivos novos**

```bash
npx eslint src/hooks/useIncomes.js src/hooks/useHouseholdMembers.js src/hooks/useMonthlySummary.js src/pages/Incomes.jsx src/pages/Incomes.css src/components/IncomeFormModal.jsx src/components/MonthlyBalanceCard.jsx src/components/Toast.jsx src/components/Sidebar.jsx src/components/Layout.jsx src/App.jsx src/pages/Dashboard.jsx
```
Esperado: zero problemas no código novo. Warnings pré-existentes em `App.jsx`/`Dashboard.jsx` (documentados no Passo 3) podem permanecer — não introduzir novos.

- [ ] **Passo 11.3: Preview**

```bash
npm run preview
```
Abrir o preview URL (geralmente `http://localhost:4173`), logar, navegar por Dashboard → Receitas → criar/editar/excluir. Encerrar.

---

## Task 12: Deploy em produção e E2E

- [ ] **Passo 12.1: Deploy Vercel**

```bash
npx vercel --prod
```
Aguardar URL de produção. Alias `casa.hubautomacao.pro` deve atualizar automaticamente (configurado no Passo 3).

- [ ] **Passo 12.2: Checklist E2E em `https://casa.hubautomacao.pro/` (navegar para Receitas)**

Executar cada item na ordem, anotando observações:

1. Criar receita com status "Recebido" (nome/valor/categoria/data/Em nome de = logado) → aparece na lista agrupada por mês com totais corretos.
2. Recarregar → card Dashboard "Saldo do mês" reflete o novo Recebido.
3. Criar receita "Previsto" (ex: "13º salário" 5.000 em 20/12). Botão verde "✓ Recebido" aparece na linha.
4. Clicar "✓ Recebido" → toast "Marcado como recebido · Desfazer" aparece. Aguardar 5s → confirma virou recebido.
5. Repetir: criar previsto → clicar "✓ Recebido" → clicar "Desfazer" dentro dos 5s → status volta a "previsto".
6. Menu ⋮ → "Editar" → mudar valor → Salvar. Lista reflete.
7. Menu ⋮ → "Excluir" → toast com Desfazer → clicar Desfazer → receita reaparece.
8. Filtrar por categoria "Salário" → lista e totais recalculam imediatamente.
9. Filtrar status "Previsto" → só os previstos aparecem.
10. Filtrar "Em nome de" Rossana → só dela.
11. Mobile (DevTools 375px): totais em 1 coluna, filtros scroll horizontal, modal confortável, bottom nav inclui "Receitas".
12. Abrir WhatsApp, mandar "recebi 250 de aluguel" (bot já configurado). Voltar pra `/receitas` e recarregar → a receita aparece.

Documentar eventuais falhas em `docs/PASSO4_SMOKE.md` temporário (ou direto no próximo commit).

- [ ] **Passo 12.3: Atualizar `docs/PLANO_CONTINUIDADE.md`**

Logo depois da seção "Passo 3" e antes de "0. Princípios do plano", acrescentar:

```markdown
## SPEC DEFINITIVA — Passo 4 (Frontend: Receitas + card Saldo do mês) ✅ CONCLUÍDO + DEPLOYADO (2026-04-17)

**Entrega:** página `/receitas` com listagem agrupada por mês, filtros, totais, CRUD por modal, transição previsto→recebido inline com toast Desfazer. Dashboard ganha card "Saldo do mês" lendo `monthly_summary`. Fix do bug de sessão zumbi do Passo 3 incluído. Live em `https://casa.hubautomacao.pro/` — validação E2E OK nos 12 cenários.

**Arquivos novos em `src/`:**

| Arquivo | Função |
|---|---|
| `hooks/useIncomes.js` | Hook stale-while-revalidate para `public.incomes`. CRUD + `markReceived` + filtros. |
| `hooks/useHouseholdMembers.js` | Lista membros ativos do household via `household_members` → `profiles`. |
| `hooks/useMonthlySummary.js` | Lê view `monthly_summary` por `(household_id, month_year)`; helper `currentMonthYear()`. |
| `pages/Incomes.jsx` + `Incomes.css` | Página principal: header com totais, filtros, lista agrupada, modal. |
| `components/IncomeFormModal.jsx` + `IncomeFormModal.css` | Modal criar/editar com 7 campos e validação cliente. |
| `components/MonthlyBalanceCard.jsx` + `.css` | Card "Saldo · {mês}" pro Dashboard. Gradient + cor dinâmica (verde/vermelho). |
| `components/Toast.jsx` + `Toast.css` | Toast reaproveitável com ação Desfazer. |

**Arquivos alterados:**

| Arquivo | Mudança |
|---|---|
| `components/Sidebar.jsx` | Item `{ id:'incomes', label:'Receitas', icon:TrendingUp }` entre Dashboard e NewEntry. |
| `components/Layout.jsx` | Mesmo item no `mobileMenuItems`; removido "Relatórios" da bottom nav pra manter 6 slots. |
| `App.jsx` | `case 'incomes'` + fix sessão zumbi (`getUser()` após `getSession()` → `signOut()` se user não existe). |
| `pages/Dashboard.jsx` | `<MonthlyBalanceCard household={household} />` como primeiro card. |

**Decisões tomadas no brainstorming (2026-04-17):** Receitas antes de Metas, página dedicada (espelho de Despesas), escopo V1 Padrão, transição inline com toast Undo, lista agrupada por mês, card "Saldo do mês" no Dashboard (+1h), dropdown "Em nome de" com default logado, defaults Recebido/toast Undo/Todos.

**Fora de escopo (diferido):** badge 🔁 de recorrência (Passo 7), gráfico de evolução (Passo 6), saldo projetado ajustado por metas (Passo 5), bulk actions, exportação, realtime cross-tab.

**Próximo passo da spec (Passo 5):** Metas — CRUD em `public.goals` + integração com `goal_progress` + UI no Dashboard/Relatórios.
```

- [ ] **Passo 12.4: Commit + push**

```bash
git add docs/PLANO_CONTINUIDADE.md
git commit -m "docs(passo-4): relatorio de conclusao — Receitas + card Saldo do mes live"
git push origin main
```

- [ ] **Passo 12.5: Verificação final**

```bash
git log --oneline -15
git status
```
Esperado: working tree clean; histórico mostra a sequência de commits do Passo 4; `origin/main` atualizado.

---

## Self-review (feito pelo autor do plano)

**Cobertura da spec:**
- §3 Arquitetura → Tasks 1–9 implementam todos os 8 novos arquivos e os 4 alterados.
- §4 UX → Task 7 (página + form + filtros + lista agrupada) e Task 6 (card Dashboard).
- §5 Data flow → hooks nas tasks 1–3; página conecta em Task 7.
- §6 Edge cases → `amount > 0` validado no modal; `markReceived` com default `today`; `ON DELETE SET NULL` já no schema; empty state na página.
- §7 Riscos → fix sessão zumbi coberto em Task 10.
- §8 Validação → Tasks 11 (estática) e 12 (E2E + relatório + push).
- §9 Ganchos → documentados no relatório final (Passo 12.3).
- §10 Fora de escopo → respeitado.

**Placeholders:** nenhum "TODO"/"TBD"/"implementar depois" no plano. Cada passo tem código completo ou comando exato.

**Consistência de tipos/nomes:**
- `markReceived(id, receivedDate)` usado em Task 3 (definição) e Task 7 (chamada sem 2º arg → default `today`). OK.
- `useMonthlySummary(householdId, monthYear)` consistente entre Task 2 e Task 6.
- `filters` object com `{ startDate, endDate, categoryId, status, userId }` consistente Task 3 ↔ Task 7.
- `currentMonthYear()` exportado do mesmo arquivo (Task 2) e consumido em Task 6.

**Escopo:** 1 plano, 1 entrega coesa. Não quebra em sub-planos.
