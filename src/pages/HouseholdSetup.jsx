import React, { useState } from 'react';
import { supabase } from '../utils/supabaseClient';
import { Home, Users, Copy, Check, ArrowLeft } from 'lucide-react';
import './HouseholdSetup.css';

const generateCode = () => Math.random().toString(36).substring(2, 8).toUpperCase();

const HouseholdSetup = ({ user, onHouseholdReady }) => {
  const [mode, setMode] = useState(null); // 'create' | 'join'
  const [householdName, setHouseholdName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [createdCode, setCreatedCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [createdHousehold, setCreatedHousehold] = useState(null);

  const handleCreate = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const code = generateCode();

    const { data: household, error: hErr } = await supabase
      .from('households')
      .insert([{ name: householdName.trim(), invite_code: code, created_by: user.id }])
      .select()
      .single();

    if (hErr) { setError('Erro ao criar família. Tente novamente.'); setLoading(false); return; }

    const { error: mErr } = await supabase
      .from('household_members')
      .insert([{ household_id: household.id, user_id: user.id }]);

    if (mErr) { setError('Erro ao criar família. Tente novamente.'); setLoading(false); return; }

    setCreatedCode(code);
    setCreatedHousehold(household);
    setLoading(false);
  };

  const handleJoin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const { data: household, error: hErr } = await supabase
      .from('households')
      .select('*')
      .eq('invite_code', inviteCode.toUpperCase().trim())
      .single();

    if (hErr || !household) {
      setError('Código inválido. Verifique com seu cônjuge e tente novamente.');
      setLoading(false);
      return;
    }

    const { error: mErr } = await supabase
      .from('household_members')
      .insert([{ household_id: household.id, user_id: user.id }]);

    if (mErr) {
      setError('Você já faz parte desta família ou ocorreu um erro.');
      setLoading(false);
      return;
    }

    setLoading(false);
    onHouseholdReady(household);
  };

  const copyCode = () => {
    navigator.clipboard.writeText(createdCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (createdHousehold) {
    return (
      <div className="household-screen">
        <div className="household-card glass animate-in">
          <div className="hs-success-icon"><Check size={32} /></div>
          <h2>Família criada!</h2>
          <p className="hs-sub">Compartilhe o código abaixo com sua esposa para ela entrar.</p>
          <div className="invite-code-display">
            <span>{createdCode}</span>
            <button className="copy-btn" onClick={copyCode}>
              {copied ? <Check size={16} /> : <Copy size={16} />}
              {copied ? 'Copiado!' : 'Copiar'}
            </button>
          </div>
          <p className="hs-hint">Ela deverá criar uma conta e inserir este código ao fazer login pela primeira vez.</p>
          <button className="hs-primary-btn glow" onClick={() => onHouseholdReady(createdHousehold)}>
            Continuar para o App
          </button>
        </div>
      </div>
    );
  }

  if (mode === 'create') {
    return (
      <div className="household-screen">
        <div className="household-card glass animate-in">
          <button className="hs-back-btn" onClick={() => setMode(null)}><ArrowLeft size={18} /> Voltar</button>
          <h2>Criar Família</h2>
          <p className="hs-sub">Dê um nome para a sua família. Um código de convite será gerado.</p>
          <form onSubmit={handleCreate} className="hs-form">
            <div className="hs-input-group">
              <label>NOME DA FAMÍLIA</label>
              <input
                type="text"
                placeholder="Ex: Família Silva"
                value={householdName}
                onChange={(e) => setHouseholdName(e.target.value)}
                required
              />
            </div>
            {error && <p className="hs-error">{error}</p>}
            <button type="submit" className="hs-primary-btn glow" disabled={loading}>
              {loading ? 'Criando...' : 'Criar Família'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (mode === 'join') {
    return (
      <div className="household-screen">
        <div className="household-card glass animate-in">
          <button className="hs-back-btn" onClick={() => setMode(null)}><ArrowLeft size={18} /> Voltar</button>
          <h2>Entrar na Família</h2>
          <p className="hs-sub">Insira o código de convite que seu cônjuge compartilhou com você.</p>
          <form onSubmit={handleJoin} className="hs-form">
            <div className="hs-input-group">
              <label>CÓDIGO DE CONVITE</label>
              <input
                type="text"
                placeholder="Ex: AB12CD"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                maxLength={6}
                required
              />
            </div>
            {error && <p className="hs-error">{error}</p>}
            <button type="submit" className="hs-primary-btn glow" disabled={loading}>
              {loading ? 'Entrando...' : 'Entrar na Família'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="household-screen">
      <div className="household-card glass animate-in">
        <div className="hs-logo glow"></div>
        <h2>Bem-vindo ao Ethereal Ledger</h2>
        <p className="hs-sub">Para começar, crie uma família ou entre em uma já existente com o código de convite.</p>
        <div className="hs-options">
          <button className="hs-option-btn glass" onClick={() => setMode('create')}>
            <Home size={28} />
            <strong>Criar Família</strong>
            <span>Inicie um novo espaço compartilhado e convide seu cônjuge</span>
          </button>
          <button className="hs-option-btn glass" onClick={() => setMode('join')}>
            <Users size={28} />
            <strong>Entrar na Família</strong>
            <span>Use o código de convite que seu cônjuge gerou</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default HouseholdSetup;
