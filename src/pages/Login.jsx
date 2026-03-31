import React, { useState } from 'react';
import { supabase } from '../utils/supabaseClient';
import { Mail, Lock, LogIn, UserPlus, ArrowRight } from 'lucide-react';
import './Login.css';

const Login = ({ onLoginSuccess }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleAuth = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        alert('Verifique seu e-mail para confirmar o cadastro!');
      }
      onLoginSuccess();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container animate-in">
      <div className="login-visual">
        <div className="blur-circle primary"></div>
        <div className="blur-circle secondary"></div>
      </div>
      
      <div className="login-card glass">
        <header className="login-header">
          <div className="logo-icon glow"></div>
          <h1>{isLogin ? 'Bem-vindo de volta' : 'Crie sua conta'}</h1>
          <p>Ethereal Ledger • Controle Residencial</p>
        </header>

        {error && <div className="auth-error">{error}</div>}

        <form onSubmit={handleAuth} className="login-form">
          <div className="input-field">
            <label>E-MAIL</label>
            <div className="input-box">
              <Mail size={18} />
              <input 
                type="email" 
                placeholder="nome@exemplo.com" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="input-field">
            <label>SENHA</label>
            <div className="input-box">
              <Lock size={18} />
              <input 
                type="password" 
                placeholder="••••••••" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
          </div>

          <button type="submit" className="auth-submit glow" disabled={loading}>
            {loading ? 'Processando...' : isLogin ? 'Entrar' : 'Cadastrar'}
            <ArrowRight size={18} />
          </button>
        </form>

        <footer className="login-footer">
          <button onClick={() => setIsLogin(!isLogin)} className="toggle-auth">
            {isLogin ? 'Não tem uma conta? Cadastre-se' : 'Já tem uma conta? Entre agora'}
          </button>
        </footer>
      </div>
    </div>
  );
};

export default Login;
