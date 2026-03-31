import React, { useState, useEffect, useRef } from 'react';
import { supabase } from './utils/supabaseClient';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import NewEntry from './pages/NewEntry';
import Login from './pages/Login';
import CalendarView from './pages/CalendarView';
import Reports from './pages/Reports';
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
    // Usa apenas onAuthStateChange — ele dispara INITIAL_SESSION no carregamento da página
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
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
    });

    return () => {
      subscription.unsubscribe();
      realtimeChannel.current?.unsubscribe();
    };
  }, []);

  const fetchHousehold = async (user) => {
    setHouseholdLoading(true);

    let householdId = user.user_metadata?.household_id;

    if (!householdId) {
      // Tenta encontrar a household padrão "CasaFlow" ou cria uma nova
      const { data: existingHouse, error: searchError } = await supabase
        .from('households')
        .select('id, name, invite_code')
        .eq('name', 'CasaFlow')
        .maybeSingle();

      if (existingHouse) {
        householdId = existingHouse.id;
      } else {
        const { data: newHouse, error: createError } = await supabase
          .from('households')
          .insert([{ name: 'CasaFlow', invite_code: 'CASAF' + Math.random().toString(36).substring(7).toUpperCase() }])
          .select()
          .single();
        
        if (newHouse) householdId = newHouse.id;
        else {
          console.error('Erro ao criar família padrão:', createError);
          setHouseholdLoading(false);
          return;
        }
      }

      if (householdId) {
        // Vincula o usuário à household permanentemente nos metadados
        await supabase.auth.updateUser({
          data: { household_id: householdId }
        });
      }
    }

    // Busca detalhes da família (nome e código de convite)
    const { data: houseData, error } = await supabase
      .from('households')
      .select('id, name, invite_code')
      .eq('id', householdId)
      .single();

    if (error) {
      console.error('Erro ao buscar família:', error.message);
      setHouseholdLoading(false);
      return;
    }

    if (houseData) {
      setHousehold(houseData);
      await fetchExpenses(householdId);
      subscribeRealtime(householdId);
    }

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
    return <div className="loading-state">Configurando CasaFlow...</div>;
  }

  const renderContent = () => {
    if (loading) return <div className="loading-state">Carregando...</div>;

    switch (activeTab) {
      case 'dashboard':
        return <Dashboard expenses={expenses} />;
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
      default:
        return <Dashboard expenses={expenses} />;
    }
  };

  return (
    <Layout activeTab={activeTab} setActiveTab={setActiveTab} onExport={handleExportCSV} user={session?.user}>
      {renderContent()}
    </Layout>
  );
}

export default App;
