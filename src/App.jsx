import React, { useState, useEffect, useRef } from 'react';
import { supabase } from './utils/supabaseClient';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import NewEntry from './pages/NewEntry';
import Login from './pages/Login';
import CalendarView from './pages/CalendarView';
import Reports from './pages/Reports';
import Settings from './pages/Settings';
import Incomes from './pages/Incomes';
import './App.css';

function App() {
  const [session, setSession] = useState(null);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [household, setHousehold] = useState(null);
  const [householdLoading, setHouseholdLoading] = useState(true);
  const realtimeChannel = useRef(null);
  const hasFetchedHousehold = useRef(false);

  useEffect(() => {
    // IMPORTANTE: nunca chamar supabase.auth.* DENTRO do callback de onAuthStateChange
    // (causa deadlock no lock interno do GoTrueClient). Trabalho async vai em setTimeout(fn, 0).
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setTimeout(async () => {
        if (session) {
          const { data: userCheck, error: userErr } = await supabase.auth.getUser();
          if (userErr || !userCheck?.user) {
            console.warn('[auth] sessão apontando pra usuário inexistente — forçando signOut');
            await supabase.auth.signOut();
            return; // onAuthStateChange será disparado de novo com session=null
          }
        }
        setSession(session);
        if (session) {
          if (!hasFetchedHousehold.current) {
            hasFetchedHousehold.current = true;
            fetchHousehold(session.user);
          }
        } else {
          hasFetchedHousehold.current = false;
          setExpenses([]);
          setHousehold(null);
          setHouseholdLoading(false);
          setLoading(false);
        }
      }, 0);
    });

    return () => {
      subscription.unsubscribe();
      realtimeChannel.current?.unsubscribe();
    };
  }, []);

  const fetchHousehold = async (user) => {
    setHouseholdLoading(true);

    const householdId = user.user_metadata?.household_id;
    if (!householdId) {
      console.error('[household] usuário sem household_id no JWT metadata — contatar suporte');
      setHousehold(null);
      setHouseholdLoading(false);
      return;
    }

    const { data: houseData, error } = await supabase
      .from('households')
      .select('id, name, invite_code')
      .eq('id', householdId)
      .maybeSingle();

    if (error || !houseData) {
      console.error('[household] household_id do JWT não encontrado no banco:', householdId, error?.message);
      setHousehold(null);
      setHouseholdLoading(false);
      return;
    }

    setHousehold(houseData);
    await fetchExpenses(householdId);
    subscribeRealtime(householdId);
    setHouseholdLoading(false);
  };

  const subscribeRealtime = (householdId) => {
    realtimeChannel.current?.unsubscribe();
    realtimeChannel.current = supabase
      .channel(`expenses-${householdId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'expenses',
        filter: `household_id=eq.${householdId}`,
      }, (payload) => {
        if (payload.eventType === 'INSERT') {
          setExpenses(prev => {
            if (prev.find(e => e.id === payload.new.id)) return prev;
            return [payload.new, ...prev];
          });
        } else if (payload.eventType === 'DELETE') {
          setExpenses(prev => prev.filter(e => e.id !== payload.old.id));
        } else if (payload.eventType === 'UPDATE') {
          setExpenses(prev => prev.map(e => e.id === payload.new.id ? payload.new : e));
        }
      })
      .subscribe();
  };

  const fetchExpenses = async (householdId) => {
    setLoading(true);
    const { data, error } = await supabase
      .from('expenses')
      .select('*')
      .eq('household_id', householdId)
      .order('due_date', { ascending: false });

    if (error) console.error('Erro ao buscar despesas:', error);
    else setExpenses(data || []);
    setLoading(false);
  };

  const handleHouseholdReady = (newHousehold) => {
    hasFetchedHousehold.current = true;
    setHousehold(newHousehold);
    fetchExpenses(newHousehold.id);
    subscribeRealtime(newHousehold.id);
  };

  const handleAddExpense = async (newExpense) => {
    const { data: { user } } = await supabase.auth.getUser();
    const numericAmount = parseFloat(newExpense.amount.replace('.', '').replace(',', '.'));
    const addedByName = user.user_metadata?.full_name || user.email?.split('@')[0] || 'Usuário';

    const { error } = await supabase
      .from('expenses')
      .insert([{
        user_id: user.id,
        household_id: household.id,
        added_by_name: addedByName,
        name: newExpense.name,
        amount: numericAmount,
        category: newExpense.category,
        due_date: newExpense.dueDate,
        notes: newExpense.notes,
        recurring: newExpense.recurring,
        status: 'pendente'
      }]);

    if (error) {
      console.error('Erro ao salvar despesa:', error);
      alert(`Erro ao salvar: ${error.message}`);
    } else {
      setActiveTab('dashboard');
    }
  };

  const handleExportCSV = () => {
    if (expenses.length === 0) return alert('Nenhuma despesa para exportar.');
    const header = ['Nome', 'Categoria', 'Vencimento', 'Status', 'Valor'];
    const rows = expenses.map(e => [
      e.name, e.category, e.due_date, e.status,
      Number(e.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
    ]);
    const csv = [header, ...rows].map(r => r.map(c => `"${c ?? ''}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `despesas_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDeleteExpense = async (id) => {
    const { error } = await supabase
      .from('expenses')
      .delete()
      .eq('id', id);

    if (error) console.error('Erro ao deletar:', error);
    else setExpenses(expenses.filter(e => e.id !== id));
  };

  const handleToggleStatus = async (id, currentStatus) => {
    const newStatus = currentStatus === 'pago' ? 'pendente' : 'pago';
    const { error } = await supabase
      .from('expenses')
      .update({ status: newStatus })
      .eq('id', id);

    if (error) console.error('Erro ao atualizar status:', error);
    else {
      setExpenses(expenses.map(e => e.id === id ? { ...e, status: newStatus } : e));
    }
  };

  if (!session) {
    return <Login onLoginSuccess={() => {}} />;
  }

  if (householdLoading) {
    return <div className="loading-state">Carregando...</div>;
  }

  if (!household) {
    return (
      <div className="loading-state">
        Não foi possível carregar sua casa.
        <br />
        Verifique com o suporte ou abra o console (F12) para ver o erro.
        <br />
        <button onClick={() => supabase.auth.signOut()} style={{ marginTop: 12 }}>
          Sair
        </button>
      </div>
    );
  }

  const renderContent = () => {
    if (loading) return <div className="loading-state">Carregando...</div>;

    switch (activeTab) {
      case 'dashboard':
        return <Dashboard expenses={expenses} household={household} />;
      case 'incomes':
        return <Incomes user={session?.user} household={household} />;
      case 'expenses':
        return (
          <div className="expenses-view animate-in">
            <header className="view-header">
              <h1>Minhas Despesas</h1>
              <div className="view-actions">
                <button className="filter-tab active">Todas</button>
              </div>
            </header>
            <div className="expenses-list glass">
              {expenses.length === 0 ? <p className="empty-msg">Nenhuma despesa cadastrada.</p> : 
               expenses.map(exp => (
                <div key={exp.id} className="expense-row">
                  <div className="exp-info">
                    <strong>{exp.name}</strong>
                    <span>{exp.category} • {exp.due_date}{exp.added_by_name ? ` • ${exp.added_by_name}` : ''}</span>
                  </div>
                  <div className="exp-status" onClick={() => handleToggleStatus(exp.id, exp.status)}>
                    <span className={`status-tag ${exp.status}`}>{exp.status.toUpperCase()}</span>
                  </div>
                  <div className="exp-amount">
                    <strong>R$ {Number(exp.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                  </div>
                  <button className="delete-btn" onClick={() => handleDeleteExpense(exp.id)}>Excluir</button>
                </div>
              ))}
            </div>
          </div>
        );
      case 'calendar':
        return <CalendarView expenses={expenses.map(e => ({...e, date: e.due_date}))} onToggleStatus={handleToggleStatus} />;
      case 'new-entry':
        return <NewEntry onSave={handleAddExpense} onCancel={() => setActiveTab('dashboard')} />;
      case 'reports':
        return <Reports expenses={expenses} onExport={handleExportCSV} />;
      case 'settings':
        return <Settings user={session?.user} household={household} />;
      default:
        return <Dashboard expenses={expenses} household={household} />;
    }
  };

  return (
    <Layout activeTab={activeTab} setActiveTab={setActiveTab} onExport={handleExportCSV} user={session?.user}>
      {renderContent()}
    </Layout>
  );
}

export default App;
