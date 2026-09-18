import React, { useState, useEffect } from 'react';
import { CheckCircle2, AlertCircle, Copy, Check, Key, ShieldCheck, Terminal } from 'lucide-react';

export default function AcceptInvite() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [memberData, setMemberData] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');

    if (!token) {
      setError('Missing invite token in URL.');
      setLoading(false);
      return;
    }

    fetch(`/api/team-members/accept?token=${encodeURIComponent(token)}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Failed to accept invitation');
        }
        setMemberData(data);
      })
      .catch((err) => {
        setError(err.message);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const handleCopyKey = () => {
    if (memberData?.billai_key) {
      navigator.clipboard.writeText(memberData.billai_key);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const psSnippet = memberData
    ? `Invoke-RestMethod -Uri "http://localhost:3001/v1/groq/chat/completions" -Method Post -Headers @{ "X-BillAI-Key" = "${memberData.billai_key}"; "Authorization" = "Bearer YOUR_GROQ_API_KEY" } -ContentType "application/json" -Body '{"model": "openai/gpt-oss-20b", "messages": [{"role": "user", "content": "Hello world"}]}'`
    : '';

  return (
    <div className="auth-container" style={{ maxWidth: '600px', margin: '3rem auto' }}>
      <div className="auth-header" style={{ textAlign: 'center' }}>
        <h1 className="brand-logo-title">BillAI</h1>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginTop: '0.25rem' }}>
          BillAI Team Invitation
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginTop: '0.25rem' }}>
          Employee Gateway Key Activation
        </p>
      </div>

      {loading && (
        <div className="alert-box alert-success" style={{ textAlign: 'center' }}>
          Activating your BillAI Team Invitation...
        </div>
      )}

      {error && (
        <div className="alert-box alert-error" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <AlertCircle size={20} />
          <div>
            <div style={{ fontWeight: 600 }}>Activation Failed</div>
            <div style={{ fontSize: '0.85rem' }}>{error}</div>
          </div>
        </div>
      )}

      {memberData && (
        <div>
          <div className="alert-box alert-success" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <CheckCircle2 size={24} style={{ color: 'var(--accent-green)', flexShrink: 0 }} />
            <div>
              <div style={{ fontWeight: 700, fontSize: '1rem' }}>Invitation Accepted!</div>
              <div style={{ fontSize: '0.85rem' }}>
                Your access for <strong>{memberData.email}</strong> on team <strong>{memberData.team_name}</strong> is now <span className="status-badge status-active">ACTIVE</span>.
              </div>
            </div>
          </div>

          <div style={{ marginTop: '1.5rem' }}>
            <label style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.5rem' }}>
              <Key size={16} color="var(--accent-cyan)" /> Your Unique BillAI API Key:
            </label>
            <div
              style={{
                background: '#0d1117',
                border: '1px solid var(--accent-cyan)',
                borderRadius: '8px',
                padding: '0.85rem 1rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '0.5rem',
              }}
            >
              <code className="mono" style={{ color: 'var(--accent-cyan)', fontSize: '0.95rem', wordBreak: 'break-all' }}>
                {memberData.billai_key}
              </code>
              <button
                onClick={handleCopyKey}
                className="btn-secondary"
                style={{ padding: '0.4rem 0.75rem', fontSize: '0.8rem', flexShrink: 0 }}
                title="Copy BillAI Key"
              >
                {copied ? <Check size={14} color="var(--accent-green)" /> : <Copy size={14} />}
                {copied ? 'Copied!' : 'Copy Key'}
              </button>
            </div>
          </div>

          <div style={{ marginTop: '1.75rem', background: '#161b22', border: '1px solid var(--panel-border)', borderRadius: '8px', padding: '1.25rem' }}>
            <div style={{ fontWeight: 600, fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', color: 'var(--text-main)' }}>
              <Terminal size={16} color="var(--accent-purple)" /> PowerShell Quickstart Test Command
            </div>
            <pre
              style={{
                background: '#0d1117',
                border: '1px solid var(--panel-border)',
                borderRadius: '6px',
                padding: '0.85rem',
                color: '#f0f6fc',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.78rem',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
                overflowX: 'auto',
              }}
            >
              {psSnippet}
            </pre>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.6rem' }}>
              <em>Note: Replace <code>YOUR_GROQ_API_KEY</code> with your real Groq API key.</em>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
