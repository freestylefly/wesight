import http from 'node:http';
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  db,
  now,
  logActivity,
  findIssue,
  findIssueById,
  issueRef,
  parseLabels,
  STATUSES,
  PRIORITIES,
} from './db.mjs';

const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC_DIR = path.join(APP_ROOT, 'public');
const PORT = Number(process.env.TASKBOARD_PORT || 47824);
const HOST = process.env.TASKBOARD_HOST || '127.0.0.1';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function json(res, code, data) {
  const body = JSON.stringify(data);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 1_000_000) {
        reject(new Error('body too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch {
        reject(new Error('invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function issuePublic(issue) {
  return { ...issue, labels: parseLabels(issue.labels), ref: issueRef(issue) };
}

function getIssueOr404(req, res, projectId, number) {
  const issue = findIssue(projectId, number);
  if (!issue) {
    json(res, 404, { error: `issue ${projectId}-${number} not found` });
    return null;
  }
  return issue;
}

// ---------- API handlers ----------

function listProjects(req, res) {
  const projects = db.prepare('SELECT * FROM projects ORDER BY created_at').all();
  const countStmt = db.prepare('SELECT COUNT(*) AS n FROM issues WHERE project_id = ?');
  json(res, 200, {
    projects: projects.map((p) => ({ ...p, issue_count: countStmt.get(p.id).n })),
  });
}

// ---------- 项目自动扫描 ----------

function sanitizeProjectId(name) {
  const ascii = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (ascii && /^[a-z0-9]/.test(ascii)) return ascii;
  let hash = 5381;
  for (let i = 0; i < name.length; i++) hash = ((hash << 5) + hash + name.charCodeAt(i)) >>> 0;
  return `p-${hash.toString(36)}`;
}

function ensureProjectSync({ id, name, workspacePath }) {
  const byPath = workspacePath
    ? db.prepare('SELECT * FROM projects WHERE workspace_path = ?').get(workspacePath)
    : null;
  if (byPath) return { project: byPath, created: false };
  const existing = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
  if (existing) {
    if (workspacePath && workspacePath !== existing.workspace_path) {
      db.prepare('UPDATE projects SET workspace_path = ? WHERE id = ?').run(workspacePath, id);
    }
    return { project: db.prepare('SELECT * FROM projects WHERE id = ?').get(id), created: false };
  }
  db.prepare('INSERT INTO projects (id, name, workspace_path, created_at) VALUES (?, ?, ?, ?)').run(
    id, name || id, workspacePath || '', now()
  );
  return { project: db.prepare('SELECT * FROM projects WHERE id = ?').get(id), created: true };
}

const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'out', 'vendor']);

function scanRoots(roots) {
  const created = [];
  const existing = [];
  const skipped = [];
  for (const root of roots) {
    let entries;
    try {
      entries = readdirSync(root, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) { skipped.push(entry.name); continue; }
      const dirPath = path.join(root, entry.name);
      const id = sanitizeProjectId(entry.name);
      const result = ensureProjectSync({ id, name: entry.name, workspacePath: dirPath });
      (result.created ? created : existing).push(result.project.id);
    }
  }
  return { created, existing, skipped };
}

async function scanProjectsApi(req, res) {
  const body = await readBody(req).catch(() => ({}));
  const home = process.env.HOME || '/Users/yan';
  const roots = Array.isArray(body.roots) && body.roots.length
    ? body.roots
    : [process.env.TASKBOARD_SCAN_ROOT || path.join(home, 'Documents')];
  json(res, 200, scanRoots(roots));
}

async function ensureProject(req, res) {
  const body = await readBody(req);
  let id = String(body.id || '').trim().toLowerCase();
  const workspacePath = String(body.workspacePath || '').trim();
  if (workspacePath) {
    const byPath = db.prepare('SELECT * FROM projects WHERE workspace_path = ?').get(workspacePath);
    if (byPath) return json(res, 200, { project: byPath, created: false });
  }
  if (!id && workspacePath) {
    id = path.basename(workspacePath).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }
  if (!id || !/^[a-z0-9][a-z0-9-]*$/.test(id)) {
    return json(res, 400, { error: '无法推导合法项目 id，请显式传 id' });
  }
  const existing = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
  if (existing) {
    if (workspacePath && workspacePath !== existing.workspace_path) {
      db.prepare('UPDATE projects SET workspace_path = ? WHERE id = ?').run(workspacePath, id);
    }
    return json(res, 200, { project: db.prepare('SELECT * FROM projects WHERE id = ?').get(id), created: false });
  }
  db.prepare(
    'INSERT INTO projects (id, name, workspace_path, created_at) VALUES (?, ?, ?, ?)'
  ).run(id, String(body.name || id) || id, workspacePath, now());
  json(res, 201, { project: db.prepare('SELECT * FROM projects WHERE id = ?').get(id), created: true });
}

async function createProject(req, res) {
  const body = await readBody(req);
  const id = String(body.id || '').trim();
  if (!/^[a-z0-9][a-z0-9-]*$/i.test(id)) {
    return json(res, 400, { error: 'project id 必须是字母/数字/中划线' });
  }
  const exists = db.prepare('SELECT id FROM projects WHERE id = ?').get(id);
  if (exists) return json(res, 409, { error: `project ${id} 已存在` });
  db.prepare(
    'INSERT INTO projects (id, name, workspace_path, created_at) VALUES (?, ?, ?, ?)'
  ).run(id, String(body.name || id), String(body.workspacePath || ''), now());
  json(res, 201, { project: db.prepare('SELECT * FROM projects WHERE id = ?').get(id) });
}

function getBoard(req, res, projectId) {
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
  if (!project) return json(res, 404, { error: `project ${projectId} not found` });
  const issues = db
    .prepare('SELECT * FROM issues WHERE project_id = ? ORDER BY updated_at DESC')
    .all(projectId)
    .map(issuePublic);
  json(res, 200, { project, issues });
}

async function createIssue(req, res, projectId) {
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
  if (!project) return json(res, 404, { error: `project ${projectId} not found` });
  const body = await readBody(req);
  const title = String(body.title || '').trim();
  if (!title) return json(res, 400, { error: 'title is required' });
  const status = STATUSES.includes(body.status) ? body.status : 'todo';
  const priority = PRIORITIES.includes(body.priority) ? body.priority : 'medium';

  const tx = db.prepare(
    `INSERT INTO issues (project_id, number, title, description, status, priority, labels, branch, worktree, session, agent, created_at, updated_at)
     VALUES (?, (SELECT COALESCE(MAX(number), 0) + 1 FROM issues WHERE project_id = ?), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const labels = parseLabels(body.labels).join(',');
  tx.run(
    projectId, projectId, title,
    String(body.description || ''), status, priority, labels,
    String(body.branch || ''), String(body.worktree || ''), String(body.session || ''),
    String(body.agent || ''),
    now(), now()
  );
  const issue = db
    .prepare('SELECT * FROM issues WHERE project_id = ? ORDER BY number DESC LIMIT 1')
    .get(projectId);
  logActivity(issue.id, projectId, 'created', `创建议题，状态 ${status}`, body.actor || 'user');
  json(res, 201, { issue: issuePublic(issue) });
}

async function updateIssue(req, res, projectId, number) {
  const issue = getIssueOr404(req, res, projectId, number);
  if (!issue) return;
  const body = await readBody(req);
  const expected = Number(body.expectedVersion ?? issue.version);
  if (expected !== issue.version) {
    return json(res, 409, {
      error: `version conflict: expected ${issue.version}`,
      issue: issuePublic(issue),
    });
  }
  const fields = {};
  if (body.title !== undefined) fields.title = String(body.title).trim() || issue.title;
  if (body.description !== undefined) fields.description = String(body.description);
  if (body.priority !== undefined && PRIORITIES.includes(body.priority)) fields.priority = body.priority;
  if (body.labels !== undefined) fields.labels = parseLabels(body.labels).join(',');
  if (body.branch !== undefined) fields.branch = String(body.branch);
  if (body.worktree !== undefined) fields.worktree = String(body.worktree);
  if (body.session !== undefined) fields.session = String(body.session);
  if (body.agent !== undefined) fields.agent = String(body.agent);
  const sets = Object.keys(fields).map((k) => `${k} = ?`).join(', ');
  const values = Object.values(fields);
  db.prepare(
    `UPDATE issues SET ${sets || 'title = title'}, version = version + 1, updated_at = ? WHERE id = ?`
  ).run(...values, now(), issue.id);
  const updated = findIssueById(issue.id);
  const changed = Object.keys(fields).join(', ') || 'nothing';
  logActivity(issue.id, projectId, 'updated', `更新字段: ${changed}`, body.actor || 'user');
  json(res, 200, { issue: issuePublic(updated) });
}

async function moveIssue(req, res, projectId, number) {
  const issue = getIssueOr404(req, res, projectId, number);
  if (!issue) return;
  const body = await readBody(req);
  const to = String(body.status || body.to || '');
  if (!STATUSES.includes(to)) {
    return json(res, 400, { error: `status 必须是 ${STATUSES.join(' / ')}` });
  }
  const expected = Number(body.expectedVersion ?? issue.version);
  if (expected !== issue.version) {
    return json(res, 409, {
      error: `version conflict: expected ${issue.version}`,
      issue: issuePublic(issue),
    });
  }
  const session = body.session !== undefined ? String(body.session) : issue.session;
  const agent = body.agent !== undefined && String(body.agent) ? String(body.agent) : issue.agent;
  db.prepare(
    'UPDATE issues SET status = ?, session = ?, agent = ?, version = version + 1, updated_at = ? WHERE id = ?'
  ).run(to, session, agent, now(), issue.id);
  logActivity(
    issue.id, projectId, 'moved',
    `${issue.status} -> ${to}${agent ? `（${agent}${body.session ? ` · ${body.session}` : ''}）` : ''}`,
    agent || body.actor || 'user'
  );
  json(res, 200, { issue: issuePublic(findIssueById(issue.id)) });
}

function getIssueDetail(req, res, projectId, number) {
  const issue = getIssueOr404(req, res, projectId, number);
  if (!issue) return;
  const comments = db
    .prepare('SELECT * FROM comments WHERE issue_id = ? ORDER BY created_at')
    .all(issue.id);
  const activities = db
    .prepare('SELECT * FROM activities WHERE issue_id = ? ORDER BY created_at DESC')
    .all(issue.id);
  json(res, 200, { issue: issuePublic(issue), comments, activities });
}

async function addComment(req, res, projectId, number) {
  const issue = getIssueOr404(req, res, projectId, number);
  if (!issue) return;
  const body = await readBody(req);
  const text = String(body.body || '').trim();
  if (!text) return json(res, 400, { error: 'body is required' });
  const author = String(body.author || 'user');
  const info = db.prepare(
    'INSERT INTO comments (issue_id, author, body, created_at, handled) VALUES (?, ?, ?, ?, ?)'
  ).run(issue.id, author, text, now(), author === 'user' ? 0 : 1);
  db.prepare('UPDATE issues SET updated_at = ? WHERE id = ?').run(now(), issue.id);
  logActivity(issue.id, projectId, 'commented', text.slice(0, 60), author);
  const comment = db.prepare('SELECT * FROM comments WHERE id = ?').get(info.lastInsertRowid);
  json(res, 201, { comment });
}

function getInbox(req, res, projectId) {
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
  if (!project) return json(res, 404, { error: `project ${projectId} not found` });
  const messages = db
    .prepare("SELECT * FROM messages WHERE project_id = ? AND status = 'pending' ORDER BY created_at")
    .all(projectId);
  const issueStmt = db.prepare('SELECT project_id, number FROM issues WHERE id = ?');
  const comments = db
    .prepare("SELECT c.* FROM comments c JOIN issues i ON c.issue_id = i.id WHERE i.project_id = ? AND c.handled = 0 ORDER BY c.created_at")
    .all(projectId)
    .map((c) => {
      const issue = issueStmt.get(c.issue_id);
      return { ...c, ref: issue ? issueRef(issue) : null };
    });
  json(res, 200, {
    messages: messages.map((m) => {
      const issue = m.issue_id ? issueStmt.get(m.issue_id) : null;
      return { ...m, ref: issue ? issueRef(issue) : null };
    }),
    comments,
  });
}

async function handleComment(req, res, commentId) {
  const comment = db.prepare('SELECT * FROM comments WHERE id = ?').get(commentId);
  if (!comment) return json(res, 404, { error: `comment ${commentId} not found` });
  const body = await readBody(req);
  const issue = findIssueById(comment.issue_id);
  const agent = String(body.agent || 'agent');
  if (body.body) {
    db.prepare(
      'INSERT INTO comments (issue_id, author, body, created_at, handled) VALUES (?, ?, ?, ?, 1)'
    ).run(comment.issue_id, agent, String(body.body), now());
    db.prepare('UPDATE issues SET updated_at = ? WHERE id = ?').run(now(), comment.issue_id);
    logActivity(comment.issue_id, issue.project_id, 'replied', `回复评论 #${commentId}: ${String(body.body).slice(0, 50)}`, agent);
  } else {
    db.prepare('UPDATE issues SET updated_at = ? WHERE id = ?').run(now(), comment.issue_id);
    logActivity(comment.issue_id, issue.project_id, 'handled', `处理评论 #${commentId}`, agent);
  }
  db.prepare('UPDATE comments SET handled = 1 WHERE id = ?').run(commentId);
  json(res, 200, { ok: true });
}

function listBranches(req, res, projectId) {
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
  if (!project) return json(res, 404, { error: `project ${projectId} not found` });
  if (!project.workspace_path || !existsSync(project.workspace_path)) {
    return json(res, 200, { branches: [] });
  }
  execFile(
    'git',
    ['-C', project.workspace_path, 'branch', '--format=%(refname:short)'],
    { timeout: 5000 },
    (err, stdout) => {
      if (err) return json(res, 200, { branches: [] });
      json(res, 200, { branches: stdout.split('\n').map((s) => s.trim()).filter(Boolean) });
    }
  );
}

// ---------- 留言收件箱 ----------

async function sendMessage(req, res, projectId) {
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
  if (!project) return json(res, 404, { error: `project ${projectId} not found` });
  const body = await readBody(req);
  const text = String(body.body || '').trim();
  if (!text) return json(res, 400, { error: 'body is required' });
  let issueId = null;
  if (body.issueNumber) {
    const issue = findIssue(projectId, Number(body.issueNumber));
    if (!issue) return json(res, 404, { error: `issue ${projectId}-${body.issueNumber} not found` });
    issueId = issue.id;
  }
  const info = db.prepare(
    'INSERT INTO messages (project_id, issue_id, body, created_at) VALUES (?, ?, ?, ?)'
  ).run(projectId, issueId, text, now());
  const msg = db.prepare('SELECT * FROM messages WHERE id = ?').get(info.lastInsertRowid);
  json(res, 201, { message: msg });
}

function listMessages(req, res, projectId, url) {
  const status = url.searchParams.get('status');
  const rows = status
    ? db.prepare('SELECT * FROM messages WHERE project_id = ? AND status = ? ORDER BY created_at DESC').all(projectId, status)
    : db.prepare('SELECT * FROM messages WHERE project_id = ? ORDER BY created_at DESC').all(projectId);
  const issueStmt = db.prepare('SELECT project_id, number FROM issues WHERE id = ?');
  json(res, 200, {
    messages: rows.map((m) => {
      const issue = m.issue_id ? issueStmt.get(m.issue_id) : null;
      return { ...m, ref: issue ? issueRef(issue) : null };
    }),
  });
}

async function replyMessage(req, res, messageId) {
  const msg = db.prepare('SELECT * FROM messages WHERE id = ?').get(messageId);
  if (!msg) return json(res, 404, { error: `message ${messageId} not found` });
  const body = await readBody(req);
  const text = String(body.body || '').trim();
  if (!text) return json(res, 400, { error: 'body is required' });
  db.prepare('UPDATE messages SET reply = ?, status = ?, replied_at = ? WHERE id = ?').run(
    text, 'replied', now(), messageId
  );
  const agent = String(body.agent || 'agent');
  if (msg.issue_id) {
    logActivity(msg.issue_id, msg.project_id, 'replied', `回复留言: ${text.slice(0, 50)}`, agent);
  }
  json(res, 200, { message: db.prepare('SELECT * FROM messages WHERE id = ?').get(messageId) });
}

// ---------- 数据总览 ----------

function getStats(req, res, projectId) {
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
  if (!project) return json(res, 404, { error: `project ${projectId} not found` });
  const issues = db.prepare('SELECT * FROM issues WHERE project_id = ?').all(projectId);
  const byStatus = Object.fromEntries(STATUSES.map((s) => [s, 0]));
  const byPriority = Object.fromEntries(PRIORITIES.map((p) => [p, 0]));
  for (const i of issues) {
    byStatus[i.status] = (byStatus[i.status] ?? 0) + 1;
    byPriority[i.priority] = (byPriority[i.priority] ?? 0) + 1;
  }
  const done = byStatus.done || 0;
  const total = issues.length;
  const agentContributions = db
    .prepare("SELECT agent, COUNT(*) AS count FROM issues WHERE project_id = ? AND status = 'done' AND agent != '' GROUP BY agent ORDER BY count DESC")
    .all(projectId);
  const activities = db
    .prepare('SELECT * FROM activities WHERE project_id = ? ORDER BY created_at DESC LIMIT 15')
    .all(projectId)
    .map((a) => {
      const issue = findIssueById(a.issue_id);
      return { ...a, ref: issue ? issueRef(issue) : null, title: issue?.title || '' };
    });
  const pendingMessages = db
    .prepare("SELECT COUNT(*) AS n FROM messages WHERE project_id = ? AND status = 'pending'")
    .get(projectId).n;
  const pendingComments = db
    .prepare("SELECT COUNT(*) AS n FROM comments c JOIN issues i ON c.issue_id = i.id WHERE i.project_id = ? AND c.handled = 0")
    .get(projectId).n;
  const THREE_DAYS = 3 * 24 * 3600 * 1000;
  const stale = issues
    .filter((i) => i.status === 'in_progress' && Date.now() - new Date(i.updated_at).getTime() > THREE_DAYS)
    .map((i) => ({ ...issuePublic(i), stale_days: Math.floor((Date.now() - new Date(i.updated_at).getTime()) / 86400000) }));
  const todayDone = issues.filter(
    (i) => i.status === 'done' && new Date(i.updated_at).toDateString() === new Date().toDateString()
  ).length;
  json(res, 200, {
    total, done,
    doneRate: total ? Math.round((done / total) * 100) : 0,
    active: total - done,
    todayDone,
    byStatus, byPriority, agentContributions, activities, stale,
    inbox: { messages: pendingMessages, comments: pendingComments, total: pendingMessages + pendingComments },
    inReview: issues.filter((i) => i.status === 'in_review').map(issuePublic),
    inProgress: issues.filter((i) => i.status === 'in_progress').map(issuePublic),
  });
}

// ---------- routing ----------

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const parts = url.pathname.split('/').filter(Boolean);

  try {
    if (url.pathname === '/api/health') return json(res, 200, { ok: true, now: now() });

    if (parts[0] === 'api' && parts[1] === 'projects') {
      const projectId = parts[2];
      if (!projectId) {
        if (req.method === 'GET') return listProjects(req, res);
        if (req.method === 'POST') return await createProject(req, res);
      }
      if (projectId === 'ensure' && !parts[3] && req.method === 'POST') {
        return await ensureProject(req, res);
      }
      if (projectId === 'scan' && !parts[3] && req.method === 'POST') {
        return await scanProjectsApi(req, res);
      }
      if (parts[3] === 'issues') {
        const number = Number(parts[4]);
        if (!parts[4]) {
          if (req.method === 'POST') return await createIssue(req, res, projectId);
          if (req.method === 'GET') return getBoard(req, res, projectId);
        } else if (parts[5] === 'move' && req.method === 'POST') {
          return await moveIssue(req, res, projectId, number);
        } else if (parts[5] === 'comments') {
          if (req.method === 'POST') return await addComment(req, res, projectId, number);
        } else if (!parts[5]) {
          if (req.method === 'GET') return getIssueDetail(req, res, projectId, number);
          if (req.method === 'PATCH' || req.method === 'PUT') {
            return await updateIssue(req, res, projectId, number);
          }
        }
      } else if (parts[3] === 'branches' && req.method === 'GET') {
        return listBranches(req, res, projectId);
      } else if (parts[3] === 'messages') {
        if (!parts[4] && req.method === 'POST') return await sendMessage(req, res, projectId);
        if (!parts[4] && req.method === 'GET') return listMessages(req, res, projectId, url);
      } else if (parts[3] === 'inbox' && req.method === 'GET') {
        return getInbox(req, res, projectId);
      } else if (parts[3] === 'stats' && req.method === 'GET') {
        return getStats(req, res, projectId);
      }
    }

    if (parts[0] === 'api' && parts[1] === 'messages' && parts[3] === 'reply' && req.method === 'POST') {
      return await replyMessage(req, res, Number(parts[2]));
    }
    if (parts[0] === 'api' && parts[1] === 'comments' && parts[3] === 'handle' && req.method === 'POST') {
      return await handleComment(req, res, Number(parts[2]));
    }

    if (req.method === 'GET' && !url.pathname.startsWith('/api')) {
      let filePath = path.join(PUBLIC_DIR, url.pathname === '/' ? 'index.html' : url.pathname);
      if (!filePath.startsWith(PUBLIC_DIR)) return json(res, 403, { error: 'forbidden' });
      if (existsSync(filePath) && statSync(filePath).isFile()) {
        res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
        return res.end(readFileSync(filePath));
      }
      // SPA fallback
      res.writeHead(200, { 'Content-Type': MIME['.html'] });
      return res.end(readFileSync(path.join(PUBLIC_DIR, 'index.html')));
    }

    json(res, 404, { error: `no route: ${req.method} ${url.pathname}` });
  } catch (err) {
    json(res, 500, { error: err.message });
  }
});

// ---------- 超时自动验收 ----------
// 待验收超过 TASKBOARD_AUTO_ACCEPT_HOURS 小时（默认 24，设 0 关闭）自动转已完成。
// 判定时间以最近一次转入 in_review 的活动记录为准，无记录时退化为 updated_at。
const AUTO_ACCEPT_HOURS = Number(process.env.TASKBOARD_AUTO_ACCEPT_HOURS ?? 24);
const AUTO_ACCEPT_INTERVAL_SEC = Number(process.env.TASKBOARD_AUTO_ACCEPT_INTERVAL_SEC || 3600);

function sweepAutoAccept() {
  if (!AUTO_ACCEPT_HOURS) return;
  const cutoff = new Date(Date.now() - AUTO_ACCEPT_HOURS * 3600_000).toISOString();
  const rows = db.prepare(`
    SELECT i.*, (
      SELECT MAX(a.created_at) FROM activities a
      WHERE a.issue_id = i.id AND a.action = 'moved' AND a.detail LIKE '%-> in_review%'
    ) AS review_since
    FROM issues i WHERE i.status = 'in_review'
  `).all();
  for (const issue of rows) {
    const since = issue.review_since || issue.updated_at;
    if (since > cutoff) continue;
    db.prepare('UPDATE issues SET status = ?, version = version + 1, updated_at = ? WHERE id = ?')
      .run('done', now(), issue.id);
    db.prepare('INSERT INTO comments (issue_id, author, body, created_at, handled) VALUES (?, ?, ?, ?, 1)')
      .run(issue.id, 'auto-accept', `超过 ${AUTO_ACCEPT_HOURS} 小时未验收，系统自动转为已完成。如有异议可重新打开。`, now());
    logActivity(issue.id, issue.project_id, 'moved', 'in_review -> done（超时自动验收）', 'auto-accept');
    console.log(`[wesight-taskboard] auto-accept: ${issueRef(issue)}`);
  }
}

server.listen(PORT, HOST, () => {
  console.log(`[wesight-taskboard] listening on http://${HOST}:${PORT}`);
  // 启动时自动扫描项目目录（幂等）
  try {
    const home = process.env.HOME || '/Users/yan';
    const root = process.env.TASKBOARD_SCAN_ROOT || path.join(home, 'Documents');
    const result = scanRoots([root]);
    if (result.created.length) console.log(`[wesight-taskboard] auto-scan 新建项目: ${result.created.join(', ')}`);
  } catch (err) {
    console.error('[wesight-taskboard] auto-scan 失败:', err.message);
  }
  // 超时自动验收：启动时先扫一次，之后按间隔扫描
  if (AUTO_ACCEPT_HOURS) {
    try { sweepAutoAccept(); } catch (err) { console.error('[wesight-taskboard] auto-accept 失败:', err.message); }
    setInterval(() => {
      try { sweepAutoAccept(); } catch (err) { console.error('[wesight-taskboard] auto-accept 失败:', err.message); }
    }, AUTO_ACCEPT_INTERVAL_SEC * 1000).unref();
    console.log(`[wesight-taskboard] auto-accept 已启用: 待验收超 ${AUTO_ACCEPT_HOURS}h 自动转已完成（每 ${AUTO_ACCEPT_INTERVAL_SEC}s 扫描）`);
  }
});
