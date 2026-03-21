import React, { useState, useEffect } from 'react';
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
  const [activeTab, setActiveTab ] = useState('dashboard');
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);

  // Auth state listener
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) fetchExpenses();
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) fetchExpenses();
      else setExpenses([]);
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchExpenses = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('expenses')
      .select('*')
      .order('due_date', { ascending: false });
    
    if (error) console.error('Erro ao buscar despesas:', error);
    else setExpenses(data || []);
    setLoading(false);
  };

  const handleAddExpense = async (newExpense) => {
    const { data: { user } } = await supabase.auth.getUser();
    
    // Converte valor para número para o banco
    const numericAmount = parseFloat(newExpense.amount.replace('.', '').replace(',', '.'));

    const { data, error } = await supabase
      .from('expenses')
      .insert([{
        user_id: user.id,
        name: newExpense.name,
        amount: numericAmount,
        category: newExpense.category,
        due_date: newExpense.dueDate,
        notes: newExpense.notes,
        recurring: newExpense.recurring,
        status: 'pendente'
      }])
      .select();

    if (error) {
      alert('Erro ao salvar no Supabase. Verifique se as tabelas foram criadas!');
      console.error(error);
    } else {
      setExpenses([data[0], ...expenses]);
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
    return <Login onLoginSuccess={() => fetchExpenses()} />;
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
                    <span>{exp.category} • {exp.due_date}</span>
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
