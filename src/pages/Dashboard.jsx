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
import { 
  Home, 
  Utensils, 
  Ticket, 
  Car, 
  TrendingDown, 
  TrendingUp,
  ShoppingBag,
  Zap
} from 'lucide-react';
import './Dashboard.css';

ChartJS.register(
  ArcElement, 
  Tooltip, 
  Legend, 
  CategoryScale, 
  LinearScale, 
  PointElement, 
  LineElement
);

const Dashboard = ({ expenses = [] }) => {
  const chartData = {
    datasets: [{
      data: [45, 25, 15, 15],
      backgroundColor: [
        '#9D59FF',
        '#FF598B',
        '#5969FF',
        '#FF9459'
      ],
      borderWidth: 0,
      cutout: '80%'
    }]
  };

  const totalSpent = expenses.reduce((acc, exp) => {
    const val = typeof exp.amount === 'string' 
      ? parseFloat(exp.amount.replace('.', '').replace(',', '.')) 
      : exp.amount;
    return acc + (val || 0);
  }, 0);
  const formattedTotal = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalSpent);

  const categories = [
    { id: 1, name: 'Habitação', value: 'R$ 4.250', budget: '4.500', icon: Home, status: 'in' },
    { id: 2, name: 'Alimentação', value: 'R$ 2.360', budget: '2.000', icon: Utensils, status: 'out' },
    { id: 3, name: 'Lazer', value: 'R$ 1.416', budget: '1.800', icon: Ticket, status: 'in' },
    { id: 4, name: 'Transporte', value: 'R$ 840', budget: '1.200', icon: Car, status: 'in' },
  ];

  const recentTransactions = expenses.slice(0, 3).map(exp => ({
    id: `#${exp.id.toString().slice(-3)}`,
    name: exp.name,
    category: exp.category,
    date: exp.date,
    amount: `- R$ ${exp.amount}`,
    trend: 'stable'
  }));

  return (
    <div className="dashboard-container">
      <div className="dashboard-top-grid">
        <section className="chart-card glass">
          <div className="chart-header">
            <h3>Distribuição de Gastos</h3>
            <span>OUTUBRO 2023</span>
          </div>
          <div className="chart-main">
            <div className="chart-info">
              <div className="category-legend">
                <div className="legend-item">
                  <span className="dot" style={{background: '#9D59FF'}}></span>
                  <span className="name">Habitação</span>
                  <span className="val">R$ 4.250,00</span>
                  <span className="perc">45%</span>
                </div>
                <div className="legend-item">
                  <span className="dot" style={{background: '#FF598B'}}></span>
                  <span className="name">Alimentação</span>
                  <span className="val">R$ 2.360,00</span>
                  <span className="perc">25%</span>
                </div>
                <div className="legend-item">
                  <span className="dot" style={{background: '#5969FF'}}></span>
                  <span className="name">Lazer</span>
                  <span className="val">R$ 1.416,00</span>
                  <span className="perc">15%</span>
                </div>
              </div>
            </div>
            <div className="chart-viz">
              <Doughnut data={chartData} options={{ maintainAspectRatio: false }} />
              <div className="chart-center">
                <h2>85%</h2>
                <p>BUDGET GASTO</p>
              </div>
            </div>
          </div>
        </section>

        <section className="summary-card glass">
          <h3>Gastos Totais</h3>
          <p>Total acumulado de todas as suas despesas.</p>
          <div className="economy-value">
            <h2>{formattedTotal}</h2>
            <div className="pill glow">CONTA PROFISSIONAL</div>
          </div>
          <div className="progress-bar-container">
            <div className="progress-bar" style={{width: '100%'}}></div>
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
        <div className="cards-row">
          {categories.map(cat => (
            <div className="category-card glass" key={cat.id}>
              <div className="cat-top">
                <div className="icon-box"><cat.icon size={18} /></div>
                <span className={`status-pill ${cat.status === 'out' ? 'over' : 'in'}`}>
                  {cat.status === 'out' ? 'EXCEDIDO' : 'NO ORÇAMENTO'}
                </span>
              </div>
              <h4>{cat.name}</h4>
              <div className="cat-value">
                <h3>{cat.value} <small>/ {cat.budget}</small></h3>
              </div>
              <div className="cat-progress">
                <div className="bar" style={{width: `${(parseFloat(cat.value.replace('R$ ', '').replace('.', '')) / parseFloat(cat.budget)) * 100}%`}}></div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="recent-activity glass">
        <div className="activity-header">
          <h3>Análise de Subcategorias</h3>
          <p>Comparativo direto com os últimos 30 dias</p>
          <button className="filter-btn">FILTROS AVANÇADOS</button>
        </div>
        <div className="transactions-list">
          {recentTransactions.map(t => (
            <div className="transaction-item" key={t.id}>
              <span className="t-id">{t.id}</span>
              <div className="t-icon-box">
                {t.category === 'Alimentação' ? <ShoppingBag size={16} /> : 
                 t.category === 'Habitação' ? <Zap size={16} /> : <Home size={16} />}
              </div>
              <div className="t-info">
                <strong>{t.name}</strong>
                <span>{t.category} • {t.date}</span>
              </div>
              <div className={`t-amount ${t.trend}`}>
                <strong>{t.amount}</strong>
                <span>{t.trend === 'up' ? '+12% VS. MÉDIA' : t.trend === 'down' ? '-18% VS. MÉDIA' : 'ESTÁVEL'}</span>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

export default Dashboard;
