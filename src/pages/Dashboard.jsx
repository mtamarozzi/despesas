import React from 'react';
import { Doughnut } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement
} from 'chart.js';
import { Home, Utensils, Ticket, Car, ShoppingBag, Zap, Tag } from 'lucide-react';
import { MonthlyBalanceCard } from '../components/MonthlyBalanceCard';
import './Dashboard.css';

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, PointElement, LineElement);

const CHART_COLORS = ['#9D59FF', '#FF598B', '#5969FF', '#FF9459', '#59FFB5', '#FFE459'];

const CATEGORY_ICONS = {
  'Habitação': Home, 'Aluguel': Home, 'Alimentação': Utensils,
  'Lazer': Ticket, 'Transporte': Car, 'Compras': ShoppingBag, 'Energia': Zap,
};

const fmt = (val) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

const Dashboard = ({ expenses = [], household }) => {
  const now = new Date();
  const monthNames = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  const currentMonthLabel = `${monthNames[now.getMonth()].toUpperCase()} ${now.getFullYear()}`;

  const totalSpent = expenses.reduce((acc, exp) => acc + (parseFloat(exp.amount) || 0), 0);

  const categoryMap = {};
  expenses.forEach(exp => {
    const cat = exp.category || 'Outros';
    categoryMap[cat] = (categoryMap[cat] || 0) + (parseFloat(exp.amount) || 0);
  });
  const categoryEntries = Object.entries(categoryMap);
  const total = categoryEntries.reduce((s, [, v]) => s + v, 0) || 1;

  const chartData = {
    datasets: [{
      data: categoryEntries.length > 0 ? categoryEntries.map(([, v]) => v) : [1],
      backgroundColor: categoryEntries.length > 0 ? CHART_COLORS.slice(0, categoryEntries.length) : ['#333'],
      borderWidth: 0,
      cutout: '80%'
    }]
  };

  const recentTransactions = expenses.slice(0, 5).map(exp => ({
    id: `#${exp.id.toString().slice(-3)}`,
    name: exp.name,
    category: exp.category,
    date: exp.due_date,
    amount: Number(exp.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
  }));

  return (
    <div className="dashboard-container">
      <MonthlyBalanceCard household={household} />
      <div className="dashboard-top-grid">
        <section className="chart-card glass">
          <div className="chart-header">
            <h3>Distribuição de Gastos</h3>
            <span>{currentMonthLabel}</span>
          </div>
          {categoryEntries.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)', padding: '32px 0' }}>Nenhuma despesa cadastrada.</p>
          ) : (
            <div className="chart-main">
              <div className="chart-info">
                <div className="category-legend">
                  {categoryEntries.map(([name, value], i) => (
                    <div className="legend-item" key={name}>
                      <span className="dot" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }}></span>
                      <span className="name">{name}</span>
                      <span className="val">{fmt(value)}</span>
                      <span className="perc">{Math.round((value / total) * 100)}%</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="chart-viz">
                <Doughnut data={chartData} options={{ maintainAspectRatio: false }} />
                <div className="chart-center">
                  <h2>100%</h2>
                  <p>DO TOTAL</p>
                </div>
              </div>
            </div>
          )}
        </section>

        <section className="summary-card glass">
          <h3>Gastos Totais</h3>
          <p>Total acumulado de todas as suas despesas.</p>
          <div className="economy-value">
            <h2>{fmt(totalSpent)}</h2>
            <div className="pill glow">CONTA PROFISSIONAL</div>
          </div>
          <div className="progress-bar-container">
            <div className="progress-bar" style={{ width: '100%' }}></div>
            <div className="progress-labels">
              <span>VISÃO GERAL</span>
              <span>EM TEMPO REAL</span>
            </div>
          </div>
        </section>
      </div>

      <section className="categories-grid">
        <div className="section-header">
          <h3>Categorias Principais</h3>
        </div>
        {categoryEntries.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)' }}>Nenhuma categoria encontrada.</p>
        ) : (
          <div className="cards-row">
            {categoryEntries.map(([name, value], i) => {
              const Icon = CATEGORY_ICONS[name] || Tag;
              return (
                <div className="category-card glass" key={name}>
                  <div className="cat-top">
                    <div className="icon-box"><Icon size={18} /></div>
                    <span className="status-pill in">NO ORÇAMENTO</span>
                  </div>
                  <h4>{name}</h4>
                  <div className="cat-value">
                    <h3>{fmt(value)}</h3>
                  </div>
                  <div className="cat-progress">
                    <div className="bar" style={{ width: `${Math.round((value / total) * 100)}%`, background: CHART_COLORS[i % CHART_COLORS.length] }}></div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="recent-activity glass">
        <div className="activity-header">
          <h3>Despesas Recentes</h3>
          <p>Suas últimas despesas cadastradas</p>
        </div>
        <div className="transactions-list">
          {recentTransactions.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)' }}>Nenhuma despesa para exibir.</p>
          ) : recentTransactions.map(t => {
            const Icon = CATEGORY_ICONS[t.category] || Tag;
            return (
              <div className="transaction-item" key={t.id}>
                <span className="t-id">{t.id}</span>
                <div className="t-icon-box"><Icon size={16} /></div>
                <div className="t-info">
                  <strong>{t.name}</strong>
                  <span>{t.category} • {t.date}</span>
                </div>
                <div className="t-amount stable">
                  <strong>- R$ {t.amount}</strong>
                  <span>ESTÁVEL</span>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
};

export default Dashboard;
