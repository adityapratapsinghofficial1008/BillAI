import React, { useState, useEffect } from 'react';
import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import {
  DollarSign,
  AlertTriangle,
  Activity,
  RefreshCw,
  Search,
  Filter,
  ArrowUpDown,
  Building2,
  PieChart,
  LogOut,
  User,
  Folder,
  Layers,
  Sun,
  Moon,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Check,
} from 'lucide-react';
import Auth from './components/Auth';
import OrgManager from './components/OrgManager';
import AcceptInvite from './components/AcceptInvite';

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem('billai_token') || '');
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('billai_user') || 'null');
    } catch (_) {
      return null;
    }
  });

  // Custom Sidebar & Theme Toggle State
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem('billai_theme') || 'dark');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('billai_theme', theme);
  }, [theme]);

  const path = window.location.pathname;

  const [activeTab, setActiveTab] = useState('dashboard'); // 'dashboard' | 'hierarchy'
  const [spendViewMode, setSpendViewMode] = useState('team'); // 'team' | 'employee'

  // Multi-Tenant Hierarchy Context
  const [orgs, setOrgs] = useState([]);
  const [selectedOrg, setSelectedOrg] = useState(null);
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(null);
  const [projectDropdownOpen, setProjectDropdownOpen] = useState(false);

  const [summary, setSummary] = useState({
    total_spend_this_month: 0,
    missing_pricing_count: 0,
    total_requests: 0,
  });
  const [teamSpend, setTeamSpend] = useState([]);
  const [memberSpend, setMemberSpend] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);

  // Table Filters & Sorting
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedModel, setSelectedModel] = useState('ALL');
  const [sortField, setSortField] = useState('created_at');
  const [sortOrder, setSortOrder] = useState('desc');

  const authHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };

  const handleLoginSuccess = (newToken, newUser) => {
    setToken(newToken);
    setUser(newUser);
    localStorage.setItem('billai_token', newToken);
    localStorage.setItem('billai_user', JSON.stringify(newUser));
  };

  const handleLogout = () => {
    setToken('');
    setUser(null);
    localStorage.removeItem('billai_token');
    localStorage.removeItem('billai_user');
  };

  // Fetch Organizations on login
  const fetchOrgs = async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/organizations', { headers: authHeaders });
      if (res.ok) {
        const data = await res.json();
        setOrgs(data);
        if (data.length > 0 && !selectedOrg) {
          setSelectedOrg(data[0]);
        }
      }
    } catch (err) {
      console.error('Failed to fetch organizations:', err);
    }
  };

  useEffect(() => {
    fetchOrgs();
  }, [token]);

  // Fetch Projects when selectedOrg changes
  useEffect(() => {
    if (!selectedOrg || !token) {
      setProjects([]);
      setSelectedProject(null);
      return;
    }
    fetch(`/api/organizations/${selectedOrg.id}/projects`, { headers: authHeaders })
      .then((res) => res.json())
      .then((data) => {
        setProjects(data);
        if (data.length > 0) {
          setSelectedProject(data[0]);
        } else {
          setSelectedProject(null);
        }
      })
      .catch((err) => console.error('Failed to fetch projects:', err));
  }, [selectedOrg, token]);

  // Fetch Dashboard Data scoped by selected project or organization
  const fetchDashboardData = async () => {
    if (!token) return;
    setLoading(true);

    let queryParam = '';
    if (selectedProject) {
      queryParam = `?project_id=${selectedProject.id}`;
    } else if (selectedOrg) {
      queryParam = `?org_id=${selectedOrg.id}`;
    }

    try {
      const [sumRes, teamRes, memberRes, logsRes] = await Promise.all([
        fetch(`/api/dashboard/summary${queryParam}`, { headers: authHeaders }),
        fetch(`/api/dashboard/by-team${queryParam}`, { headers: authHeaders }),
        fetch(`/api/dashboard/by-member${queryParam}`, { headers: authHeaders }),
        fetch(`/api/dashboard/logs${queryParam}`, { headers: authHeaders }),
      ]);

      if (sumRes.ok) setSummary(await sumRes.json());
      if (teamRes.ok) setTeamSpend(await teamRes.json());
      if (memberRes.ok) setMemberSpend(await memberRes.json());
      if (logsRes.ok) setLogs(await logsRes.json());
    } catch (err) {
      console.error('Failed to fetch dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    if (!token) return;
    setLoading(true);
    try {
      await Promise.all([
        fetchOrgs(),
        fetchDashboardData(),
      ]);
    } catch (err) {
      console.error('Failed to refresh data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      fetchDashboardData();
    }
  }, [token, selectedOrg, selectedProject]);

  // Route 1: Employee Invite Acceptance Page
  if (path.startsWith('/accept-invite')) {
    return (
      <div className="dashboard-container">
        <AcceptInvite />
      </div>
    );
  }

  // Route 2: Admin Email Verification Page (or if user not logged in)
  if (path.startsWith('/verify') || !token) {
    return (
      <div className="dashboard-container">
        <Auth onLoginSuccess={handleLoginSuccess} />
      </div>
    );
  }

  // Filter and Sort Logs
  const uniqueModels = ['ALL', ...Array.from(new Set(logs.map((l) => l.model)))];

  const filteredLogs = logs.filter((log) => {
    const searchLower = searchTerm.toLowerCase();
    const matchesSearch =
      log.team_name.toLowerCase().includes(searchLower) ||
      (log.member_email && log.member_email.toLowerCase().includes(searchLower)) ||
      log.provider.toLowerCase().includes(searchLower) ||
      log.model.toLowerCase().includes(searchLower);
    const matchesModel = selectedModel === 'ALL' || log.model === selectedModel;
    return matchesSearch && matchesModel;
  });

  const sortedLogs = [...filteredLogs].sort((a, b) => {
    let valA = a[sortField];
    let valB = b[sortField];

    if (valA === null || valA === undefined) valA = -1;
    if (valB === null || valB === undefined) valB = -1;

    if (typeof valA === 'string') {
      return sortOrder === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
    }
    return sortOrder === 'asc' ? valA - valB : valB - valA;
  });

  const handleSort = (field) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  const chartData = spendViewMode === 'team' ? teamSpend : memberSpend;
  const chartXKey = spendViewMode === 'team' ? 'team_name' : 'member_email';

  // Dynamic bar colors palette matching Canva reference image
  const barColors = ['#3b82f6', '#a855f7', '#f59e0b', '#facc15', '#f43f5e', '#ec4899', '#06b6d4', '#10b981'];

  return (
    <div className="app-layout">
      {/* Custom Left Sidebar */}
      <aside className={`custom-sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
        <div className="sidebar-header">
          {!sidebarCollapsed && (
            <span className="sidebar-brand-title">BillAI</span>
          )}
          <button
            className="sidebar-toggle-btn"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            title={sidebarCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
          >
            {sidebarCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </button>
        </div>

        <nav className="sidebar-menu">
          <button
            className={`sidebar-item ${activeTab === 'dashboard' ? 'active' : ''}`}
            onClick={() => setActiveTab('dashboard')}
            title="Spend Dashboard"
          >
            <PieChart size={20} />
            {!sidebarCollapsed && <span>Spend Dashboard</span>}
          </button>

          <button
            className={`sidebar-item ${activeTab === 'hierarchy' ? 'active' : ''}`}
            onClick={() => setActiveTab('hierarchy')}
            title="Org's Hierarchy"
          >
            <Building2 size={20} />
            {!sidebarCollapsed && <span>Org&apos;s Hierarchy</span>}
          </button>
        </nav>

        {!sidebarCollapsed && (
          <div className="sidebar-org-section">
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)' }}>
              ACTIVE ORGANIZATION
            </span>
            <select
              className="select-filter"
              style={{ width: '100%', fontSize: '0.85rem', padding: '0.4rem 0.6rem' }}
              value={selectedOrg ? selectedOrg.id : ''}
              onChange={(e) => {
                const found = orgs.find((o) => o.id === e.target.value);
                if (found) setSelectedOrg(found);
              }}
            >
              {orgs.length === 0 ? (
                <option value="">No Organizations</option>
              ) : (
                orgs.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))
              )}
            </select>
          </div>
        )}

        <div className="sidebar-footer">
          {user && !sidebarCollapsed && (
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: '0 0.25rem' }} title={user.email}>
              <User size={14} color="var(--accent-cyan)" style={{ display: 'inline', marginRight: '4px' }} />
              {user.email}
            </div>
          )}

          <button
            className="sidebar-item"
            style={{ padding: '0.5rem 0.75rem' }}
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
          >
            {theme === 'dark' ? <Sun size={18} color="#facc15" /> : <Moon size={18} color="#38bdf8" />}
            {!sidebarCollapsed && <span>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>}
          </button>

          <button
            className="sidebar-item"
            style={{ padding: '0.5rem 0.75rem' }}
            onClick={handleRefresh}
            disabled={loading}
            title="Refresh Data"
          >
            <RefreshCw size={18} className={loading ? 'spin' : ''} />
            {!sidebarCollapsed && <span>Refresh</span>}
          </button>

          <button
            className="sidebar-item"
            style={{ padding: '0.5rem 0.75rem', color: 'var(--accent-red)' }}
            onClick={handleLogout}
            title="Log Out"
          >
            <LogOut size={18} />
            {!sidebarCollapsed && <span>Log Out</span>}
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="main-content">
        {/* Header Navigation Bar */}
        <header className="header" style={{ marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
            <h1 style={{ fontSize: '2.2rem', fontFamily: 'var(--font-display)', fontWeight: 700, color: 'var(--header-title-color)', letterSpacing: '-0.02em' }}>
              {activeTab === 'dashboard' ? 'Spend Dashboard' : "Organization's Hierarchy"}
            </h1>
          </div>

          <div className="header-actions">
            <div className="canva-nav-bar">
              <button
                className={`canva-pill-btn ${activeTab === 'dashboard' ? 'active' : ''}`}
                onClick={() => setActiveTab('dashboard')}
              >
                <PieChart size={16} /> Dashboard
              </button>

              <button
                className={`canva-pill-btn ${activeTab === 'hierarchy' ? 'active' : ''}`}
                onClick={() => setActiveTab('hierarchy')}
              >
                <Building2 size={16} /> Hierarchy
              </button>
            </div>
          </div>
        </header>

      {/* Main Content Area */}
      {activeTab === 'hierarchy' ? (
        <OrgManager
          token={token}
          orgs={orgs}
          setOrgs={setOrgs}
          selectedOrg={selectedOrg}
          setSelectedOrg={setSelectedOrg}
          projects={projects}
          setProjects={setProjects}
          selectedProject={selectedProject}
          setSelectedProject={setSelectedProject}
          onRefreshAll={fetchOrgs}
        />
      ) : (
        <>
          {/* Org / Project Context Filter Bar */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'var(--panel-bg)',
              border: '1px solid var(--panel-border)',
              borderRadius: '12px',
              padding: '0.85rem 1.25rem',
              marginBottom: '1.5rem',
              flexWrap: 'wrap',
              gap: '1rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-muted)', letterSpacing: '0.05em' }}>
                PROJECT FILTER:
              </span>

              <div style={{ position: 'relative' }}>
                <button
                  type="button"
                  className="custom-dropdown-trigger"
                  onClick={() => setProjectDropdownOpen(!projectDropdownOpen)}
                >
                  <Folder size={16} color="var(--accent-cyan)" />
                  <span>
                    {selectedProject
                      ? selectedProject.name
                      : `All Projects in ${selectedOrg ? selectedOrg.name : 'Organization'}`}
                  </span>
                  <ChevronDown
                    size={16}
                    color="var(--text-muted)"
                    style={{
                      transition: 'transform 0.2s ease',
                      transform: projectDropdownOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                    }}
                  />
                </button>

                {projectDropdownOpen && (
                  <>
                    <div
                      style={{ position: 'fixed', inset: 0, zIndex: 99 }}
                      onClick={() => setProjectDropdownOpen(false)}
                    />
                    <div className="custom-dropdown-menu">
                      <div className="dropdown-menu-header">SELECT PROJECT</div>

                      <div
                        className={`dropdown-menu-item ${!selectedProject ? 'active' : ''}`}
                        onClick={() => {
                          setSelectedProject(null);
                          setProjectDropdownOpen(false);
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                          <Layers size={16} />
                          <span>All Projects in {selectedOrg ? selectedOrg.name : 'Organization'}</span>
                        </div>
                        {!selectedProject && <Check size={16} color="var(--accent-cyan)" />}
                      </div>

                      {projects.map((p) => {
                        const isSelected = selectedProject?.id === p.id;
                        return (
                          <div
                            key={p.id}
                            className={`dropdown-menu-item ${isSelected ? 'active' : ''}`}
                            onClick={() => {
                              setSelectedProject(p);
                              setProjectDropdownOpen(false);
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                              <Folder size={16} />
                              <span>{p.name}</span>
                            </div>
                            {isSelected && <Check size={16} color="var(--accent-cyan)" />}
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            </div>

            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Viewing spend for:{' '}
              <strong style={{ color: 'var(--accent-cyan)' }}>
                {selectedProject ? selectedProject.name : selectedOrg ? `${selectedOrg.name} (All Projects)` : 'All Organizations'}
              </strong>
            </div>
          </div>

          {/* Summary Cards matching Canva layout */}
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-label">Total Spend (This Month)</div>
              <div className="stat-value mono" style={{ color: 'var(--accent-cyan)' }}>
                ${summary.total_spend_this_month.toFixed(6)}
              </div>
              <div className="stat-meta">
                <DollarSign size={14} /> Calculated from employee usage logs
              </div>
            </div>

            <div className={`stat-card ${summary.missing_pricing_count > 0 ? 'warning-card' : ''}`}>
              <div className="stat-label">Unpriced Logs Count</div>
              <div className="stat-value mono" style={{ color: summary.missing_pricing_count > 0 ? 'var(--accent-orange)' : 'var(--text-main)' }}>
                {summary.missing_pricing_count}
              </div>
              <div className="stat-meta">
                <AlertTriangle size={14} /> Logs missing pricing schema (stored as NULL cost)
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-label">Total Proxied Requests</div>
              <div className="stat-value mono" style={{ color: 'var(--accent-purple)' }}>
                {summary.total_requests.toLocaleString()}
              </div>
              <div className="stat-meta">
                <Activity size={14} /> Calculated from employee usage logs
              </div>
            </div>
          </div>

          {/* Bar Chart Section matching Canva visual layout */}
          <div className="chart-section">
            <div className="section-title">
              <span style={{ fontSize: '1.1rem', fontWeight: 700 }}>
                Spend Breakdown ({spendViewMode === 'team' ? 'Team-Level Rollup' : 'Per-Employee Breakdown'})
              </span>
              <div className="view-toggle">
                <button
                  className={`toggle-btn ${spendViewMode === 'team' ? 'active' : ''}`}
                  onClick={() => setSpendViewMode('team')}
                >
                  Team View
                </button>
                <button
                  className={`toggle-btn ${spendViewMode === 'employee' ? 'active' : ''}`}
                  onClick={() => setSpendViewMode('employee')}
                >
                  Per-Employee
                </button>
              </div>
            </div>

            {chartData.length === 0 ? (
              <div className="canva-empty-state" style={{ padding: '2.5rem 1rem', background: 'transparent', border: '1px dashed #30363d' }}>
                <Activity size={36} color="var(--text-muted)" style={{ marginBottom: '0.75rem' }} />
                <div className="canva-empty-title">No Usage Logs Recorded</div>
                <div className="canva-empty-desc">
                  No requests have been routed through the BillAI Gateway for this project yet. Send LLM requests using your team member API keys to track live spend.
                </div>
              </div>
            ) : (
              <div style={{ width: '100%', height: 320 }}>
                <ResponsiveContainer>
                  <BarChart data={chartData} margin={{ top: 20, right: 30, left: 35, bottom: 25 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--panel-border)" vertical={false} />
                    <XAxis
                      dataKey={chartXKey}
                      stroke="var(--text-muted)"
                      tick={{ fill: 'var(--text-main)', fontSize: 12, fontWeight: 600 }}
                      dy={10}
                    />
                    <YAxis
                      width={100}
                      stroke="var(--text-muted)"
                      tick={{ fill: 'var(--text-muted)', fontSize: 12, fontWeight: 500 }}
                      tickFormatter={(val) => `$${val}`}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'var(--panel-bg)',
                        borderColor: 'var(--panel-border)',
                        borderRadius: '10px',
                        color: 'var(--text-main)',
                        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)',
                        padding: '0.75rem 1rem',
                      }}
                      itemStyle={{
                        color: 'var(--text-main)',
                        fontWeight: 600,
                        fontSize: '0.9rem',
                      }}
                      labelStyle={{
                        color: 'var(--accent-cyan)',
                        fontWeight: 700,
                        fontSize: '0.95rem',
                        marginBottom: '0.25rem',
                      }}
                      formatter={(value) => [`$${parseFloat(value).toFixed(6)}`, 'Total Spend']}
                    />
                    <Bar dataKey="total_spend" radius={[12, 12, 0, 0]}>
                      {chartData.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={barColors[index % barColors.length]}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Raw Usage Logs Table Section */}
          <div className="table-section">
            <div className="section-title">
              <span style={{ fontSize: '1.4rem', fontFamily: 'var(--font-display)', fontWeight: 700 }}>Raw Usage Logs</span>
            </div>

            {/* Table Search and Filters */}
            <div className="table-controls">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1 }}>
                <Search size={16} color="var(--text-muted)" />
                <input
                  type="text"
                  placeholder="Search team, employee email, provider, or model..."
                  className="search-input"
                  style={{ width: '100%' }}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Filter size={16} color="var(--text-muted)" />
                <select
                  className="select-filter"
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                >
                  {uniqueModels.map((m) => (
                    <option key={m} value={m}>
                      {m === 'ALL' ? 'All Models' : m}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Logs Table */}
            <div className="table-container">
              <table className="logs-table">
                <thead>
                  <tr>
                    <th onClick={() => handleSort('created_at')}>
                      Date & Time <ArrowUpDown size={12} />
                    </th>
                    <th onClick={() => handleSort('team_name')}>
                      Team <ArrowUpDown size={12} />
                    </th>
                    <th onClick={() => handleSort('member_email')}>
                      Employee Email <ArrowUpDown size={12} />
                    </th>
                    <th onClick={() => handleSort('provider')}>Provider</th>
                    <th onClick={() => handleSort('model')}>Model</th>
                    <th onClick={() => handleSort('input_tokens')}>
                      Input Tokens <ArrowUpDown size={12} />
                    </th>
                    <th onClick={() => handleSort('output_tokens')}>
                      Output Tokens <ArrowUpDown size={12} />
                    </th>
                    <th onClick={() => handleSort('cost_usd')}>
                      Cost (USD) <ArrowUpDown size={12} />
                    </th>
                    <th onClick={() => handleSort('latency_ms')}>
                      Latency <ArrowUpDown size={12} />
                    </th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedLogs.length === 0 ? (
                    <tr>
                      <td colSpan="10" style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>
                        No usage logs found matching filters.
                      </td>
                    </tr>
                  ) : (
                    sortedLogs.map((log) => (
                      <tr key={log.id}>
                        <td className="mono" style={{ color: 'var(--text-muted)' }}>
                          {new Date(log.created_at).toLocaleString()}
                        </td>
                        <td style={{ fontWeight: 600 }}>{log.team_name}</td>
                        <td style={{ color: 'var(--accent-cyan)' }}>{log.member_email}</td>
                        <td>
                          <span style={{ textTransform: 'uppercase', fontSize: '0.75rem', fontWeight: 600, color: 'var(--accent-cyan)' }}>
                            {log.provider}
                          </span>
                        </td>
                        <td className="mono">{log.model}</td>
                        <td className="mono">{log.input_tokens.toLocaleString()}</td>
                        <td className="mono">{log.output_tokens.toLocaleString()}</td>
                        <td className="mono" style={{ fontWeight: 600 }}>
                          {log.cost_usd === null || log.cost_usd === undefined ? (
                            <span className="null-cost">—</span>
                          ) : (
                            `$${log.cost_usd.toFixed(6)}`
                          )}
                        </td>
                        <td className="mono">{log.latency_ms} ms</td>
                        <td>
                          <span className={`status-badge ${log.status_code === 200 ? 'status-200' : 'status-error'}`}>
                            {log.status_code}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
      </main>
    </div>
  );
}
