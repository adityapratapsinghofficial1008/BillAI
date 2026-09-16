const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const db = require('./db');
const groqAdapter = require('./adapters/groq');
const { sendVerificationEmail, sendInviteEmail } = require('./lib/mailer');
const { authMiddleware, JWT_SECRET } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Helper function to generate unique BillAI Key
function generateBillAIKey() {
  return 'bk_emp_' + crypto.randomBytes(16).toString('hex');
}

// ---------------------------------------------------------------------------
// 1. GATEWAY PROXY ROUTE: POST /v1/groq/chat/completions
// ---------------------------------------------------------------------------
app.post('/v1/groq/chat/completions', async (req, res) => {
  const billaiKey = req.header('X-BillAI-Key');
  const authHeader = req.header('Authorization');

  // Step 1: Validate BillAI Key
  if (!billaiKey) {
    return res.status(401).json({ error: { message: 'Missing X-BillAI-Key header' } });
  }

  let teamMember = null;
  let teamId = null;

  try {
    // Lookup member by billai_key
    const memberRes = await db.query(
      `SELECT tm.id AS team_member_id, tm.team_id, tm.invite_status, t.name AS team_name
       FROM team_members tm
       JOIN teams t ON tm.team_id = t.id
       WHERE tm.billai_key = $1`,
      [billaiKey]
    );

    if (memberRes.rows.length > 0) {
      teamMember = memberRes.rows[0];
      teamId = teamMember.team_id;
    } else {
      // Fallback lookup: V0 team billai_key compatibility
      const teamRes = await db.query('SELECT id, name FROM teams WHERE billai_key = $1', [billaiKey]);
      if (teamRes.rows.length === 0) {
        return res.status(401).json({ error: { message: 'Invalid X-BillAI-Key' } });
      }
      teamId = teamRes.rows[0].id;
    }
  } catch (err) {
    console.error('[BillAI Auth Error] Database error on key lookup:', err.message);
    return res.status(500).json({ error: { message: 'Internal server error authenticating key' } });
  }

  // Step 2: Forward Request to Groq API
  const targetUrl = groqAdapter.forwardUrl;
  const startTime = Date.now();
  let response;
  let responseText = '';
  let statusCode = 500;

  try {
    const headers = {
      'Content-Type': 'application/json',
    };
    if (authHeader) {
      headers['Authorization'] = authHeader;
    }

    response = await fetch(targetUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(req.body),
    });

    statusCode = response.status;
    responseText = await response.text();
  } catch (proxyError) {
    console.error('[BillAI Proxy Error] Failed to communicate with Groq API:', proxyError.message);
    return res.status(502).json({ error: { message: 'Failed to communicate with AI provider', details: proxyError.message } });
  }

  const latencyMs = Date.now() - startTime;

  // Step 3: Fail-Open Usage Logging & Cost Calculation
  try {
    let parsedBody = null;
    try {
      parsedBody = JSON.parse(responseText);
    } catch (_) {
      // Body may not be JSON if provider returned a non-JSON error
    }

    const { promptTokens, completionTokens, model } = groqAdapter.extractUsage(parsedBody);
    let costUsd = null;

    if (model && model !== 'unknown') {
      const priceRes = await db.query(
        'SELECT input_price_per_1k, output_price_per_1k FROM pricing WHERE provider = $1 AND model = $2',
        [groqAdapter.provider, model]
      );

      if (priceRes.rows.length > 0) {
        const { input_price_per_1k, output_price_per_1k } = priceRes.rows[0];
        const inputCost = (promptTokens / 1000) * parseFloat(input_price_per_1k);
        const outputCost = (completionTokens / 1000) * parseFloat(output_price_per_1k);
        costUsd = inputCost + outputCost;
      } else {
        console.warn(`[BillAI Warning] No pricing found in database for provider: ${groqAdapter.provider}, model: ${model}`);
      }
    }

    // Insert metadata record into usage_logs
    await db.query(
      `INSERT INTO usage_logs 
        (team_id, team_member_id, provider, model, input_tokens, output_tokens, cost_usd, latency_ms, status_code)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        teamId,
        teamMember ? teamMember.team_member_id : null,
        groqAdapter.provider,
        model,
        promptTokens,
        completionTokens,
        costUsd,
        latencyMs,
        statusCode,
      ]
    );

    // Update invite status to 'active' on first successful gateway request
    if (teamMember && teamMember.invite_status === 'pending' && statusCode >= 200 && statusCode < 300) {
      await db.query(`UPDATE team_members SET invite_status = 'active' WHERE id = $1`, [teamMember.team_member_id]);
      console.log(`[BillAI Invite] Team member ${teamMember.team_member_id} invite_status marked as ACTIVE`);
    }
  } catch (loggingError) {
    // Fail-open guarantee: Log internal error without crashing or delaying response
    console.error('[BillAI Fail-Open Log Error] Error logging usage metadata:', loggingError.message);
  }

  // Step 4: Return original Groq response to client completely unmodified
  res.status(statusCode);
  const contentType = response.headers.get('content-type');
  if (contentType) {
    res.setHeader('Content-Type', contentType);
  }
  return res.send(responseText);
});

// ---------------------------------------------------------------------------
// 2. ADMIN AUTHENTICATION ENDPOINTS
// ---------------------------------------------------------------------------

// POST /api/auth/register
app.post('/api/auth/register', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    const existing = await db.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase().trim()]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'An account with this email address already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    const userRes = await db.query(
      `INSERT INTO users (email, password_hash, email_verified, verification_token, verification_token_expires)
       VALUES ($1, $2, false, $3, $4)
       RETURNING id, email, email_verified, created_at`,
      [email.toLowerCase().trim(), passwordHash, verificationToken, expiresAt]
    );

    // Dispatch verification email
    await sendVerificationEmail(email, verificationToken);

    res.json({
      message: 'Registration successful! Please check your email for the verification link.',
      user: userRes.rows[0],
    });
  } catch (err) {
    console.error('[Register Error]:', err);
    res.status(500).json({ error: 'Failed to register admin account' });
  }
});

// GET /api/auth/verify
app.get('/api/auth/verify', async (req, res) => {
  const { token } = req.query;
  if (!token) {
    return res.status(400).json({ error: 'Verification token is required' });
  }

  try {
    const userRes = await db.query(
      `SELECT id, email FROM users 
       WHERE verification_token = $1 AND verification_token_expires > NOW()`,
      [token]
    );

    if (userRes.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid or expired verification token' });
    }

    const userId = userRes.rows[0].id;
    await db.query(
      `UPDATE users SET email_verified = true, verification_token = NULL, verification_token_expires = NULL WHERE id = $1`,
      [userId]
    );

    res.json({ message: 'Email address successfully verified! You can now log in.' });
  } catch (err) {
    console.error('[Verify Error]:', err);
    res.status(500).json({ error: 'Failed to verify email address' });
  }
});

// POST /api/auth/login
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    const userRes = await db.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase().trim()]);
    if (userRes.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid email or password' });
    }

    const user = userRes.rows[0];
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(400).json({ error: 'Invalid email or password' });
    }

    if (!user.email_verified) {
      return res.status(403).json({ error: 'Please check your email and verify your account before logging in.' });
    }

    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
      },
    });
  } catch (err) {
    console.error('[Login Error]:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// ---------------------------------------------------------------------------
// 3. ORGANIZATION / PROJECT / TEAM MANAGEMENT ENDPOINTS (JWT Protected)
// ---------------------------------------------------------------------------

// POST /api/organizations
app.post('/api/organizations', authMiddleware, async (req, res) => {
  const { name } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'Organization name is required' });
  }

  try {
    const result = await db.query(
      `INSERT INTO organizations (name, owner_user_id) VALUES ($1, $2) RETURNING *`,
      [name.trim(), req.user.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('[Create Org Error]:', err);
    res.status(500).json({ error: 'Failed to create organization' });
  }
});

// GET /api/organizations
app.get('/api/organizations', authMiddleware, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT * FROM organizations WHERE owner_user_id = $1 ORDER BY created_at DESC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('[List Orgs Error]:', err);
    res.status(500).json({ error: 'Failed to list organizations' });
  }
});

// POST /api/organizations/:orgId/projects
app.post('/api/organizations/:orgId/projects', authMiddleware, async (req, res) => {
  const { orgId } = req.params;
  const { name } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'Project name is required' });
  }

  try {
    // Verify Org Ownership
    const orgCheck = await db.query(`SELECT id FROM organizations WHERE id = $1 AND owner_user_id = $2`, [orgId, req.user.id]);
    if (orgCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Organization not found or access denied' });
    }

    const result = await db.query(
      `INSERT INTO projects (org_id, name) VALUES ($1, $2) RETURNING *`,
      [orgId, name.trim()]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('[Create Project Error]:', err);
    res.status(500).json({ error: 'Failed to create project' });
  }
});

// GET /api/organizations/:orgId/projects
app.get('/api/organizations/:orgId/projects', authMiddleware, async (req, res) => {
  const { orgId } = req.params;
  try {
    const orgCheck = await db.query(`SELECT id FROM organizations WHERE id = $1 AND owner_user_id = $2`, [orgId, req.user.id]);
    if (orgCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Organization not found or access denied' });
    }

    const result = await db.query(
      `SELECT * FROM projects WHERE org_id = $1 ORDER BY created_at DESC`,
      [orgId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('[List Projects Error]:', err);
    res.status(500).json({ error: 'Failed to list projects' });
  }
});

// POST /api/projects/:projectId/teams
app.post('/api/projects/:projectId/teams', authMiddleware, async (req, res) => {
  const { projectId } = req.params;
  const { name } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'Team name is required' });
  }

  try {
    // Verify Ownership through Project -> Org
    const projCheck = await db.query(
      `SELECT p.id FROM projects p 
       JOIN organizations o ON p.org_id = o.id 
       WHERE p.id = $1 AND o.owner_user_id = $2`,
      [projectId, req.user.id]
    );
    if (projCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Project not found or access denied' });
    }

    const dummyKey = 'legacy_team_key_' + crypto.randomBytes(8).toString('hex');
    const result = await db.query(
      `INSERT INTO teams (project_id, name, billai_key) VALUES ($1, $2, $3) RETURNING *`,
      [projectId, name.trim(), dummyKey]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('[Create Team Error]:', err);
    res.status(500).json({ error: 'Failed to create team' });
  }
});

// GET /api/projects/:projectId/teams
app.get('/api/projects/:projectId/teams', authMiddleware, async (req, res) => {
  const { projectId } = req.params;
  try {
    const projCheck = await db.query(
      `SELECT p.id FROM projects p 
       JOIN organizations o ON p.org_id = o.id 
       WHERE p.id = $1 AND o.owner_user_id = $2`,
      [projectId, req.user.id]
    );
    if (projCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Project not found or access denied' });
    }

    const result = await db.query(
      `SELECT * FROM teams WHERE project_id = $1 ORDER BY created_at DESC`,
      [projectId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('[List Teams Error]:', err);
    res.status(500).json({ error: 'Failed to list teams' });
  }
});

// ---------------------------------------------------------------------------
// 4. TEAM MEMBER INVITES (JWT Protected)
// ---------------------------------------------------------------------------

// POST /api/teams/:teamId/members/bulk
app.post('/api/teams/:teamId/members/bulk', authMiddleware, async (req, res) => {
  const { teamId } = req.params;
  const { emails } = req.body; // array of strings or single string with newline/comma

  if (!emails || (Array.isArray(emails) && emails.length === 0)) {
    return res.status(400).json({ error: 'At least one employee email is required' });
  }

  let rawList = [];
  if (Array.isArray(emails)) {
    rawList = emails;
  } else if (typeof emails === 'string') {
    rawList = emails.split(/[\n,;]+/).map((e) => e.trim()).filter(Boolean);
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  try {
    // Verify Ownership through Team -> Project -> Org
    const teamCheck = await db.query(
      `SELECT t.id, t.name AS team_name FROM teams t 
       JOIN projects p ON t.project_id = p.id 
       JOIN organizations o ON p.org_id = o.id 
       WHERE t.id = $1 AND o.owner_user_id = $2`,
      [teamId, req.user.id]
    );
    if (teamCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Team not found or access denied' });
    }

    const team = teamCheck.rows[0];

    // Fetch existing members of this team to check duplicates
    const existingRes = await db.query(`SELECT email FROM team_members WHERE team_id = $1`, [teamId]);
    const existingSet = new Set(existingRes.rows.map((r) => r.email.toLowerCase()));

    const results = [];
    let succeeded = 0;
    let failed = 0;

    for (const rawEmail of rawList) {
      const cleanEmail = rawEmail.toLowerCase().trim();

      if (!cleanEmail) continue;

      if (!emailRegex.test(cleanEmail)) {
        failed++;
        results.push({ email: rawEmail, status: 'failed', reason: 'Invalid email format' });
        continue;
      }

      if (existingSet.has(cleanEmail)) {
        failed++;
        results.push({ email: cleanEmail, status: 'failed', reason: 'Already invited to this team' });
        continue;
      }

      try {
        const billaiKey = generateBillAIKey();
        const inviteToken = crypto.randomBytes(32).toString('hex');

        const memberRes = await db.query(
          `INSERT INTO team_members (team_id, email, billai_key, invite_status, invite_token)
           VALUES ($1, $2, $3, 'pending', $4)
           RETURNING *`,
          [teamId, cleanEmail, billaiKey, inviteToken]
        );

        existingSet.add(cleanEmail);
        succeeded++;

        // Send invite email asynchronously
        sendInviteEmail(cleanEmail, billaiKey, team.team_name, inviteToken).catch((err) => {
          console.error(`[Bulk Invite Mail Warning] Failed to send email to ${cleanEmail}:`, err.message);
        });

        results.push({ email: cleanEmail, status: 'invited', member: memberRes.rows[0] });
      } catch (err) {
        failed++;
        results.push({ email: cleanEmail, status: 'failed', reason: err.message || 'Database insert error' });
      }
    }

    res.json({
      total: rawList.length,
      succeeded,
      failed,
      results,
    });
  } catch (err) {
    console.error('[Bulk Invite Member Error]:', err);
    res.status(500).json({ error: 'Failed to bulk invite team members' });
  }
});

// GET /api/team-members/accept
app.get('/api/team-members/accept', async (req, res) => {
  const { token } = req.query;
  if (!token) {
    return res.status(400).json({ error: 'Invite token is required' });
  }

  try {
    const memberRes = await db.query(
      `SELECT tm.id, tm.email, tm.billai_key, tm.invite_status, t.name AS team_name 
       FROM team_members tm
       JOIN teams t ON tm.team_id = t.id
       WHERE tm.invite_token = $1`,
      [token]
    );

    if (memberRes.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid or expired invite token' });
    }

    const member = memberRes.rows[0];

    if (member.invite_status !== 'active') {
      await db.query(
        `UPDATE team_members SET invite_status = 'active' WHERE id = $1`,
        [member.id]
      );
    }

    res.json({
      message: 'Invitation accepted successfully! Your account is now active.',
      email: member.email,
      team_name: member.team_name,
      billai_key: member.billai_key,
    });
  } catch (err) {
    console.error('[Accept Invite Error]:', err);
    res.status(500).json({ error: 'Failed to accept invitation' });
  }
});


// GET /api/teams/:teamId/members
app.get('/api/teams/:teamId/members', authMiddleware, async (req, res) => {
  const { teamId } = req.params;
  try {
    const teamCheck = await db.query(
      `SELECT t.id FROM teams t 
       JOIN projects p ON t.project_id = p.id 
       JOIN organizations o ON p.org_id = o.id 
       WHERE t.id = $1 AND o.owner_user_id = $2`,
      [teamId, req.user.id]
    );
    if (teamCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Team not found or access denied' });
    }

    const result = await db.query(
      `SELECT id, team_id, email, billai_key, invite_status, created_at 
       FROM team_members WHERE team_id = $1 ORDER BY created_at DESC`,
      [teamId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('[List Members Error]:', err);
    res.status(500).json({ error: 'Failed to list team members' });
  }
});

// ---------------------------------------------------------------------------
// 5. DASHBOARD ENDPOINTS
// ---------------------------------------------------------------------------

// GET /api/dashboard/summary
app.get('/api/dashboard/summary', async (req, res) => {
  const { project_id, org_id } = req.query;

  try {
    let whereClause = '';
    const params = [];

    if (project_id) {
      params.push(project_id);
      whereClause = `WHERE u.team_id IN (SELECT id FROM teams WHERE project_id = $1)`;
    } else if (org_id) {
      params.push(org_id);
      whereClause = `WHERE u.team_id IN (SELECT t.id FROM teams t JOIN projects p ON t.project_id = p.id WHERE p.org_id = $1)`;
    }

    const summaryQuery = `
      SELECT 
        COALESCE(SUM(CASE WHEN u.created_at >= date_trunc('month', NOW()) THEN u.cost_usd ELSE 0 END), 0) AS total_spend_this_month,
        COUNT(CASE WHEN u.cost_usd IS NULL THEN 1 END) AS missing_pricing_count,
        COUNT(*) AS total_requests
      FROM usage_logs u
      ${whereClause};
    `;
    const result = await db.query(summaryQuery, params);
    const row = result.rows[0] || { total_spend_this_month: 0, missing_pricing_count: 0, total_requests: 0 };

    res.json({
      total_spend_this_month: parseFloat(row.total_spend_this_month),
      missing_pricing_count: parseInt(row.missing_pricing_count, 10),
      total_requests: parseInt(row.total_requests, 10),
    });
  } catch (err) {
    console.error('[Dashboard Summary Error]:', err);
    res.status(500).json({ error: 'Failed to fetch dashboard summary' });
  }
});

// GET /api/dashboard/by-team
app.get('/api/dashboard/by-team', async (req, res) => {
  const { project_id, org_id } = req.query;

  try {
    let whereClause = '';
    const params = [];

    if (project_id) {
      params.push(project_id);
      whereClause = `WHERE t.project_id = $1`;
    } else if (org_id) {
      params.push(org_id);
      whereClause = `WHERE t.project_id IN (SELECT id FROM projects WHERE org_id = $1)`;
    }

    const query = `
      SELECT 
        t.id AS team_id,
        t.name AS team_name,
        COALESCE(SUM(u.cost_usd), 0) AS total_spend,
        COUNT(u.id) AS request_count
      FROM teams t
      LEFT JOIN usage_logs u ON t.id = u.team_id
      ${whereClause}
      GROUP BY t.id, t.name
      ORDER BY total_spend DESC;
    `;
    const result = await db.query(query, params);
    const formatted = result.rows.map((row) => ({
      team_id: row.team_id,
      team_name: row.team_name,
      total_spend: parseFloat(row.total_spend),
      request_count: parseInt(row.request_count, 10),
    }));
    res.json(formatted);
  } catch (err) {
    console.error('[Dashboard Spend By Team Error]:', err);
    res.status(500).json({ error: 'Failed to fetch spend by team' });
  }
});

// GET /api/dashboard/by-member
app.get('/api/dashboard/by-member', async (req, res) => {
  const { project_id, org_id } = req.query;

  try {
    let whereClause = '';
    const params = [];

    if (project_id) {
      params.push(project_id);
      whereClause = `WHERE t.project_id = $1`;
    } else if (org_id) {
      params.push(org_id);
      whereClause = `WHERE t.project_id IN (SELECT id FROM projects WHERE org_id = $1)`;
    }

    const query = `
      SELECT 
        tm.id AS member_id,
        tm.email AS member_email,
        tm.invite_status,
        t.name AS team_name,
        COALESCE(SUM(u.cost_usd), 0) AS total_spend,
        COUNT(u.id) AS request_count
      FROM team_members tm
      JOIN teams t ON tm.team_id = t.id
      LEFT JOIN usage_logs u ON tm.id = u.team_member_id
      ${whereClause}
      GROUP BY tm.id, tm.email, tm.invite_status, t.name
      ORDER BY total_spend DESC;
    `;
    const result = await db.query(query, params);
    const formatted = result.rows.map((row) => ({
      member_id: row.member_id,
      member_email: row.member_email,
      invite_status: row.invite_status,
      team_name: row.team_name,
      total_spend: parseFloat(row.total_spend),
      request_count: parseInt(row.request_count, 10),
    }));
    res.json(formatted);
  } catch (err) {
    console.error('[Dashboard Spend By Member Error]:', err);
    res.status(500).json({ error: 'Failed to fetch spend by member' });
  }
});

// GET /api/dashboard/logs
app.get('/api/dashboard/logs', async (req, res) => {
  const { project_id, org_id } = req.query;

  try {
    let whereClause = '';
    const params = [];

    if (project_id) {
      params.push(project_id);
      whereClause = `WHERE t.project_id = $1`;
    } else if (org_id) {
      params.push(org_id);
      whereClause = `WHERE t.project_id IN (SELECT id FROM projects WHERE org_id = $1)`;
    }

    const query = `
      SELECT 
        u.id,
        u.created_at,
        t.name AS team_name,
        tm.email AS member_email,
        u.provider,
        u.model,
        u.input_tokens,
        u.output_tokens,
        u.cost_usd,
        u.latency_ms,
        u.status_code
      FROM usage_logs u
      LEFT JOIN teams t ON u.team_id = t.id
      LEFT JOIN team_members tm ON u.team_member_id = tm.id
      ${whereClause}
      ORDER BY u.created_at DESC
      LIMIT 500;
    `;
    const result = await db.query(query, params);
    const logs = result.rows.map((row) => ({
      ...row,
      team_name: row.team_name || 'Unassigned',
      member_email: row.member_email || 'System / Legacy',
      cost_usd: row.cost_usd === null ? null : parseFloat(row.cost_usd),
    }));
    res.json(logs);
  } catch (err) {
    console.error('[Dashboard Logs Error]:', err);
    res.status(500).json({ error: 'Failed to fetch usage logs' });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 BillAI Gateway listening on http://localhost:${PORT}`);
});
