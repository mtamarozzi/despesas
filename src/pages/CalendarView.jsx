import React, { useState } from 'react';

const CHIP_COLORS = ['#9D59FF', '#FF598B', '#5969FF', '#FF9459', '#59FFB5', '#c084fc'];

import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import './CalendarView.css';

const CalendarView = ({ expenses = [], onToggleStatus }) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  
  const daysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = (year, month) => new Date(year, month, 1).getDay();

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const prevMonth = () => setCurrentDate(new Date(year, month - 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1));

  const days = [];
  const totalDays = daysInMonth(year, month);
  const startDay = firstDayOfMonth(year, month);

  // Padding for previous month
  for (let i = 0; i < startDay; i++) days.push(null);
  
  // Current month days
  for (let d = 1; d <= totalDays; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const dayExpenses = expenses.filter(exp => exp.date === dateStr);
    days.push({ day: d, date: dateStr, expenses: dayExpenses });
  }

  const monthNames = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];

  return (
    <div className="calendar-view animate-in">
      <header className="calendar-header">
        <div className="month-selector">
          <h2>{monthNames[month]} {year}</h2>
          <div className="nav-btns">
            <button onClick={prevMonth}><ChevronLeft size={20} /></button>
            <button onClick={nextMonth}><ChevronRight size={20} /></button>
          </div>
        </div>
        <button className="add-event-btn glow"><Plus size={18} /> Nova Despesa</button>
      </header>

      <div className="calendar-grid glass">
        <div className="weekday-header">
          {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(d => <span key={d}>{d}</span>)}
        </div>
        <div className="days-container">
          {days.map((item, idx) => (
            <div key={idx} className={`day-cell ${item === null ? 'empty' : ''} ${item?.day === new Date().getDate() && month === new Date().getMonth() ? 'today' : ''}`}>
              {item && (
                <>
                  <span className="day-number">{item.day}</span>
                  <div className="day-chips">
                    {item.expenses.map((exp, idx) => (
                      <div
                        key={exp.id}
                        className={`expense-chip ${exp.status === 'pago' ? 'chip-pago' : ''}`}
                        style={{ background: CHIP_COLORS[idx % CHIP_COLORS.length] }}
                        title={`${exp.status === 'pago' ? '✓ Pago' : 'Pendente'} — R$ ${Number(exp.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
                        onClick={() => onToggleStatus && onToggleStatus(exp.id, exp.status)}
                      >
                        {exp.name}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </div>

      <section className="upcoming-events glass">
        <h3>Próximos Vencimentos</h3>
        <div className="events-list">
          {expenses.filter(e => new Date(e.date) >= new Date()).slice(0, 5).map(e => (
            <div key={e.id} className="event-item">
              <div className="event-date">
                <span>{new Date(e.date).getDate()}</span>
                <small>{monthNames[new Date(e.date).getMonth()].slice(0, 3)}</small>
              </div>
              <div className="event-info">
                <strong>{e.name}</strong>
                <span>{e.category}</span>
              </div>
              <div className="event-amount">R$ {e.amount}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

export default CalendarView;
