import React, { useState, useEffect } from 'react';
import { KeyRound, Mail, CheckCircle2, AlertCircle, ArrowRight, Eye, EyeOff } from 'lucide-react';

export default function Auth({ onLoginSuccess }) {
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [verifyingToken, setVerifyingToken] = useState(false);

  // Check URL query parameters for ?token=XYZ
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');

    if (token) {
      setVerifyingToken(true);
      fetch(`/api/auth/verify?token=${token}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.error) {
            setError(data.error);
          } else {
            setSuccessMsg(data.message || 'Email verified successfully! You can now log in.');
            setMode('login');
          }
        })
        .catch((err) => {
          setError('Failed to verify token: ' + err.message);
        })
        .finally(() => {
          setVerifyingToken(false);
          // Clean up URL query without reload and reset path to root
          window.history.replaceState({}, document.title, '/');
        });
    }
  }, []);

  const [registeredVerifyUrl, setRegisteredVerifyUrl] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    setRegisteredVerifyUrl('');
    setLoading(true);

    const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/register';

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Request failed');
      }

      if (mode === 'register') {
        setSuccessMsg(data.message || 'Registration successful! Check your email for a verification link.');
        if (data.verifyUrl) {
          setRegisteredVerifyUrl(data.verifyUrl);
        }
        setMode('login');
        setPassword('');
      } else {
        // Login success
        onLoginSuccess(data.token, data.user);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-header" style={{ textAlign: 'center' }}>
        <h1 className="brand-logo-title">BillAI</h1>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginTop: '0.25rem' }}>
          {mode === 'login' ? 'Admin Sign In' : 'Register Admin Account'}
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginTop: '0.25rem' }}>
          {mode === 'login'
            ? 'Access organization hierarchy & API token management'
            : 'Create your multi-tenant admin account'}
        </p>
      </div>

      {verifyingToken && (
        <div className="alert-box alert-success">
          Verifying your email token...
        </div>
      )}

      {error && (
        <div className="alert-box alert-error" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div className="alert-box alert-success" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <CheckCircle2 size={18} />
            <span>{successMsg}</span>
          </div>
          {registeredVerifyUrl && (
            <div style={{ marginTop: '0.25rem' }}>
              <a
                href={registeredVerifyUrl}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.25rem',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  color: 'var(--accent-cyan)',
                  textDecoration: 'underline',
                }}
              >
                Click here to verify account immediately →
              </a>
            </div>
          )}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label>Email Address</label>
          <div style={{ position: 'relative' }}>
            <input
              type="email"
              required
              className="form-input"
              style={{ width: '100%', paddingLeft: '2.5rem' }}
              placeholder="admin@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Mail size={16} style={{ position: 'absolute', left: '0.8rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          </div>
        </div>

        <div className="form-group">
          <label>Password</label>
          <div style={{ position: 'relative' }}>
            <input
              type={showPassword ? 'text' : 'password'}
              required
              className="form-input"
              style={{ width: '100%', paddingLeft: '2.5rem', paddingRight: '2.5rem' }}
              placeholder="••••••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <KeyRound size={16} style={{ position: 'absolute', left: '0.8rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              style={{
                position: 'absolute',
                right: '0.8rem',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
                color: 'var(--text-muted)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              title={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        <button
          type="submit"
          className="btn-primary"
          style={{ width: '100%', justifyContent: 'center', marginTop: '1rem', padding: '0.75rem' }}
          disabled={loading}
        >
          {loading
            ? 'Processing...'
            : mode === 'login'
            ? 'Sign In'
            : 'Register Account'}
          <ArrowRight size={16} />
        </button>
      </form>

      <div style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
        {mode === 'login' ? (
          <span>
            Don't have an admin account?{' '}
            <button
              style={{ background: 'none', border: 'none', color: 'var(--text-main)', cursor: 'pointer', fontWeight: 600, textDecoration: 'underline' }}
              onClick={() => {
                setMode('register');
                setError('');
                setSuccessMsg('');
              }}
            >
              Register here
            </button>
          </span>
        ) : (
          <span>
            Already registered?{' '}
            <button
              style={{ background: 'none', border: 'none', color: 'var(--text-main)', cursor: 'pointer', fontWeight: 600, textDecoration: 'underline' }}
              onClick={() => {
                setMode('login');
                setError('');
                setSuccessMsg('');
              }}
            >
              Sign in
            </button>
          </span>
        )}
      </div>
    </div>
  );
}
