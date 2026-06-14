'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function Login() {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const endpoint = isLogin ? '/api/auth/login' : '/api/auth/register';

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      const data = await res.json();
      
      if (data.success) {
        router.push('/');
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError('Connection Error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', minHeight: '80vh' }}>
      
      <div className="glass-panel" style={{ maxWidth: '450px', width: '100%', padding: '3rem', borderRadius: '16px', background: 'var(--bg-card)' }}>
        
        <h1 style={{ textAlign: 'center', marginBottom: '0.5rem', fontSize: '2.5rem' }}>
          ToneManager
        </h1>
        <h2 style={{ textAlign: 'center', marginBottom: '2.5rem', fontSize: '1.2rem', color: 'var(--text-muted)', fontWeight: 'normal' }}>
          {isLogin ? 'Log in to continue' : 'Create an account to start'}
        </h2>

        {error && (
          <div style={{ background: 'rgba(255,0,0,0.1)', border: '1px solid rgba(255,0,0,0.3)', color: '#ff6b6b', padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem', fontSize: '1rem', textAlign: 'center' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group" style={{ marginBottom: '1.5rem' }}>
            <label style={{ fontSize: '1rem', marginBottom: '0.6rem', color: 'var(--text-primary)' }}>Username</label>
            <input 
              type="text" 
              required
              value={username} 
              onChange={e => setUsername(e.target.value)} 
              style={{ fontSize: '1.1rem', padding: '0.8rem' }}
            />
          </div>
          <div className="form-group" style={{ marginBottom: '2rem' }}>
            <label style={{ fontSize: '1rem', marginBottom: '0.6rem', color: 'var(--text-primary)' }}>Password</label>
            <input 
              type="password" 
              required
              value={password} 
              onChange={e => setPassword(e.target.value)} 
              style={{ fontSize: '1.1rem', padding: '0.8rem' }}
            />
          </div>
          
          <button type="submit" className="search-button" disabled={loading} style={{ width: '100%', justifyContent: 'center', fontSize: '1.1rem', padding: '1rem' }}>
            {loading ? 'Please wait...' : (isLogin ? 'Log in' : 'Register Account')}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: '2.5rem', fontSize: '1rem', color: 'var(--text-muted)' }}>
          {isLogin ? "Don't have an account?" : 'Already have an account?'}
          <button 
            type="button" 
            onClick={() => setIsLogin(!isLogin)} 
            style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', marginLeft: '0.5rem', fontWeight: 'bold', fontSize: '1rem', textDecoration: 'underline' }}
          >
            {isLogin ? 'Sign up' : 'Log in'}
          </button>
        </div>
      </div>
    </main>
  );
}
