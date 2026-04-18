import React, { useMemo, useState } from 'react';
import {
  User as UserIcon,
  Tags,
  Plus,
  Trash2,
  Edit3,
  Check,
  X,
  Eye,
  EyeOff,
} from 'lucide-react';
import { useCategories } from '../hooks/useCategories';
import { useProfile } from '../hooks/useProfile';
import './Settings.css';

const INCOME_TYPES = [
  { value: 'monthly', label: 'Assalariado / pró-labore (mensal)' },
  { value: 'weekly', label: 'Autônomo semanal' },
  { value: 'daily', label: 'Autônomo diário' },
];

const TYPE_OPTIONS = [
  { value: 'expense', label: 'Despesa' },
  { value: 'income', label: 'Receita' },
  { value: 'both', label: 'Ambos' },
];

const EMPTY_DRAFT = {
  id: null,
  name: '',
  icon: '',
  color: '#9D59FF',
  display_order: 0,
  type: 'expense',
  active: true,
};

const Settings = ({ user, household }) => {
  const [activeSection, setActiveSection] = useState('profile');

  return (
    <div className="settings-container animate-in">
      <header className="settings-header">
        <h1>Configurações</h1>
        <p>Perfil e categorias do {household?.name ?? 'household'}</p>
      </header>

      <div className="settings-tabs">
        <button
          className={`settings-tab ${activeSection === 'profile' ? 'active' : ''}`}
          onClick={() => setActiveSection('profile')}
        >
          <UserIcon size={18} />
          <span>Perfil</span>
        </button>
        <button
          className={`settings-tab ${activeSection === 'categories' ? 'active' : ''}`}
          onClick={() => setActiveSection('categories')}
        >
          <Tags size={18} />
          <span>Categorias</span>
        </button>
      </div>

      {activeSection === 'profile' && <ProfileSection user={user} />}
      {activeSection === 'categories' && <CategoriesSection household={household} />}
    </div>
  );
};

function ProfileSection({ user }) {
  const { profile, loading, save } = useProfile(user?.id);
  const [form, setForm] = useState({ display_name: '', avatar_url: '', income_type: 'monthly' });
  const [syncedProfileId, setSyncedProfileId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState(null);

  // Sincroniza form quando profile carrega (set-state-during-render, pattern oficial).
  if (profile && profile.id !== syncedProfileId) {
    setSyncedProfileId(profile.id);
    setForm({
      display_name: profile.display_name ?? '',
      avatar_url: profile.avatar_url ?? '',
      income_type: profile.income_type ?? 'monthly',
    });
  }

  const onSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setFeedback(null);
    try {
      await save(form);
      setFeedback({ type: 'ok', msg: 'Perfil salvo.' });
    } catch (err) {
      setFeedback({ type: 'err', msg: err.message });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="settings-loading">Carregando perfil…</div>;
  }

  return (
    <div className="settings-card glass-card">
      <h2>Dados pessoais</h2>
      <form onSubmit={onSubmit} className="settings-form">
        <div className="input-group">
          <label>NOME DE EXIBIÇÃO</label>
          <div className="input-wrapper">
            <input
              type="text"
              placeholder="Como você quer aparecer no app"
              value={form.display_name}
              onChange={(e) => setForm({ ...form, display_name: e.target.value })}
            />
          </div>
        </div>

        <div className="input-group">
          <label>EMAIL</label>
          <div className="input-wrapper readonly">
            <input type="email" value={profile?.email ?? ''} readOnly disabled />
          </div>
        </div>

        <div className="input-group">
          <label>URL DA FOTO (opcional)</label>
          <div className="input-wrapper">
            <input
              type="url"
              placeholder="https://…"
              value={form.avatar_url}
              onChange={(e) => setForm({ ...form, avatar_url: e.target.value })}
            />
          </div>
        </div>

        <div className="input-group">
          <label>PERFIL DE RENDA</label>
          <div className="radio-stack">
            {INCOME_TYPES.map((opt) => (
              <label
                key={opt.value}
                className={`radio-row ${form.income_type === opt.value ? 'active' : ''}`}
              >
                <input
                  type="radio"
                  name="income_type"
                  value={opt.value}
                  checked={form.income_type === opt.value}
                  onChange={(e) => setForm({ ...form, income_type: e.target.value })}
                />
                <span>{opt.label}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="settings-actions">
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? 'Salvando…' : 'Salvar perfil'}
          </button>
          {feedback && (
            <span className={`settings-feedback ${feedback.type}`}>
              {feedback.msg}
            </span>
          )}
        </div>
      </form>
    </div>
  );
}

function CategoriesSection({ household }) {
  const { categories, loading, error, create, update, remove, toggleActive } = useCategories(
    household?.id,
  );
  const [filter, setFilter] = useState('all');
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  const visible = useMemo(() => {
    if (filter === 'all') return categories;
    if (filter === 'active') return categories.filter((c) => c.active);
    if (filter === 'inactive') return categories.filter((c) => !c.active);
    return categories.filter((c) => c.type === filter);
  }, [categories, filter]);

  const openNew = () => setDraft({ ...EMPTY_DRAFT, display_order: nextOrder(categories) });
  const openEdit = (cat) => setDraft({ ...cat, color: cat.color ?? '#9D59FF' });
  const closeDraft = () => {
    setDraft(null);
    setErr(null);
  };

  const submitDraft = async (e) => {
    e.preventDefault();
    if (!draft.name.trim()) {
      setErr('Dê um nome à categoria.');
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      if (draft.id) await update(draft.id, draft);
      else await create(draft);
      setDraft(null);
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async (cat) => {
    const ok = window.confirm(
      `Excluir "${cat.name}"? Despesas e receitas já registradas nessa categoria mantêm o nome antigo, mas perdem o vínculo estruturado.`,
    );
    if (!ok) return;
    try {
      await remove(cat.id);
    } catch (ex) {
      alert(`Não deu pra excluir: ${ex.message}`);
    }
  };

  return (
    <div className="settings-card glass-card">
      <div className="categories-toolbar">
        <div className="category-filters">
          {[
            { id: 'all', label: 'Todas' },
            { id: 'expense', label: 'Despesa' },
            { id: 'income', label: 'Receita' },
            { id: 'both', label: 'Ambos' },
            { id: 'active', label: 'Ativas' },
            { id: 'inactive', label: 'Arquivadas' },
          ].map((f) => (
            <button
              key={f.id}
              className={`filter-tab ${filter === f.id ? 'active' : ''}`}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <button className="btn-primary" onClick={openNew}>
          <Plus size={16} />
          <span>Nova categoria</span>
        </button>
      </div>

      {loading && <div className="settings-loading">Carregando categorias…</div>}
      {error && <div className="settings-error">Erro ao carregar: {error}</div>}

      {!loading && visible.length === 0 && (
        <p className="settings-empty">
          Nenhuma categoria {filter !== 'all' ? `com filtro "${filter}"` : 'cadastrada'}.
        </p>
      )}

      <ul className="category-list">
        {visible.map((cat) => (
          <li key={cat.id} className={`category-row ${!cat.active ? 'archived' : ''}`}>
            <span
              className="category-swatch"
              style={{ background: cat.color ?? 'var(--primary-color)' }}
              aria-hidden
            />
            <div className="category-main">
              <div className="category-title">
                <strong>{cat.name}</strong>
                <span className={`category-type type-${cat.type}`}>{typeLabel(cat.type)}</span>
                {!cat.active && <span className="badge-muted">arquivada</span>}
              </div>
              <div className="category-meta">
                {cat.icon && <span>ícone: {cat.icon}</span>}
                <span>ordem: {cat.display_order}</span>
              </div>
            </div>
            <div className="category-actions">
              <button
                className="icon-btn"
                title={cat.active ? 'Arquivar' : 'Reativar'}
                onClick={() => toggleActive(cat.id)}
              >
                {cat.active ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
              <button className="icon-btn" title="Editar" onClick={() => openEdit(cat)}>
                <Edit3 size={16} />
              </button>
              <button
                className="icon-btn danger"
                title="Excluir"
                onClick={() => confirmDelete(cat)}
              >
                <Trash2 size={16} />
              </button>
            </div>
          </li>
        ))}
      </ul>

      {draft && (
        <div className="modal-backdrop" onClick={closeDraft}>
          <div className="modal glass-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{draft.id ? 'Editar categoria' : 'Nova categoria'}</h3>
              <button className="icon-btn" onClick={closeDraft} title="Fechar">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={submitDraft} className="settings-form">
              <div className="input-group">
                <label>NOME</label>
                <div className="input-wrapper">
                  <input
                    type="text"
                    autoFocus
                    value={draft.name}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                    placeholder="Ex: Mercado"
                  />
                </div>
              </div>

              <div className="input-row">
                <div className="input-group">
                  <label>TIPO</label>
                  <div className="select-wrapper">
                    <select
                      value={draft.type}
                      onChange={(e) => setDraft({ ...draft, type: e.target.value })}
                    >
                      {TYPE_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="input-group">
                  <label>ORDEM</label>
                  <div className="input-wrapper">
                    <input
                      type="number"
                      value={draft.display_order}
                      onChange={(e) =>
                        setDraft({ ...draft, display_order: e.target.value })
                      }
                    />
                  </div>
                </div>
              </div>

              <div className="input-row">
                <div className="input-group">
                  <label>ÍCONE (lucide)</label>
                  <div className="input-wrapper">
                    <input
                      type="text"
                      placeholder="ex: home, utensils"
                      value={draft.icon ?? ''}
                      onChange={(e) => setDraft({ ...draft, icon: e.target.value })}
                    />
                  </div>
                </div>

                <div className="input-group">
                  <label>COR</label>
                  <div className="input-wrapper color">
                    <input
                      type="color"
                      value={draft.color ?? '#9D59FF'}
                      onChange={(e) => setDraft({ ...draft, color: e.target.value })}
                    />
                    <span className="color-hex">{draft.color}</span>
                  </div>
                </div>
              </div>

              <label className="toggle-row">
                <input
                  type="checkbox"
                  checked={draft.active}
                  onChange={(e) => setDraft({ ...draft, active: e.target.checked })}
                />
                <span>Ativa (aparece nos menus)</span>
              </label>

              {err && <div className="settings-error">{err}</div>}

              <div className="settings-actions">
                <button type="button" className="btn-ghost" onClick={closeDraft}>
                  Cancelar
                </button>
                <button type="submit" className="btn-primary" disabled={saving}>
                  <Check size={16} />
                  <span>{saving ? 'Salvando…' : 'Salvar'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function nextOrder(categories) {
  if (!categories.length) return 10;
  return Math.max(...categories.map((c) => c.display_order ?? 0)) + 10;
}

function typeLabel(type) {
  if (type === 'expense') return 'Despesa';
  if (type === 'income') return 'Receita';
  return 'Ambos';
}

export default Settings;
