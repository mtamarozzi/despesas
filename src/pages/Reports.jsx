import React, { useState } from 'react';
import { BarChart3, TrendingDown, CheckCircle, Clock } from 'lucide-react';
import './Reports.css';

const fmt = (val) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

const Reports = ({ expenses = [], onExport }) => {
  const [filterStatus, setFilterStatus] = useState('todos');

  const totalGeral = expenses.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
  const totalPago = expenses.filter(e => e.status === 'pago').reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
  const totalPendente = expenses.filter(e => e.status === 'pendente').reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);

  const categoryMap = {};
  expenses.forEach(exp => {
    const cat = exp.category || 'Outros';
    if (!categoryMap[cat]) categoryMap[cat] = { total: 0, count: 0 };
    categoryMap[cat].total += parseFloat(exp.amount) || 0;
    categoryMap[cat].count += 1;
  });
  const categoryEntries = Object.entries(categoryMap).sort((a, b) => b[1].total - a[1].total);

  const filtered = filterStatus === 'todos'
    ? expenses
    : expenses.filter(e => e.status === filterStatus);

  return (
    <div className="reports-view animate-in">
      <header className="view-header">
        <h1>Relatórios</h1>
        <button className="export-btn-page glow" onClick={onExport}>
          Exportar CSV
        </button>
      </header>

      <div className="report-summary-cards">
        <div className="rcard glass">
          <BarChart3 size={22} color="#9D59FF" />
          <div>
            <span>Total Geral</span>
            <h3>{fmt(totalGeral)}</h3>
          </div>
        </div>
        <div className="rcard glass">
          <CheckCircle size={22} color="#59FFB5" />
          <div>
            <span>Total Pago</span>
            <h3>{fmt(totalPago)}</h3>
          </div>
        </div>
        <div className="rcard glass">
          <Clock size={22} color="#FF9459" />
          <div>
            <span>Total Pendente</span>
            <h3>{fmt(totalPendente)}</h3>
          </div>
        </div>
        <div className="rcard glass">
          <TrendingDown size={22} color="#FF598B" />
          <div>
            <span>Nº de Despesas</span>
            <h3>{expenses.length}</h3>
          </div>
        </div>
      </div>

      {categoryEntries.length > 0 && (
        <section className="report-section glass">
          <h3>Por Categoria</h3>
          <table className="report-table">
            <thead>
              <tr>
                <th>Categoria</th>
                <th>Qtd.</th>
                <th>Total</th>
                <th>% do Total</th>
              </tr>
            </thead>
            <tbody>
              {categoryEntries.map(([cat, { total, count }]) => (
                <tr key={cat}>
                  <td>{cat}</td>
                  <td>{count}</td>
                  <td>{fmt(total)}</td>
                  <td>{totalGeral > 0 ? Math.round((total / totalGeral) * 100) : 0}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section className="report-section glass">
        <div className="report-section-header">
          <h3>Todas as Despesas</h3>
          <div className="filter-tabs">
            {['todos', 'pendente', 'pago'].map(s => (
              <button
                key={s}
                className={`filter-tab ${filterStatus === s ? 'active' : ''}`}
                onClick={() => setFilterStatus(s)}
              >
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
        </div>
        {filtered.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)' }}>Nenhuma despesa encontrada.</p>
        ) : (
          <table className="report-table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Categoria</th>
                <th>Vencimento</th>
                <th>Status</th>
                <th>Valor</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(exp => (
                <tr key={exp.id}>
                  <td>{exp.name}</td>
                  <td>{exp.category}</td>
                  <td>{exp.due_date}</td>
                  <td>
                    <span className={`status-tag ${exp.status}`}>
                      {exp.status?.toUpperCase()}
                    </span>
                  </td>
                  <td>{fmt(parseFloat(exp.amount))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
};

export default Reports;
