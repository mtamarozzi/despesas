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
          } catch {
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
          } catch {
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
