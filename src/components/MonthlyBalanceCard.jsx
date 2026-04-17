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
