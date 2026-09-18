import React, { useState, useEffect } from 'react';
import {
  Building2,
  Folder,
  Users,
  UserPlus,
  Copy,
  Check,
  Plus,
  AlertCircle,
  ChevronRight,
  X,
  Mail,
  CheckCircle2,
  XCircle,
  AlertTriangle,
} from 'lucide-react';

export default function OrgManager({
  token,
  orgs,
  setOrgs,
  selectedOrg,
  setSelectedOrg,
  projects,
  setProjects,
  selectedProject,
  setSelectedProject,
  onRefreshAll,
}) {
  const [drillLevel, setDrillLevel] = useState('projects'); // 'projects' | 'teams' | 'members'

  const [teams, setTeams] = useState([]);
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [members, setMembers] = useState([]);

  // Modal Control States
  const [showOrgModal, setShowOrgModal] = useState(false);
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [showTeamModal, setShowTeamModal] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);

  // Form Inputs
  const [newOrgName, setNewOrgName] = useState('');
  const [newProjectName, setNewProjectName] = useState('');
  const [newTeamName, setNewTeamName] = useState('');
  const [inviteText, setInviteText] = useState('');

  // Status & Feedback States
  const [error, setError] = useState('');
  const [copiedKey, setCopiedKey] = useState(null);
  const [inviteSummary, setInviteSummary] = useState(null);
  const [inviting, setInviting] = useState(false);

  const authHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };

  // Fetch Projects when selectedOrg changes
  useEffect(() => {
    if (!selectedOrg) {
      setProjects([]);
      setSelectedProject(null);
      return;
    }
    fetch(`/api/organizations/${selectedOrg.id}/projects`, { headers: authHeaders })
      .then((res) => res.json())
      .then((data) => {
        setProjects(data);
        if (data.length > 0 && (!selectedProject || !data.some((p) => p.id === selectedProject.id))) {
          setSelectedProject(data[0]);
        }
      })
      .catch(() => setError('Failed to fetch projects'));
  }, [selectedOrg]);

  // Fetch Teams when selectedProject changes
  useEffect(() => {
    if (!selectedProject) {
      setTeams([]);
      setSelectedTeam(null);
      return;
    }
    fetch(`/api/projects/${selectedProject.id}/teams`, { headers: authHeaders })
      .then((res) => res.json())
      .then((data) => {
        setTeams(data);
        if (data.length > 0) {
          setSelectedTeam(data[0]);
        } else {
          setSelectedTeam(null);
        }
      })
      .catch(() => setError('Failed to fetch teams'));
  }, [selectedProject]);

  // Fetch Members when selectedTeam changes
  const fetchMembers = async () => {
    if (!selectedTeam) {
      setMembers([]);
      return;
    }
    try {
      const res = await fetch(`/api/teams/${selectedTeam.id}/members`, { headers: authHeaders });
      if (res.ok) {
        const data = await res.json();
        setMembers(data);
      }
    } catch (_) {
      setError('Failed to fetch members');
    }
  };

  useEffect(() => {
    fetchMembers();
  }, [selectedTeam]);

  // Create Organization
  const handleCreateOrg = async (e) => {
    e.preventDefault();
    if (!newOrgName.trim()) return;
    try {
      const res = await fetch('/api/organizations', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ name: newOrgName }),
      });
      if (res.ok) {
        const org = await res.json();
        setOrgs([org, ...orgs]);
        setSelectedOrg(org);
        setNewOrgName('');
        setShowOrgModal(false);
      }
    } catch (err) {
      setError('Failed to create organization');
    }
  };

  // Create Project
  const handleCreateProject = async (e) => {
    e.preventDefault();
    if (!newProjectName.trim() || !selectedOrg) return;
    try {
      const res = await fetch(`/api/organizations/${selectedOrg.id}/projects`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ name: newProjectName }),
      });
      if (res.ok) {
        const proj = await res.json();
        setProjects([proj, ...projects]);
        setSelectedProject(proj);
        setNewProjectName('');
        setShowProjectModal(false);
      }
    } catch (err) {
      setError('Failed to create project');
    }
  };

  // Create Team
  const handleCreateTeam = async (e) => {
    e.preventDefault();
    if (!newTeamName.trim() || !selectedProject) return;
    try {
      const res = await fetch(`/api/projects/${selectedProject.id}/teams`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ name: newTeamName }),
      });
      if (res.ok) {
        const team = await res.json();
        setTeams([team, ...teams]);
        setSelectedTeam(team);
        setNewTeamName('');
        setShowTeamModal(false);
      }
    } catch (err) {
      setError('Failed to create team');
    }
  };

  // Bulk Member Invitation Handler
  const handleBulkInvite = async (e) => {
    e.preventDefault();
    if (!inviteText.trim() || !selectedTeam) return;

    setInviting(true);
    setError('');
    setInviteSummary(null);

    // Client-side parsing & format validation preview
    const rawEmails = inviteText.split(/[\n,;]+/).map((e) => e.trim()).filter(Boolean);
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    const invalidEmails = rawEmails.filter((e) => !emailRegex.test(e));
    if (invalidEmails.length > 0 && rawEmails.length === invalidEmails.length) {
      setError(`All entered emails have invalid format (e.g. ${invalidEmails[0]})`);
      setInviting(false);
      return;
    }

    try {
      const res = await fetch(`/api/teams/${selectedTeam.id}/members/bulk`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ emails: rawEmails }),
      });

      if (res.ok) {
        const summary = await res.json();
        setInviteSummary(summary);
        setInviteText('');
        fetchMembers();
      } else {
        const errData = await res.json();
        setError(errData.error || 'Failed to submit bulk invitations');
      }
    } catch (err) {
      setError('Network error submitting invitations');
    } finally {
      setInviting(false);
    }
  };

  const copyToClipboard = (text, keyId) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(keyId);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {error && (
        <div className="alert-box alert-error" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <AlertCircle size={18} />
          <span>{error}</span>
          <button
            style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}
            onClick={() => setError('')}
          >
            ✕
          </button>
        </div>
      )}

      {/* Breadcrumb Path Navigation */}
      <div className="breadcrumb-nav">
        <span
          className="breadcrumb-item"
          onClick={() => {
            setDrillLevel('projects');
          }}
        >
          {selectedOrg ? selectedOrg.name : 'Organization'}
        </span>
        {selectedProject && drillLevel !== 'projects' && (
          <>
            <ChevronRight size={14} />
            <span
              className="breadcrumb-item"
              onClick={() => {
                setDrillLevel('teams');
              }}
            >
              {selectedProject.name}
            </span>
          </>
        )}
        {selectedTeam && drillLevel === 'members' && (
          <>
            <ChevronRight size={14} />
            <span style={{ color: 'var(--text-main)' }}>{selectedTeam.name}</span>
          </>
        )}
      </div>

      {/* Canva Target UI Container Box */}
      <div className="canva-card-wrapper">
        {/* LEVEL 1: Organization's Projects View */}
        {drillLevel === 'projects' && (
          <>
            <h2 className="canva-card-title">
              <span className="underline">Your Organization&apos;s Projects</span>
            </h2>

            {projects.length === 0 ? (
              <div className="canva-empty-state">
                <div className="canva-empty-icon">
                  <Folder size={32} />
                </div>
                <div className="canva-empty-title">No Projects Yet</div>
                <div className="canva-empty-desc">
                  This organization doesn&apos;t have any projects. Create your first project to start organizing teams and tracking spend.
                </div>
                <button className="canva-action-btn" onClick={() => setShowProjectModal(true)}>
                  <Plus size={18} /> Create First Project
                </button>
              </div>
            ) : (
              <div className="canva-grid">
                {projects.map((proj) => (
                  <div
                    key={proj.id}
                    className={`canva-item-card ${selectedProject?.id === proj.id ? 'selected' : ''}`}
                    onClick={() => {
                      setSelectedProject(proj);
                      setDrillLevel('teams');
                    }}
                  >
                    {proj.name}
                  </div>
                ))}
              </div>
            )}

            <div className="canva-bottom-actions">
              <button className="canva-action-btn" onClick={() => setShowOrgModal(true)}>
                <Plus size={18} /> Create New Org.
              </button>
              <button className="canva-action-btn" onClick={() => setShowProjectModal(true)}>
                <Plus size={18} /> Create New Project
              </button>
            </div>
          </>
        )}

        {/* LEVEL 2: Project's Teams View */}
        {drillLevel === 'teams' && selectedProject && (
          <>
            <h2 className="canva-card-title">
              <span className="underline">{selectedProject.name}/Teams</span>
            </h2>

            {teams.length === 0 ? (
              <div className="canva-empty-state">
                <div className="canva-empty-icon">
                  <Users size={32} />
                </div>
                <div className="canva-empty-title">No Teams in {selectedProject.name}</div>
                <div className="canva-empty-desc">
                  Create your first team under this project to start inviting employees and generating dedicated BillAI API keys.
                </div>
                <button className="canva-action-btn" onClick={() => setShowTeamModal(true)}>
                  <Plus size={18} /> Create First Team
                </button>
              </div>
            ) : (
              <div className="canva-grid">
                {teams.map((t) => (
                  <div
                    key={t.id}
                    className={`canva-item-card ${selectedTeam?.id === t.id ? 'selected' : ''}`}
                    onClick={() => {
                      setSelectedTeam(t);
                      setDrillLevel('members');
                    }}
                  >
                    {t.name}
                  </div>
                ))}
              </div>
            )}

            <div className="canva-bottom-actions">
              <button
                className="canva-action-btn"
                style={{ background: 'var(--panel-bg)', color: 'var(--text-main)' }}
                onClick={() => setDrillLevel('projects')}
              >
                ← Back to Projects
              </button>
              <button className="canva-action-btn" onClick={() => setShowTeamModal(true)}>
                <Plus size={18} /> Create New Team
              </button>
            </div>
          </>
        )}

        {/* LEVEL 3: Team Members Table View */}
        {drillLevel === 'members' && selectedTeam && (
          <>
            <h2 className="canva-card-title">
              <span className="underline">
                {selectedProject?.name}/Teams/{selectedTeam.name}
              </span>
            </h2>

            <div className="table-container" style={{ marginBottom: 'auto' }}>
              <table className="logs-table">
                <thead>
                  <tr>
                    <th>Employee Email</th>
                    <th>Name</th>
                    <th>Per-Employee key</th>
                    <th>Invite Status</th>
                    <th>Joined</th>
                  </tr>
                </thead>
                <tbody>
                  {members.length === 0 ? (
                    <tr>
                      <td colSpan="5" style={{ textAlign: 'center', padding: '3rem 1rem' }}>
                        <div style={{ color: 'var(--text-muted)', marginBottom: '1rem', fontSize: '0.95rem' }}>
                          No team members added yet to <strong>{selectedTeam.name}</strong>.
                        </div>
                        <button className="canva-action-btn" style={{ fontSize: '0.9rem', padding: '0.5rem 1.25rem' }} onClick={() => setShowInviteModal(true)}>
                          <UserPlus size={16} /> Add Members
                        </button>
                      </td>
                    </tr>
                  ) : (
                    members.map((m) => {
                      const nameHandle = m.email.split('@')[0];
                      return (
                        <tr key={m.id}>
                          <td style={{ fontWeight: 600, color: 'var(--text-main)' }}>{m.email}</td>
                          <td style={{ color: 'var(--text-muted)', textTransform: 'capitalize' }}>{nameHandle}</td>
                          <td className="mono">
                            <span style={{ fontSize: '0.85rem', color: 'var(--accent-cyan)' }}>{m.billai_key}</span>{' '}
                            <button
                              className="copy-key"
                              onClick={() => copyToClipboard(m.billai_key, m.id)}
                              title="Copy API Key"
                            >
                              {copiedKey === m.id ? <Check size={12} color="var(--accent-green)" /> : <Copy size={12} />}
                            </button>
                          </td>
                          <td>
                            <span className={`status-badge ${m.invite_status === 'active' ? 'status-active' : 'status-pending'}`}>
                              {m.invite_status.toUpperCase()}
                            </span>
                          </td>
                          <td className="mono" style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                            {new Date(m.created_at).toLocaleDateString()}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <div className="canva-bottom-actions">
              <button
                className="canva-action-btn"
                style={{ background: 'var(--panel-bg)', color: 'var(--text-main)' }}
                onClick={() => setDrillLevel('teams')}
              >
                ← Back to Teams
              </button>
              <button className="canva-action-btn" onClick={() => setShowInviteModal(true)}>
                <UserPlus size={18} /> Add Members
              </button>
            </div>
          </>
        )}
      </div>

      {/* MODAL 1: Create Organization */}
      {showOrgModal && (
        <div className="modal-overlay" onClick={() => setShowOrgModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Create New Organization</h3>
              <button className="modal-close-btn" onClick={() => setShowOrgModal(false)}>
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleCreateOrg}>
              <div className="form-group">
                <label>Organization Name</label>
                <input
                  type="text"
                  required
                  autoFocus
                  className="form-input"
                  placeholder="e.g. Acme Corp"
                  value={newOrgName}
                  onChange={(e) => setNewOrgName(e.target.value)}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
                <button type="button" className="btn-secondary" onClick={() => setShowOrgModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  Create Organization
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Create Project */}
      {showProjectModal && (
        <div className="modal-overlay" onClick={() => setShowProjectModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Create New Project in {selectedOrg?.name}</h3>
              <button className="modal-close-btn" onClick={() => setShowProjectModal(false)}>
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleCreateProject}>
              <div className="form-group">
                <label>Project Name</label>
                <input
                  type="text"
                  required
                  autoFocus
                  className="form-input"
                  placeholder="e.g. Project-5 or Marketing-App"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
                <button type="button" className="btn-secondary" onClick={() => setShowProjectModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  Create Project
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: Create Team */}
      {showTeamModal && (
        <div className="modal-overlay" onClick={() => setShowTeamModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Create New Team in {selectedProject?.name}</h3>
              <button className="modal-close-btn" onClick={() => setShowTeamModal(false)}>
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleCreateTeam}>
              <div className="form-group">
                <label>Team Name</label>
                <input
                  type="text"
                  required
                  autoFocus
                  className="form-input"
                  placeholder="e.g. Team-E or Frontend-Devs"
                  value={newTeamName}
                  onChange={(e) => setNewTeamName(e.target.value)}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
                <button type="button" className="btn-secondary" onClick={() => setShowTeamModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  Create Team
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: Bulk Add Members */}
      {showInviteModal && (
        <div className="modal-overlay" onClick={() => setShowInviteModal(false)}>
          <div className="modal-card" style={{ maxWidth: '640px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Add Members to {selectedTeam?.name}</h3>
              <button
                className="modal-close-btn"
                onClick={() => {
                  setShowInviteModal(false);
                  setInviteSummary(null);
                }}
              >
                <X size={20} />
              </button>
            </div>

            {inviteSummary ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div
                  className={`alert-box ${inviteSummary.failed === 0 ? 'alert-success' : 'alert-error'}`}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                >
                  {inviteSummary.failed === 0 ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
                  <span>
                    {inviteSummary.succeeded} invited successfully, {inviteSummary.failed} failed
                  </span>
                </div>

                <div style={{ maxHeight: '200px', overflowY: 'auto', background: 'var(--bg-color)', borderRadius: '8px', padding: '0.75rem' }}>
                  {inviteSummary.results.map((res, i) => (
                    <div
                      key={i}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '0.4rem 0',
                        borderBottom: i < inviteSummary.results.length - 1 ? '1px solid var(--panel-border)' : 'none',
                        fontSize: '0.85rem',
                      }}
                    >
                      <span className="mono" style={{ color: 'var(--text-main)' }}>{res.email}</span>
                      {res.status === 'invited' ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={{ color: 'var(--accent-green)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                            <CheckCircle2 size={14} /> Invited
                          </span>
                          {res.inviteUrl && (
                            <button
                              type="button"
                              className="copy-key"
                              onClick={() => copyToClipboard(res.inviteUrl, `inv-${i}`)}
                              title="Copy Direct Invite Link"
                              style={{ padding: '2px 6px', fontSize: '0.75rem' }}
                            >
                              {copiedKey === `inv-${i}` ? 'Copied!' : 'Copy Link'}
                            </button>
                          )}
                        </div>
                      ) : (
                        <span style={{ color: 'var(--accent-red)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                          <XCircle size={14} /> {res.reason}
                        </span>
                      )}
                    </div>
                  ))}
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
                  <button
                    className="btn-primary"
                    onClick={() => {
                      setShowInviteModal(false);
                      setInviteSummary(null);
                    }}
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleBulkInvite}>
                <div className="form-group">
                  <label>Employee Emails (Enter line-by-line or comma-separated)</label>
                  <textarea
                    rows={5}
                    required
                    autoFocus
                    className="form-input"
                    style={{ resize: 'vertical', fontFamily: 'var(--font-mono)' }}
                    placeholder={`alice@company.com\nbob@company.com, charlie@company.com`}
                    value={inviteText}
                    onChange={(e) => setInviteText(e.target.value)}
                  />
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Each invited employee will receive an invite email with their unique <code>X-BillAI-Key</code>.
                  </span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.25rem' }}>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setShowInviteModal(false)}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="btn-primary" disabled={inviting}>
                    <Mail size={16} /> {inviting ? 'Inviting...' : 'Send Invitations'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
