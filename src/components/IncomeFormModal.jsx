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
