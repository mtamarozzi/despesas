import React, { useState } from 'react';
import { Calendar, Tag, FileText, ChevronDown, Check } from 'lucide-react';
import './NewEntry.css';

const NewEntry = ({ onSave, onCancel }) => {
  const [formData, setFormData] = useState({
    name: '',
    amount: '0,00',
    category: '',
    dueDate: '',
    notes: '',
    recurring: false
  });

  const categories = [
    'Habitação', 'Alimentação', 'Transporte', 'Lazer', 'Saúde', 'Educação', 'Outros'
  ];

  return (
    <div className="new-entry-container animate-in">
      <header className="new-entry-header">
        <h1>Nova Despesa</h1>
        <p>Adicione os detalhes da sua transação residencial</p>
      </header>

      <div className="form-card glass">
        <form onSubmit={(e) => { e.preventDefault(); onSave(formData); }}>
          <div className="form-grid">
            <div className="input-group">
              <label>NOME DA DESPESA</label>
              <div className="input-wrapper">
                <input 
                  type="text" 
                  placeholder="Ex: Aluguel, Supermercado" 
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                />
              </div>
            </div>

            <div className="input-group">
              <label>VALOR</label>
              <div className="input-wrapper amount">
                <span>R$</span>
                <input 
                  type="text" 
                  placeholder="0,00"
                  value={formData.amount}
                  onChange={(e) => setFormData({...formData, amount: e.target.value})}
                />
              </div>
            </div>

            <div className="input-group">
              <label>CATEGORIA</label>
              <div className="select-wrapper">
                <select 
                  value={formData.category}
                  onChange={(e) => setFormData({...formData, category: e.target.value})}
                >
                  <option value="" disabled>Selecione uma categoria</option>
                  {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <ChevronDown size={18} className="select-icon" />
              </div>
            </div>

            <div className="input-group">
              <label>DATA DE VENCIMENTO</label>
              <div className="input-wrapper">
                <input 
                  type="date" 
                  value={formData.dueDate}
                  onChange={(e) => setFormData({...formData, dueDate: e.target.value})}
                />
              </div>
            </div>
          </div>

          <div className="input-group full-width">
            <label>NOTAS ADICIONAIS</label>
            <div className="input-wrapper textarea">
              <textarea 
                placeholder="Detalhes opcionais sobre esta despesa..."
                value={formData.notes}
                onChange={(e) => setFormData({...formData, notes: e.target.value})}
              />
            </div>
          </div>

          <div className="toggle-group glass">
            <div className="toggle-info">
              <div className="icon-box"><Calendar size={18} /></div>
              <div className="text">
                <strong>Despesa Recorrente</strong>
                <span>Repetir mensalmente</span>
              </div>
            </div>
            <label className="switch">
              <input 
                type="checkbox" 
                checked={formData.recurring}
                onChange={(e) => setFormData({...formData, recurring: e.target.checked})}
              />
              <span className="slider round"></span>
            </label>
          </div>

          <div className="form-actions">
            <button type="submit" className="save-btn glow">Salvar Despesa</button>
            <button type="button" className="cancel-btn" onClick={onCancel}>Cancelar</button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default NewEntry;
